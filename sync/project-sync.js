const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');
const userCache = require('../services/user-cache');

// Извлекает стадию из тегов проекта Worksection
function extractStageFromTags(wsProject) {
  if (!wsProject.tags) return null;

  for (const tagName of Object.values(wsProject.tags)) {
    if (tagName && tagName.includes('Стадия')) {
      return tagName;
    }
  }
  return null;
}

async function syncProjects(stats, offset = 0, limit = 3, projectId = null) {
  try {
    const wsProjects = await worksection.getProjectsWithSyncTags();
    const supaProjects = await supabase.getProjects();

    // Фильтруем проекты начинающиеся с "!"
    let filteredProjects = wsProjects.filter(project => {
      if (project.name && project.name.startsWith('!')) {
        logger.info(`🚫 Skipping project starting with "!": ${project.name}`);
        stats.projects.skipped = (stats.projects.skipped || 0) + 1;
        return false;
      }
      return true;
    });

    // Если указан конкретный projectId - фильтруем только его
    if (projectId) {
      filteredProjects = filteredProjects.filter(p => p.id.toString() === projectId.toString());
      if (filteredProjects.length === 0) {
        logger.warning(`⚠️ Project ${projectId} not found in Worksection sync projects`);
        return;
      }
      logger.info(`🎯 Syncing specific project: ${filteredProjects[0].name} (ID: ${projectId})`);
    } else {
      logger.info(`Found ${wsProjects.length} projects with sync tag (${filteredProjects.length} after filtering)`);
    }

    // Применяем offset и limit для пагинации (только если не указан конкретный проект)
    const paginatedProjects = projectId ? filteredProjects : filteredProjects.slice(offset, offset + limit);
    if (!projectId) {
      logger.warning(`⚠️ Processing projects ${offset + 1}-${offset + paginatedProjects.length} of ${filteredProjects.length} total`);
    }

    for (const wsProject of paginatedProjects) {
      try {
        // Определяем тип синхронизации проекта
        const syncType = worksection.determineProjectSyncType(wsProject);
        logger.info(`📋 Processing project "${wsProject.name}" (sync type: ${syncType})`);

        // Извлекаем стадию из тегов проекта
        const stageType = extractStageFromTags(wsProject);
        if (stageType) {
          logger.info(`🏷️ Found stage: ${stageType} for project "${wsProject.name}"`);
        }

        const existing = supaProjects.find(p =>
          p.external_id && p.external_id.toString() === wsProject.id.toString()
        );

        if (existing) {
          // Update existing project
          const updateData = {
            project_name: wsProject.name,
            project_description: wsProject.description || null,
            external_updated_at: new Date().toISOString(),
            stage_type: stageType
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
            sync_type: syncType,
            stage_type: stageType,
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
            external_updated_at: new Date().toISOString(),
            stage_type: stageType
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
            sync_type: syncType,
            stage_type: stageType,
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

    // ✨ ИСПОЛЬЗУЕМ КЭШ вместо БД
    const user = userCache.findUser(email, stats);
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
    stats.user_search.errors++;
    logger.error(`👤 Error finding user ${email}: ${error.message}`);
    return null;
  }
}

module.exports = { syncProjects }; 