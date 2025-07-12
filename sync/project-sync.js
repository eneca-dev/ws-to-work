const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');

async function syncProjects(stats) {
  try {
    const wsProjects = await worksection.getProjectsWithTag();
    const supaProjects = await supabase.getProjects();
    
    logger.info(`Found ${wsProjects.length} projects with sync tag`);
    
    for (const wsProject of wsProjects) {
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
          
          // Find and assign manager
          const manager = await findUserByEmail(wsProject.user_from?.email, stats);
          if (manager) {
            updateData.project_manager = manager.user_id;
          }
          
          await supabase.updateProject(existing.project_id, updateData);
          stats.projects.updated++;
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
          
          // Find and assign manager
          const manager = await findUserByEmail(wsProject.user_from?.email, stats);
          if (manager) {
            projectData.project_manager = manager.user_id;
          }
          
          await supabase.createProject(projectData);
          stats.projects.created++;
          logger.success(`Created project: ${wsProject.name}`);
        }
        
      } catch (error) {
        logger.error(`Error syncing project ${wsProject.name}: ${error.message}`);
        stats.projects.errors++;
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
    
    // Create default stages for each project
    const defaultStages = [
      { name: 'Планирование', order: 1 },
      { name: 'В работе', order: 2 },
      { name: 'Тестирование', order: 3 },
      { name: 'Завершено', order: 4 }
    ];
    
    for (const project of supaProjects) {
      for (const stageTemplate of defaultStages) {
        const existing = existingStages.find(s => 
          s.stage_project_id === project.project_id && 
          s.stage_name === stageTemplate.name
        );
        
        if (!existing) {
          const stageData = {
            stage_name: stageTemplate.name,
            stage_project_id: project.project_id,
            stage_order: stageTemplate.order,
            external_source: 'system',
            external_updated_at: new Date().toISOString()
          };
          
          await supabase.createStage(stageData);
          stats.stages.created++;
          logger.success(`Created stage: ${stageTemplate.name} for ${project.project_name}`);
        } else {
          stats.stages.unchanged++;
        }
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
    stats.assignments.attempted++;
    
    const user = await supabase.findUserByEmail(email);
    if (user) {
      stats.assignments.successful++;
      logger.info(`Found user: ${user.first_name} ${user.last_name} (${email})`);
      return user;
    }
    
    stats.assignments.failed++;
    logger.warning(`User not found: ${email}`);
    return null;
    
  } catch (error) {
    stats.assignments.failed++;
    logger.error(`Error finding user ${email}: ${error.message}`);
    return null;
  }
}

module.exports = { syncProjects, syncStages }; 