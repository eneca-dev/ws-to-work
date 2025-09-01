const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');

async function syncObjects(stats, offset = 0, limit = 3) {
  try {
    const supaProjects = await supabase.getProjectsWithExternalId();
    const existingObjects = await supabase.getObjects();
    
    // ⚡ ОПТИМИЗАЦИЯ: получаем wsProjects ОДИН раз для всех проектов
    const wsProjects = await worksection.getProjectsWithSyncTags();
    
    // Применяем offset и limit для пагинации
    const paginatedProjects = supaProjects.slice(offset, offset + limit);
    logger.warning(`⚠️ Objects: Processing projects ${offset + 1}-${offset + paginatedProjects.length} of ${supaProjects.length} total`);
    
    for (const project of paginatedProjects) {
      logger.info(`📦 Syncing objects for project: ${project.project_name}`);
      
      // Читаем стадии заново для каждого проекта (они могли быть созданы в syncStages)
      const existingStages = await supabase.getStages();
      
      // Находим данные проекта из уже полученного списка
      const wsProject = wsProjects.find(p => 
        p.id && p.id.toString() === project.external_id.toString()
      );
      
      if (!wsProject) {
        logger.warning(`Project not found in Worksection: ${project.project_name}`);
        continue;
      }
      
      // Определяем тип синхронизации проекта
      const syncType = worksection.determineProjectSyncType(wsProject);
      logger.info(`📦 Project "${project.project_name}" sync type: ${syncType}`);
      
      // Определяем стадию проекта
      let projectStage = null;
      if (wsProject && wsProject.tags) {
        // Ищем метку стадии в проекте
        for (const [tagId, tagName] of Object.entries(wsProject.tags)) {
          if (tagName && tagName.includes('Стадия')) {
            // Ищем стадию ДЛЯ ЭТОГО ПРОЕКТА с этим tag ID
            projectStage = existingStages.find(stage => 
              stage.stage_project_id === project.project_id && 
              stage.external_id === tagId
            );
            
            if (projectStage) {
              logger.info(`Found stage for project ${project.project_name}: ${tagName}`);
              break;
            }
          }
        }
      }
      
      if (!projectStage) {
        logger.warning(`No stage found for project: ${project.project_name}. Skipping objects.`);
        continue;
      }
      
      // Логика зависит от типа синхронизации
      if (syncType === 'os') {
        // OS проекты: создаем объект-заглушку с именем проекта
        logger.info(`📦 OS Project: Creating placeholder object for project ${project.project_name}`);
        
        const placeholderExternalId = `${project.external_id}_${projectStage.external_id}_placeholder`;
        
        // Проверяем существующий объект-заглушку
        const existingPlaceholder = existingObjects.find(obj => 
          obj.external_id === placeholderExternalId && 
          obj.external_source === 'worksection-os' &&
          obj.object_stage_id === projectStage.stage_id
        );
        
        if (!existingPlaceholder) {
          // Создаем объект-заглушку
          const placeholderObject = {
            object_name: project.project_name,
            object_description: `Объект-заглушка для OS проекта: ${project.project_name}`,
            object_stage_id: projectStage.stage_id,
            external_id: placeholderExternalId,
            external_source: 'worksection-os'
          };
          
          try {
            const createdObject = await supabase.upsertObjectByKey(
              project.project_id,
              projectStage.stage_id,
              'worksection-os',
              placeholderExternalId,
              {
                object_name: project.project_name,
                object_description: `Объект-заглушка для OS проекта: ${project.project_name}`
              }
            );
            
            if (createdObject) {
              logger.success(`✅ Created OS placeholder object: ${project.project_name} in stage ${projectStage.stage_name}`);
              stats.objects.created++;
              
              if (!stats.detailed_report) stats.detailed_report = { actions: [] };
              stats.detailed_report.actions.push({
                type: 'object',
                action: 'created',
                name: project.project_name + ' (placeholder)',
                stage: projectStage.stage_name,
                project: project.project_name,
                external_id: placeholderExternalId,
                sync_type: 'os'
              });
            }
          } catch (error) {
            logger.error(`Failed to create OS placeholder object ${project.project_name}: ${error.message}`);
            stats.objects.errors++;
          }
        } else {
          logger.info(`✅ OS placeholder object already exists: ${project.project_name}`);
          stats.objects.unchanged++;
        }
        
      } else {
        // Стандартные проекты: используем существующую логику с task groups
        logger.info(`📦 Standard Project: Processing task groups for ${project.project_name}`);
        
        // Получаем задачи проекта из Worksection
        const wsTasks = await worksection.getProjectTasks(project.external_id);
        
        // Фильтруем Task Groups (задачи с подзадачами) и не начинающиеся с "!"
        const taskGroups = wsTasks.filter(task => 
          task.child && task.child.length > 0 && !task.name.startsWith('!')
        );
        
        logger.info(`Found ${taskGroups.length} task groups for project ${project.project_name}`);
      
      for (const taskGroup of taskGroups) {
        if (taskGroup.status !== 'active') {
          logger.info(`🚫 Skipping inactive task group: ${taskGroup.name}`);
          continue;
        }
        
        // Проверяем существующий объект В ПРАВИЛЬНОЙ СТАДИИ
        const existingObject = existingObjects.find(obj => 
          obj.external_id === taskGroup.id.toString() && 
          obj.external_source === 'worksection' &&
          obj.object_stage_id === projectStage.stage_id  // Объект должен быть в правильной стадии!
        );
        
        // Проверяем есть ли объект в других стадиях (неправильных)
        const objectInWrongStage = existingObjects.find(obj => 
          obj.external_id === taskGroup.id.toString() && 
          obj.external_source === 'worksection' &&
          obj.object_stage_id !== projectStage.stage_id  // Объект в неправильной стадии
        );
        
        if (existingObject) {
          logger.info(`✅ Object already exists in correct stage: ${taskGroup.name}`);
          continue;
        }
        
        if (objectInWrongStage) {
          // Перемещаем объект в правильную стадию
          logger.info(`🔄 Moving object to correct stage: ${taskGroup.name}`);
          
          const updateData = {
            object_stage_id: projectStage.stage_id,
            object_name: taskGroup.name,  // Обновляем название на всякий случай
            object_description: taskGroup.text || '',
            external_updated_at: new Date().toISOString()
          };
          
          try {
            await supabase.updateObject(objectInWrongStage.object_id, updateData);
            logger.success(`✅ Moved object: ${taskGroup.name} to stage ${projectStage.stage_name}`);
            stats.objects.updated++;
            
            if (!stats.detailed_report) stats.detailed_report = { actions: [] };
            stats.detailed_report.actions.push({
              type: 'object',
              action: 'moved',
              name: taskGroup.name,
              stage: projectStage.stage_name,
              project: project.project_name,
              external_id: taskGroup.id.toString()
            });
          } catch (error) {
            logger.error(`Failed to move object ${taskGroup.name}: ${error.message}`);
            stats.objects.errors++;
          }
          continue;
        }
        
        // Создаем новый объект и привязываем к найденной стадии проекта
        const newObjectData = {
          object_name: taskGroup.name,
          object_description: taskGroup.text || ''
        };
        
        try {
          const createdObject = await supabase.upsertObjectByKey(
            project.project_id,
            projectStage.stage_id,
            'worksection',
            taskGroup.id.toString(),
            newObjectData
          );
          
          if (createdObject) {
            logger.success(`✅ Created object: ${taskGroup.name} in stage ${projectStage.stage_name}`);
            stats.objects.created++;
            
            if (!stats.detailed_report) stats.detailed_report = { actions: [] };
            stats.detailed_report.actions.push({
              type: 'object',
              action: 'created',
              name: taskGroup.name,
              stage: projectStage.stage_name,
              project: project.project_name,
              external_id: taskGroup.id.toString()
            });
          }
        } catch (error) {
          logger.error(`Failed to create object ${taskGroup.name}: ${error.message}`);
          stats.objects.errors++;
        }
      }
      } // конец else блока для стандартных проектов
    }
    
    logger.success(`✅ Objects sync completed`);
    
  } catch (error) {
    logger.error(`Objects sync error: ${error.message}`);
    throw error;
  }
}

