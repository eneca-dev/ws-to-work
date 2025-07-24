const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');

async function syncProjects(stats) {
  try {
    const wsProjects = await worksection.getProjectsWithTag();
    const supaProjects = await supabase.getProjects();
    
    // Фильтруем проекты начинающиеся с "!"
    const filteredProjects = wsProjects.filter(project => {
      if (project.name && project.name.startsWith('!')) {
        logger.info(`🚫 Skipping project starting with "!": ${project.name}`);
        stats.projects.skipped = (stats.projects.skipped || 0) + 1;
        return false;
      }
      return true;
    });
    
    logger.info(`Found ${wsProjects.length} projects with sync tag (${filteredProjects.length} after filtering)`);
    
    for (const wsProject of filteredProjects) {
      try {
        const existing = supaProjects.find(p => 
          p.external_id && p.external_id.toString() === wsProject.id.toString()
        );
        
        if (existing) {
          // Update existing project
          const updateData = {
            project_name: wsProject.name,
            project_description: wsProject.description || null,
            external_updated_at: new Date().toISOString()
          };
          
          // Find and assign manager using enhanced search
          // Приоритет: manager -> user_to -> user_from
          const managerEmail = wsProject.manager || wsProject.user_to?.email || wsProject.user_from?.email;
          const manager = await findUserByEmail(managerEmail, stats);
          if (manager) {
            updateData.project_manager = manager.user_id;
            logger.info(`👤 Assigned manager to project "${wsProject.name}": ${manager.first_name} ${manager.last_name} (source: ${wsProject.manager ? 'manager' : wsProject.user_to?.email ? 'user_to' : 'user_from'})`);
          }
          
          await supabase.updateProject(existing.project_id, updateData);
          stats.projects.updated++;
          
          // Добавляем детальную информацию в отчет
          if (!stats.detailed_report) stats.detailed_report = { actions: [] };
          stats.detailed_report.actions.push({
            action: 'updated',
            type: 'project',
            id: wsProject.id,
            name: wsProject.name,
            timestamp: new Date().toISOString(),
            manager_assigned: !!manager,
            manager_info: manager ? `${manager.first_name} ${manager.last_name} (${manager.email})` : null
          });
          
          logger.success(`Updated project: ${wsProject.name}`);
          
        } else {
          // Create new project
          const projectData = {
            project_name: wsProject.name,
            project_description: wsProject.description || null,
            external_id: wsProject.id.toString(),
            external_source: 'worksection',
            external_updated_at: new Date().toISOString()
          };
          
          // Find and assign manager using enhanced search
          // Приоритет: manager -> user_to -> user_from
          const managerEmail = wsProject.manager || wsProject.user_to?.email || wsProject.user_from?.email;
          const manager = await findUserByEmail(managerEmail, stats);
          if (manager) {
            projectData.project_manager = manager.user_id;
            logger.info(`👤 Assigned manager to new project "${wsProject.name}": ${manager.first_name} ${manager.last_name} (source: ${wsProject.manager ? 'manager' : wsProject.user_to?.email ? 'user_to' : 'user_from'})`);
          }
          
          await supabase.createProject(projectData);
          stats.projects.created++;
          
          // Добавляем детальную информацию в отчет
          if (!stats.detailed_report) stats.detailed_report = { actions: [] };
          stats.detailed_report.actions.push({
            action: 'created',
            type: 'project',
            id: wsProject.id,
            name: wsProject.name,
            timestamp: new Date().toISOString(),
            manager_assigned: !!manager,
            manager_info: manager ? `${manager.first_name} ${manager.last_name} (${manager.email})` : null
          });
          
          logger.success(`Created project: ${wsProject.name}`);
        }
        
      } catch (error) {
        logger.error(`Error syncing project ${wsProject.name}: ${error.message}`);
        stats.projects.errors++;
        
        // Добавляем ошибку в отчет
        if (!stats.detailed_report) stats.detailed_report = { actions: [] };
        stats.detailed_report.actions.push({
          action: 'error',
          type: 'project',
          id: wsProject.id,
          name: wsProject.name,
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    }
    
  } catch (error) {
    logger.error(`Projects sync error: ${error.message}`);
    throw error;
  }
}

async function syncStages(stats) {
  try {
    const supaProjects = await supabase.getProjectsWithExternalId();
    const existingStages = await supabase.getStages();
    
    for (const project of supaProjects) {
      logger.info(`🎯 Syncing stages for project: ${project.project_name}`);
      
      // Получаем данные проекта из Worksection
      const wsProjects = await worksection.getProjectsWithTag();
      const wsProject = wsProjects.find(p => 
        p.id && p.id.toString() === project.external_id.toString()
      );
      
      if (!wsProject) {
        logger.warn(`Project not found in Worksection: ${project.project_name}`);
        continue;
      }
      
      if (!wsProject.tags) {
        logger.info(`No tags found for project: ${project.project_name}`);
        continue;
      }
      
      // Ищем метки стадий в проекте
      for (const [tagId, tagName] of Object.entries(wsProject.tags)) {
        if (tagName && tagName.includes('Стадия')) {
          logger.info(`🏷️ Found stage tag: ${tagName} (${tagId}) for project ${project.project_name}`);
          
          // Проверяем, есть ли уже такая стадия ДЛЯ ЭТОГО ПРОЕКТА
          const existingStage = existingStages.find(stage => 
            stage.stage_project_id === project.project_id && 
            stage.external_id === tagId
          );
          
          if (existingStage) {
            logger.info(`Stage already exists: ${tagName} for project ${project.project_name}`);
            continue;
          }
          
          // Создаем новую стадию ДЛЯ ЭТОГО ПРОЕКТА
          const newStage = {
            stage_name: tagName,
            stage_project_id: project.project_id, // Привязываем к проекту!
            external_id: tagId,
            external_source: 'worksection'
          };
          
          const createdStage = await supabase.createStage(newStage);
          
          if (createdStage) {
            logger.success(`✅ Created stage: ${tagName} for project ${project.project_name}`);
            stats.stages.created++;
            
            if (!stats.detailed_report) stats.detailed_report = { actions: [] };
            stats.detailed_report.actions.push({
              type: 'stage',
              action: 'created',
              name: tagName,
              project: project.project_name,
              external_id: tagId
            });
          } else {
            logger.error(`Failed to create stage: ${tagName} for project ${project.project_name}`);
          }
        }
      }
    }
    
    logger.success(`✅ Stages sync completed`);
    
  } catch (error) {
    logger.error(`Stages sync error: ${error.message}`);
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

module.exports = { syncProjects, syncStages }; 