const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');

async function syncObjects(stats) {
  try {
    const supaProjects = await supabase.getProjectsWithExternalId();
    const existingObjects = await supabase.getObjects();
    
    for (const project of supaProjects) {
      logger.info(`📦 Syncing objects for project: ${project.project_name}`);
      
      // Читаем стадии заново для каждого проекта (они могли быть созданы в syncStages)
      const existingStages = await supabase.getStages();
      
      // Получаем данные проекта из Worksection для определения стадии
      const wsProjects = await worksection.getProjectsWithTag();
      const wsProject = wsProjects.find(p => 
        p.id && p.id.toString() === project.external_id.toString()
      );
      
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
        logger.warn(`No stage found for project: ${project.project_name}. Skipping objects.`);
        continue;
      }
      
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
        const newObject = {
          object_name: taskGroup.name,
          object_description: taskGroup.text || '',
          object_stage_id: projectStage.stage_id, // Привязываем к стадии проекта!
          external_id: taskGroup.id.toString(),
          external_source: 'worksection'
        };
        
        try {
          const createdObject = await supabase.createObject(newObject);
          
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
    }
    
    logger.success(`✅ Objects sync completed`);
    
  } catch (error) {
    logger.error(`Objects sync error: ${error.message}`);
    throw error;
  }
}

async function syncSections(stats) {
  try {
    const supaProjects = await supabase.getProjectsWithExternalId();
    const existingObjects = await supabase.getObjects();
    const existingSections = await supabase.getSections();
    
    for (const project of supaProjects) {
      logger.info(`📑 Syncing sections for project: ${project.project_name}`);
      
      // Получаем задачи проекта из Worksection
      const wsTasks = await worksection.getProjectTasks(project.external_id);
      
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
          
          const existing = existingSections.find(s => 
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
            // Создаем новый раздел
            const sectionData = {
              section_name: wsSubtask.name,
              section_description: wsSubtask.text || null,
              section_object_id: object.object_id,
              section_project_id: project.project_id,  // ИСПРАВЛЕНО: используем project_id из контекста
              section_start_date: wsSubtask.date_start || null,
              section_end_date: wsSubtask.date_end || null,
              external_id: wsSubtask.id.toString(),
              external_source: 'worksection',
              external_updated_at: new Date().toISOString()
            };
            
            // Find and assign responsible using enhanced search
            const responsible = await findUserByEmail(wsSubtask.user_to?.email, stats);
            if (responsible) {
              sectionData.section_responsible = responsible.user_id;
              logger.info(`👤 Assigned responsible to new section "${wsSubtask.name}": ${responsible.first_name} ${responsible.last_name}`);
            }
            
            await supabase.createSection(sectionData);
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