async function syncSections(stats, offset = 0, limit = 3) {
  try {
    const supaProjects = await supabase.getProjectsWithExternalId();
    const existingObjects = await supabase.getObjects();
    const existingSections = await supabase.getSections();
    
    // ⚡ ОПТИМИЗАЦИЯ: получаем wsProjects ОДИН раз для всех проектов
    const wsProjects = await worksection.getProjectsWithSyncTags();
    
    // Применяем offset и limit для пагинации
    const paginatedProjects = supaProjects.slice(offset, offset + limit);
    logger.warning(`⚠️ Sections: Processing projects ${offset + 1}-${offset + paginatedProjects.length} of ${supaProjects.length} total`);
    
    for (const project of paginatedProjects) {
      logger.info(`📑 Syncing sections for project: ${project.project_name}`);
      
      // Находим данные проекта из уже полученного списка
      const wsProject = wsProjects.find(p => 
        p.id && p.id.toString() === project.external_id.toString()
      );
      
      if (!wsProject) {
        logger.warning(`Project not found in Worksection: ${project.project_name}`);
        continue;
      }
      
      // Определяем тип синхронизации проекта
      const syncType = worksection.determineProjectSyncType(wsProject);
      logger.info(`📑 Project "${project.project_name}" sync type: ${syncType}`);
      
      // Получаем задачи проекта из Worksection
      const wsTasks = await worksection.getProjectTasks(project.external_id);
      
      // Логика зависит от типа синхронизации
      if (syncType === 'os') {
        // OS проекты: обрабатываем ВСЕ активные задачи как разделы (не подзадачи)
        logger.info(`📑 OS Project: Processing all tasks as sections for ${project.project_name}`);
        
        // Фильтруем ВСЕ активные задачи (не только task groups), исключая начинающиеся с "!"
        const allTasks = wsTasks.filter(task => 
          task.status === 'active' && !task.name.startsWith('!')
        );
        
        logger.info(`Found ${allTasks.length} active tasks for OS project ${project.project_name}`);
        
        // Находим объект-заглушку для этого проекта
        const placeholderObject = existingObjects.find(obj => 
          obj.external_source === 'worksection-os' &&
          obj.external_id.includes(project.external_id + '_') &&
          obj.external_id.includes('_placeholder')
        );
        
        if (!placeholderObject) {
          logger.warning(`OS placeholder object not found for project: ${project.project_name}`);
          continue;
        }
        
        // Обрабатываем задачи как разделы
        for (const wsTask of allTasks) {
          // Ищем существующий раздел по ключу (проект + источник + внешний id)
          const existing = existingSections.find(s =>
            s.section_project_id === project.project_id &&
            s.external_source === 'worksection-os' &&
            s.external_id && s.external_id.toString() === wsTask.id.toString()
          );
          
          if (existing) {
            // Проверяем нужно ли обновление
            const responsible = await findUserByEmail(wsTask.user_to?.email, stats);
            
            const hasChanges = 
              existing.section_name !== wsTask.name ||
              existing.section_description !== (wsTask.text || null) ||
              existing.section_start_date !== (wsTask.date_start || null) ||
              existing.section_end_date !== (wsTask.date_end || null) ||
              existing.section_object_id !== placeholderObject.object_id ||
              (responsible && existing.section_responsible !== responsible.user_id) ||
              (!responsible && existing.section_responsible !== null);
            
            if (hasChanges) {
              // Обновляем существующий раздел
              const updateData = {
                section_name: wsTask.name,
                section_description: wsTask.text || null,
                section_object_id: placeholderObject.object_id,
                section_project_id: project.project_id,
                section_start_date: wsTask.date_start || null,
                section_end_date: wsTask.date_end || null,
                external_updated_at: new Date().toISOString()
              };
              
              if (responsible) {
                updateData.section_responsible = responsible.user_id;
                logger.info(`👤 Assigned responsible to OS section "${wsTask.name}": ${responsible.first_name} ${responsible.last_name}`);
              } else if (existing.section_responsible !== null) {
                updateData.section_responsible = null;
                logger.info(`👤 Removed responsible from OS section "${wsTask.name}"`);
              }
              
              await supabase.updateSection(existing.section_id, updateData);
              stats.sections.updated++;
              
              // Добавляем в отчет
              if (!stats.detailed_report) stats.detailed_report = { actions: [] };
              stats.detailed_report.actions.push({
                action: 'updated',
                type: 'section',
                id: wsTask.id,
                name: wsTask.name,
                object: placeholderObject.object_name,
                project: project.project_name,
                timestamp: new Date().toISOString(),
                sync_type: 'os',
                responsible_assigned: !!responsible,
                responsible_info: responsible ? `${responsible.first_name} ${responsible.last_name} (${responsible.email})` : null,
                dates: {
                  start: wsTask.date_start || null,
                  end: wsTask.date_end || null
                }
              });
              
              logger.success(`Updated OS section: ${wsTask.name} (object: ${placeholderObject.object_name})`);
            } else {
              // Изменений нет
              stats.sections.unchanged++;
              logger.info(`✅ OS section unchanged: ${wsTask.name}`);
            }
            
          } else {
            // Готовим данные для upsert (без ключевых полей)
            const sectionData = {
              section_name: wsTask.name,
              section_description: wsTask.text || null,
              section_object_id: placeholderObject.object_id,
              section_start_date: wsTask.date_start || null,
              section_end_date: wsTask.date_end || null,
              external_updated_at: new Date().toISOString()
            };
            
            // Find and assign responsible using enhanced search
            const responsible = await findUserByEmail(wsTask.user_to?.email, stats);
            if (responsible) {
              sectionData.section_responsible = responsible.user_id;
              logger.info(`👤 Assigned responsible to new OS section "${wsTask.name}": ${responsible.first_name} ${responsible.last_name}`);
            }
            
            // Идемпотентный upsert с учетом нового триггера
            await supabase.upsertSectionByKey(
              project.project_id,
              'worksection-os',
              wsTask.id.toString(),
              sectionData
            );
            stats.sections.created++;
            
            // Добавляем в отчет
            if (!stats.detailed_report) stats.detailed_report = { actions: [] };
            stats.detailed_report.actions.push({
              action: 'created',
              type: 'section',
              id: wsTask.id,
              name: wsTask.name,
              object: placeholderObject.object_name,
              project: project.project_name,
              timestamp: new Date().toISOString(),
              sync_type: 'os',
              responsible_assigned: !!responsible,
              responsible_info: responsible ? `${responsible.first_name} ${responsible.last_name} (${responsible.email})` : null,
              dates: {
                start: wsTask.date_start || null,
                end: wsTask.date_end || null
              }
            });
            
            logger.success(`Created OS section: ${wsTask.name} (object: ${placeholderObject.object_name})`);
          }
        }
        
      } else {
        // Стандартные проекты: используем существующую логику с task groups и подзадачами
        logger.info(`📑 Standard Project: Processing task groups and subtasks for ${project.project_name}`);
        
        // Фильтруем Task Groups (задачи с подзадачами)
        const taskGroups = wsTasks.filter(task => 
          task.child && task.child.length > 0 && !task.name.startsWith('!')
        );
        
        for (const taskGroup of taskGroups) {
        if (taskGroup.status !== 'active') continue;
        
        // Находим соответствующий объект в БД
        const object = existingObjects.find(obj => 
          obj.external_id && obj.external_id.toString() === taskGroup.id.toString()
        );
        
        if (!object) {
          logger.warning(`Object not found for task group: ${taskGroup.name}`);
          continue;
        }
        
        // Фильтруем подзадачи начинающиеся с "!"
        const filteredSubtasks = taskGroup.child.filter(subtask => {
          if (subtask.name && subtask.name.startsWith('!')) {
            logger.info(`🚫 Skipping section starting with "!": ${subtask.name}`);
            stats.sections.skipped = (stats.sections.skipped || 0) + 1;
            return false;
          }
          return true;
        });
        
        // Синхронизируем подзадачи как разделы
        for (const wsSubtask of filteredSubtasks) {
          if (wsSubtask.status !== 'active') continue;
          
          // Ищем существующий раздел по ключу (проект + источник + внешний id)
          const existing = existingSections.find(s =>
            s.section_project_id === project.project_id &&
            s.external_source === 'worksection' &&
            s.external_id && s.external_id.toString() === wsSubtask.id.toString()
          );
          
          if (existing) {
            // Проверяем нужно ли обновление
            const responsible = await findUserByEmail(wsSubtask.user_to?.email, stats);
            
            const hasChanges = 
              existing.section_name !== wsSubtask.name ||
              existing.section_description !== (wsSubtask.text || null) ||
              existing.section_start_date !== (wsSubtask.date_start || null) ||
              existing.section_end_date !== (wsSubtask.date_end || null) ||
              existing.section_object_id !== object.object_id ||
              (responsible && existing.section_responsible !== responsible.user_id) ||
              (!responsible && existing.section_responsible !== null);
            
            if (hasChanges) {
              // Обновляем существующий раздел
              const updateData = {
                section_name: wsSubtask.name,
                section_description: wsSubtask.text || null,
                section_object_id: object.object_id,
                section_project_id: project.project_id,  // ИСПРАВЛЕНО: используем project_id из контекста
                section_start_date: wsSubtask.date_start || null,
                section_end_date: wsSubtask.date_end || null,
                external_updated_at: new Date().toISOString()
              };
              
              if (responsible) {
                updateData.section_responsible = responsible.user_id;
                logger.info(`👤 Assigned responsible to section "${wsSubtask.name}": ${responsible.first_name} ${responsible.last_name}`);
              } else if (existing.section_responsible !== null) {
                updateData.section_responsible = null;
                logger.info(`👤 Removed responsible from section "${wsSubtask.name}"`);
              }
              
              await supabase.updateSection(existing.section_id, updateData);
              stats.sections.updated++;
              
              // Добавляем в отчет
              if (!stats.detailed_report) stats.detailed_report = { actions: [] };
              stats.detailed_report.actions.push({
                action: 'updated',
                type: 'section',
                id: wsSubtask.id,
                name: wsSubtask.name,
                object: object.object_name,
                project: project.project_name,
                timestamp: new Date().toISOString(),
                responsible_assigned: !!responsible,
                responsible_info: responsible ? `${responsible.first_name} ${responsible.last_name} (${responsible.email})` : null,
                dates: {
                  start: wsSubtask.date_start || null,
                  end: wsSubtask.date_end || null
                }
              });
              
              logger.success(`Updated section: ${wsSubtask.name} (object: ${object.object_name})`);
            } else {
              // Изменений нет
              stats.sections.unchanged++;
              logger.info(`✅ Section unchanged: ${wsSubtask.name}`);
            }
            
          } else {
            // Готовим данные для upsert (без ключевых полей)
            const sectionData = {
              section_name: wsSubtask.name,
              section_description: wsSubtask.text || null,
              section_object_id: object.object_id,
              section_start_date: wsSubtask.date_start || null,
              section_end_date: wsSubtask.date_end || null,
              external_updated_at: new Date().toISOString()
            };
            
            // Find and assign responsible using enhanced search
            const responsible = await findUserByEmail(wsSubtask.user_to?.email, stats);
            if (responsible) {
              sectionData.section_responsible = responsible.user_id;
              logger.info(`👤 Assigned responsible to new section "${wsSubtask.name}": ${responsible.first_name} ${responsible.last_name}`);
            }
            
            // Идемпотентный upsert с учетом нового триггера
            await supabase.upsertSectionByKey(
              project.project_id,
              'worksection',
              wsSubtask.id.toString(),
              sectionData
            );
            stats.sections.created++;
            
            // Добавляем в отчет
            if (!stats.detailed_report) stats.detailed_report = { actions: [] };
            stats.detailed_report.actions.push({
              action: 'created',
              type: 'section',
              id: wsSubtask.id,
              name: wsSubtask.name,
              object: object.object_name,
              project: project.project_name,
              timestamp: new Date().toISOString(),
              responsible_assigned: !!responsible,
              responsible_info: responsible ? `${responsible.first_name} ${responsible.last_name} (${responsible.email})` : null,
              dates: {
                start: wsSubtask.date_start || null,
                end: wsSubtask.date_end || null
              }
            });
            
            logger.success(`Created section: ${wsSubtask.name} (object: ${object.object_name})`);
          }
        }
      }
      } // конец else блока для стандартных проектов
    }
    
    logger.success(`✅ Sections sync completed`);
    
  } catch (error) {
    logger.error(`Sections sync error: ${error.message}`);
    throw error;
  }
}

async function findUserByEmail(email, stats) {
  if (!email) return null;
  
  try {
    // Инициализируем статистику поиска пользователей если её нет
    if (!stats.user_search) {
      stats.user_search = {
        total_searches: 0,
        successful_by_email: 0,
        successful_by_email_part: 0,
        successful_by_name: 0,
        successful_by_name_parts: 0,
        successful_by_fuzzy: 0,
        failed: 0,
        errors: 0,
        empty_queries: 0,
        searches: []
      };
    }
    
    stats.assignments.attempted++;
    
    // Используем новую улучшенную функцию поиска
    const user = await supabase.findUser(email, stats);
    if (user) {
      stats.assignments.successful++;
      logger.info(`👤 Found user: ${user.first_name} ${user.last_name} (${email})`);
      return user;
    }
    
    stats.assignments.failed++;
    logger.warning(`👤 User not found: ${email}`);
    return null;
    
  } catch (error) {
    stats.assignments.failed++;
    logger.error(`👤 Error finding user ${email}: ${error.message}`);
    return null;
  }
}

module.exports = { syncObjects, syncSections }; 