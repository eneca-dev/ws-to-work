const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');

async function syncObjects(stats) {
  try {
    const supaProjects = await supabase.getProjectsWithExternalId();
    const existingObjects = await supabase.getObjects();
    const existingStages = await supabase.getStages();
    
    for (const project of supaProjects) {
      logger.info(`📦 Syncing objects for project: ${project.project_name}`);
      
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
            projectStage = existingStages.find(s => 
              s.external_id && s.external_id.toString() === tagId.toString()
            );
            if (projectStage) {
              logger.info(`Project ${project.project_name} belongs to stage: ${projectStage.stage_name}`);
              break;
            }
          }
        }
      }
      
      if (!projectStage) {
        logger.warning(`No stage found for project ${project.project_name}, skipping objects sync`);
        continue;
      }
      
      // Получаем задачи проекта из Worksection  
      const wsTasks = await worksection.getProjectTasks(project.external_id);
      
      // Фильтруем Task Groups (задачи с подзадачами) - это будут объекты
      const taskGroups = wsTasks.filter(task => {
        // Пропускаем задачи начинающиеся с "!"
        if (task.name && task.name.startsWith('!')) {
          logger.info(`🚫 Skipping object starting with "!": ${task.name}`);
          stats.objects.skipped = (stats.objects.skipped || 0) + 1;
          return false;
        }
        // Берем только задачи с подзадачами (это Task Groups = объекты)
        return task.child && task.child.length > 0;
      });
      
      logger.info(`Found ${taskGroups.length} task groups for project ${project.project_name}`);
      
      // Синхронизируем Task Groups как объекты
      for (const taskGroup of taskGroups) {
        if (taskGroup.status !== 'active') continue;
        
        const existing = existingObjects.find(o => 
          o.external_id && o.external_id.toString() === taskGroup.id.toString()
        );
        
        if (existing) {
          // Обновляем существующий объект
          const updateData = {
            object_name: taskGroup.name,
            object_description: taskGroup.text || null,
            object_stage_id: projectStage.stage_id, // Привязываем к стадии проекта
            object_project_id: project.project_id,
            object_start_date: taskGroup.date_start || null,
            object_end_date: taskGroup.date_end || null,
            external_updated_at: new Date().toISOString()
          };
          
          // Find and assign responsible using enhanced search
          const responsible = await findUserByEmail(taskGroup.user_to?.email, stats);
          if (responsible) {
            updateData.object_responsible = responsible.user_id;
            logger.info(`👤 Assigned responsible to object "${taskGroup.name}": ${responsible.first_name} ${responsible.last_name}`);
          }
          
          await supabase.updateObject(existing.object_id, updateData);
          stats.objects.updated++;
          
          // Добавляем в отчет
          if (!stats.detailed_report) stats.detailed_report = { actions: [] };
          stats.detailed_report.actions.push({
            action: 'updated',
            type: 'object',
            id: taskGroup.id,
            name: taskGroup.name,
            stage: projectStage.stage_name,
            project: project.project_name,
            timestamp: new Date().toISOString(),
            responsible_assigned: !!responsible,
            responsible_info: responsible ? `${responsible.first_name} ${responsible.last_name} (${responsible.email})` : null,
            subtasks_count: taskGroup.child ? taskGroup.child.length : 0
          });
          
          logger.success(`Updated object: ${taskGroup.name} (stage: ${projectStage.stage_name})`);
          
        } else {
          // Создаем новый объект
          const objectData = {
            object_name: taskGroup.name,
            object_description: taskGroup.text || null,
            object_stage_id: projectStage.stage_id, // Привязываем к стадии проекта
            object_project_id: project.project_id,
            object_start_date: taskGroup.date_start || null,
            object_end_date: taskGroup.date_end || null,
            external_id: taskGroup.id.toString(),
            external_source: 'worksection',
            external_updated_at: new Date().toISOString()
          };
          
          // Find and assign responsible using enhanced search
          const responsible = await findUserByEmail(taskGroup.user_to?.email, stats);
          if (responsible) {
            objectData.object_responsible = responsible.user_id;
            logger.info(`👤 Assigned responsible to new object "${taskGroup.name}": ${responsible.first_name} ${responsible.last_name}`);
          }
          
          await supabase.createObject(objectData);
          stats.objects.created++;
          
          // Добавляем в отчет
          if (!stats.detailed_report) stats.detailed_report = { actions: [] };
          stats.detailed_report.actions.push({
            action: 'created',
            type: 'object',
            id: taskGroup.id,
            name: taskGroup.name,
            stage: projectStage.stage_name,
            project: project.project_name,
            timestamp: new Date().toISOString(),
            responsible_assigned: !!responsible,
            responsible_info: responsible ? `${responsible.first_name} ${responsible.last_name} (${responsible.email})` : null,
            subtasks_count: taskGroup.child ? taskGroup.child.length : 0
          });
          
          logger.success(`Created object: ${taskGroup.name} (stage: ${projectStage.stage_name})`);
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
                section_project_id: object.object_project_id,
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
              section_project_id: object.object_project_id,
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