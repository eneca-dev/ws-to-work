const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');

async function syncObjects(stats) {
  try {
    const supaProjects = await supabase.getProjectsWithExternalId();
    const existingObjects = await supabase.getObjects();
    const existingStages = await supabase.getStages();
    
    for (const project of supaProjects) {
      const wsTasks = await worksection.getProjectTasks(project.external_id);
      
      for (const wsTask of wsTasks) {
        if (wsTask.status !== 'active') continue;
        
        const existing = existingObjects.find(o => 
          o.external_id && o.external_id.toString() === wsTask.id.toString()
        );
        
        // Find stage for this object
        const stage = existingStages.find(s => 
          s.stage_project_id === project.project_id && 
          s.stage_name === 'В работе'
        );
        
        if (!stage) {
          logger.warning(`No stage found for object ${wsTask.name}`);
          continue;
        }
        
        if (existing) {
          // Update existing object
          const updateData = {
            object_name: wsTask.name,
            object_description: wsTask.text || null,
            object_start_date: wsTask.date_start || null,
            object_end_date: wsTask.date_end || null,
            external_updated_at: new Date().toISOString()
          };
          
          // Find and assign responsible
          const responsible = await findUserByEmail(wsTask.user_to?.email, stats);
          if (responsible) {
            updateData.object_responsible = responsible.user_id;
          }
          
          await supabase.updateObject(existing.object_id, updateData);
          stats.objects.updated++;
          logger.success(`Updated object: ${wsTask.name}`);
          
        } else {
          // Create new object
          const objectData = {
            object_name: wsTask.name,
            object_description: wsTask.text || null,
            object_stage_id: stage.stage_id,
            object_project_id: project.project_id,
            object_start_date: wsTask.date_start || null,
            object_end_date: wsTask.date_end || null,
            external_id: wsTask.id.toString(),
            external_source: 'worksection',
            external_updated_at: new Date().toISOString()
          };
          
          // Find and assign responsible
          const responsible = await findUserByEmail(wsTask.user_to?.email, stats);
          if (responsible) {
            objectData.object_responsible = responsible.user_id;
          }
          
          await supabase.createObject(objectData);
          stats.objects.created++;
          logger.success(`Created object: ${wsTask.name}`);
        }
      }
    }
    
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
      const wsTasks = await worksection.getProjectTasks(project.external_id);
      
      for (const wsTask of wsTasks) {
        if (wsTask.status !== 'active' || !wsTask.child) continue;
        
        // Find the corresponding object in Supabase
        const object = existingObjects.find(obj => 
          obj.external_id && obj.external_id.toString() === wsTask.id.toString()
        );
        
        if (!object) continue;
        
        for (const wsSubtask of wsTask.child) {
          if (wsSubtask.status !== 'active') continue;
          
          const existing = existingSections.find(s => 
            s.external_id && s.external_id.toString() === wsSubtask.id.toString()
          );
          
          if (existing) {
            // Update existing section
            const updateData = {
              section_name: wsSubtask.name,
              section_description: wsSubtask.text || null,
              section_start_date: wsSubtask.date_start || null,
              section_end_date: wsSubtask.date_end || null,
              external_updated_at: new Date().toISOString()
            };
            
            // Find and assign responsible
            const responsible = await findUserByEmail(wsSubtask.user_to?.email, stats);
            if (responsible) {
              updateData.section_responsible = responsible.user_id;
            }
            
            await supabase.updateSection(existing.section_id, updateData);
            stats.sections.updated++;
            logger.success(`Updated section: ${wsSubtask.name}`);
            
          } else {
            // Create new section
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
            
            // Find and assign responsible
            const responsible = await findUserByEmail(wsSubtask.user_to?.email, stats);
            if (responsible) {
              sectionData.section_responsible = responsible.user_id;
            }
            
            await supabase.createSection(sectionData);
            stats.sections.created++;
            logger.success(`Created section: ${wsSubtask.name}`);
          }
        }
      }
    }
    
  } catch (error) {
    logger.error(`Sections sync error: ${error.message}`);
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

module.exports = { syncObjects, syncSections }; 