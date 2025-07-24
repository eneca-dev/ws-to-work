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
    const supaProjects = await supabase.getProjectsWithExternalId();
    const existingStages = await supabase.getStages();
    
    // Собираем все уникальные стадии из меток всех проектов
    const stageTagsMap = new Map(); // id -> name
    
    for (const project of supaProjects) {
      logger.info(`🎯 Analyzing stages for project: ${project.project_name}`);
      
      // Получаем данные проекта из Worksection
      const wsProjects = await worksection.getProjectsWithTag();
      const wsProject = wsProjects.find(p => 
        p.id && p.id.toString() === project.external_id.toString()
      );
      
      if (wsProject && wsProject.tags) {
        // Ищем метки стадий в проекте
        Object.entries(wsProject.tags).forEach(([tagId, tagName]) => {
          if (tagName && tagName.includes('Стадия')) {
            stageTagsMap.set(tagId, tagName);
            logger.info(`Found stage tag for project ${project.project_name}: ${tagName}`);
          }
        });
      }
    }
    
    logger.info(`Found ${stageTagsMap.size} unique stage tags`);
    
    // Создаем или обновляем стадии
    for (const [tagId, stageName] of stageTagsMap) {
      try {
        // Пропускаем стадии начинающиеся с "!"
        if (stageName.startsWith('!')) {
          logger.info(`🚫 Skipping stage starting with "!": ${stageName}`);
          stats.stages.skipped = (stats.stages.skipped || 0) + 1;
          continue;
        }
        
        // Ищем существующую стадию по external_id (tag ID)
        const existing = existingStages.find(s => 
          s.external_id && s.external_id.toString() === tagId.toString()
        );
        
        if (existing) {
          // Обновляем существующую стадию
          const updateData = {
            stage_name: stageName,
            stage_description: `Стадия проекта: ${stageName}`,
            external_updated_at: new Date().toISOString()
          };
          
          await supabase.updateStage(existing.stage_id, updateData);
          stats.stages.updated++;
          
          // Добавляем в отчет
          if (!stats.detailed_report) stats.detailed_report = { actions: [] };
          stats.detailed_report.actions.push({
            action: 'updated',
            type: 'stage',
            id: tagId,
            name: stageName,
            timestamp: new Date().toISOString()
          });
          
          logger.success(`Updated stage: ${stageName}`);
          
        } else {
          // Создаем новую стадию
          const stageData = {
            stage_name: stageName,
            stage_description: `Стадия проекта: ${stageName}`,
            external_id: tagId.toString(),
            external_source: 'worksection',
            external_updated_at: new Date().toISOString()
          };
          
          await supabase.createStage(stageData);
          stats.stages.created++;
          
          // Добавляем в отчет
          if (!stats.detailed_report) stats.detailed_report = { actions: [] };
          stats.detailed_report.actions.push({
            action: 'created',
            type: 'stage',
            id: tagId,
            name: stageName,
            timestamp: new Date().toISOString()
          });
          
          logger.success(`Created stage: ${stageName}`);
        }
        
      } catch (error) {
        logger.error(`Error syncing stage ${stageName}: ${error.message}`);
        stats.stages.errors++;
        
        // Добавляем ошибку в отчет
        if (!stats.detailed_report) stats.detailed_report = { actions: [] };
        stats.detailed_report.actions.push({
          action: 'error',
          type: 'stage',
          id: tagId,
          name: stageName,
          timestamp: new Date().toISOString(),
          error: error.message
        });
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