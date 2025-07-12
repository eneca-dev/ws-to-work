const logger = require('../utils/logger');
const { syncProjects, syncStages } = require('./project-sync');
const { syncObjects, syncSections } = require('./content-sync');

class SyncManager {
  constructor() {
    this.stats = {
      projects: { created: 0, updated: 0, unchanged: 0, errors: 0 },
      stages: { created: 0, updated: 0, unchanged: 0, errors: 0 },
      objects: { created: 0, updated: 0, unchanged: 0, errors: 0 },
      sections: { created: 0, updated: 0, unchanged: 0, errors: 0 },
      assignments: { attempted: 0, successful: 0, failed: 0 }
    };
  }
  
  async fullSync() {
    const startTime = Date.now();
    logger.info('🚀 Starting full synchronization');
    
    try {
      // Clear previous stats
      this.resetStats();
      
      // Step 1: Sync projects
      logger.info('📋 Step 1/4: Syncing projects');
      await syncProjects(this.stats);
      
      // Step 2: Sync stages
      logger.info('🎯 Step 2/4: Syncing stages');
      await syncStages(this.stats);
      
      // Step 3: Sync objects
      logger.info('📦 Step 3/4: Syncing objects');
      await syncObjects(this.stats);
      
      // Step 4: Sync sections
      logger.info('📑 Step 4/4: Syncing sections');
      await syncSections(this.stats);
      
      const duration = Date.now() - startTime;
      logger.success(`✅ Full synchronization completed in ${duration}ms`);
      
      // Log final stats
      this.logFinalStats();
      
      return {
        success: true,
        duration,
        stats: this.stats,
        summary: this.getSummary()
      };
      
    } catch (error) {
      logger.error(`❌ Full synchronization failed: ${error.message}`);
      throw error;
    }
  }
  
  logFinalStats() {
    const summary = this.getSummary();
    
    logger.info('📊 === FINAL SYNC STATISTICS ===');
    logger.info(`🆕 Total created: ${summary.total.created}`);
    logger.info(`🔄 Total updated: ${summary.total.updated}`);
    logger.info(`✅ Total unchanged: ${summary.total.unchanged}`);
    logger.info(`❌ Total errors: ${summary.total.errors}`);
    
    logger.info('📋 Projects: ' + 
      `${this.stats.projects.created} created, ` +
      `${this.stats.projects.updated} updated, ` +
      `${this.stats.projects.unchanged} unchanged, ` +
      `${this.stats.projects.errors} errors`
    );
    
    logger.info('🎯 Stages: ' + 
      `${this.stats.stages.created} created, ` +
      `${this.stats.stages.updated} updated, ` +
      `${this.stats.stages.unchanged} unchanged, ` +
      `${this.stats.stages.errors} errors`
    );
    
    logger.info('📦 Objects: ' + 
      `${this.stats.objects.created} created, ` +
      `${this.stats.objects.updated} updated, ` +
      `${this.stats.objects.unchanged} unchanged, ` +
      `${this.stats.objects.errors} errors`
    );
    
    logger.info('📑 Sections: ' + 
      `${this.stats.sections.created} created, ` +
      `${this.stats.sections.updated} updated, ` +
      `${this.stats.sections.unchanged} unchanged, ` +
      `${this.stats.sections.errors} errors`
    );
    
    if (this.stats.assignments.attempted > 0) {
      const successRate = (this.stats.assignments.successful / this.stats.assignments.attempted * 100).toFixed(1);
      logger.info('👤 Assignments: ' + 
        `${this.stats.assignments.attempted} attempted, ` +
        `${this.stats.assignments.successful} successful, ` +
        `${this.stats.assignments.failed} failed ` +
        `(${successRate}% success rate)`
      );
    }
  }
  
  resetStats() {
    this.stats = {
      projects: { created: 0, updated: 0, unchanged: 0, errors: 0 },
      stages: { created: 0, updated: 0, unchanged: 0, errors: 0 },
      objects: { created: 0, updated: 0, unchanged: 0, errors: 0 },
      sections: { created: 0, updated: 0, unchanged: 0, errors: 0 },
      assignments: { attempted: 0, successful: 0, failed: 0 }
    };
  }
  
  getSummary() {
    const total = {
      created: this.stats.projects.created + this.stats.stages.created + 
                this.stats.objects.created + this.stats.sections.created,
      updated: this.stats.projects.updated + this.stats.stages.updated + 
               this.stats.objects.updated + this.stats.sections.updated,
      unchanged: this.stats.projects.unchanged + this.stats.stages.unchanged + 
                 this.stats.objects.unchanged + this.stats.sections.unchanged,
      errors: this.stats.projects.errors + this.stats.stages.errors + 
              this.stats.objects.errors + this.stats.sections.errors
    };
    
    return { total, ...this.stats };
  }
}

module.exports = new SyncManager(); 