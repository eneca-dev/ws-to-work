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
          const manager = await findUserByEmail(wsProject.user_from?.email, stats);
          if (manager) {
            updateData.project_manager = manager.user_id;
            logger.info(`👤 Assigned manager to project "${wsProject.name}": ${manager.first_name} ${manager.last_name}`);
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
          const manager = await findUserByEmail(wsProject.user_from?.email, stats);
          if (manager) {
            projectData.project_manager = manager.user_id;
            logger.info(`👤 Assigned manager to new project "${wsProject.name}": ${manager.first_name} ${manager.last_name}`);
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
    const existingStages = await supabase.getStages();
    
    // Create default stages (global stages, not per project)
    const defaultStages = [
      { name: 'Планирование', description: 'Стадия планирования проекта' },
      { name: 'В работе', description: 'Стадия выполнения работ' },
      { name: 'Тестирование', description: 'Стадия тестирования и проверки' },
      { name: 'Завершено', description: 'Стадия завершения проекта' }
    ];
    
    for (const stageTemplate of defaultStages) {
      // Пропускаем стадии начинающиеся с "!" (хотя в нашем случае их нет)
      if (stageTemplate.name.startsWith('!')) {
        logger.info(`🚫 Skipping stage starting with "!": ${stageTemplate.name}`);
        stats.stages.skipped = (stats.stages.skipped || 0) + 1;
        continue;
      }
      
      const existing = existingStages.find(s => 
        s.stage_name === stageTemplate.name
      );
      
      if (!existing) {
        const stageData = {
          stage_name: stageTemplate.name,
          stage_description: stageTemplate.description
        };
        
        await supabase.createStage(stageData);
        stats.stages.created++;
        
        // Добавляем в отчет
        if (!stats.detailed_report) stats.detailed_report = { actions: [] };
        stats.detailed_report.actions.push({
          action: 'created',
          type: 'stage',
          name: stageTemplate.name,
          timestamp: new Date().toISOString()
        });
        
        logger.success(`Created stage: ${stageTemplate.name}`);
      } else {
        stats.stages.unchanged++;
      }
    }
    
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