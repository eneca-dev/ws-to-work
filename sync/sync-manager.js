const logger = require('../utils/logger');
const { syncProjects, syncStages } = require('./project-sync');
const { syncObjects, syncSections } = require('./content-sync');
const telegram = require('../services/telegram');

class SyncManager {
  constructor() {
    this.stats = {
      projects: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
      stages: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
      objects: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
      sections: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
      assignments: { attempted: 0, successful: 0, failed: 0 },
      user_search: {
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
      },
      detailed_report: { actions: [] }
    };
  }
  
  async fullSync(offset = 0, limit = 3) {
    const startTime = Date.now();
    logger.info(`🚀 Starting sync with offset: ${offset}, limit: ${limit}`);

    // Отправляем уведомление о начале в Telegram
    await telegram.sendSyncStarted(offset, limit);

    try {
      // Clear previous stats
      this.resetStats();
      
      // Step 1: Sync projects
      logger.info('📋 Step 1/4: Syncing projects');
      await syncProjects(this.stats, offset, limit);
      
      // Step 2: Sync stages
      logger.info('🎯 Step 2/4: Syncing stages');
      await syncStages(this.stats);
      
      // Step 3: Sync objects
      logger.info('📦 Step 3/4: Syncing objects');
      await syncObjects(this.stats, offset, limit);
      
      // Step 4: Sync sections
      logger.info('📑 Step 4/4: Syncing sections');
      await syncSections(this.stats, offset, limit);
      
      const duration = Date.now() - startTime;
      const endTime = new Date();
      logger.success(`✅ Full synchronization completed in ${duration}ms`);

      // Log final stats
      this.logFinalStats();

      // Generate detailed report for frontend
      const detailedReport = this.generateDetailedReport(duration);

      // Send logs to Telegram
      const telegramStats = {
        projectsCreated: this.stats.projects.created,
        projectsUpdated: this.stats.projects.updated,
        stagesCreated: this.stats.stages.created,
        objectsCreated: this.stats.objects.created,
        objectsUpdated: this.stats.objects.updated,
        sectionsCreated: this.stats.sections.created,
        sectionsUpdated: this.stats.sections.updated,
        errors: this.stats.projects.errors + this.stats.stages.errors +
                this.stats.objects.errors + this.stats.sections.errors
      };
      await telegram.sendCsvFile(logger.getLogs(), telegramStats, new Date(startTime), endTime);

      return {
        success: true,
        duration,
        stats: this.stats,
        summary: this.getSummary(),
        detailed_report: detailedReport,
        user_search_summary: this.generateUserSearchSummary()
      };
      
    } catch (error) {
      logger.error(`❌ Full synchronization failed: ${error.message}`);

      // Отправляем уведомление об ошибке в Telegram
      await telegram.sendError(error, 'Full synchronization');

      throw error;
    }
  }
  
  generateDetailedReport(duration) {
    const report = {
      sync_summary: {
        duration_ms: duration,
        duration_readable: this.formatDuration(duration),
        timestamp: new Date().toISOString(),
        total_actions: this.stats.detailed_report.actions.length
      },
      actions_by_type: {
        projects: this.stats.detailed_report.actions.filter(a => a.type === 'project'),
        stages: this.stats.detailed_report.actions.filter(a => a.type === 'stage'),
        objects: this.stats.detailed_report.actions.filter(a => a.type === 'object'),
        sections: this.stats.detailed_report.actions.filter(a => a.type === 'section')
      },
      statistics: {
        total_created: this.stats.detailed_report.actions.filter(a => a.action === 'created').length,
        total_updated: this.stats.detailed_report.actions.filter(a => a.action === 'updated').length,
        total_errors: this.stats.detailed_report.actions.filter(a => a.action === 'error').length,
        total_skipped: (this.stats.projects.skipped || 0) + (this.stats.stages.skipped || 0) + 
                       (this.stats.objects.skipped || 0) + (this.stats.sections.skipped || 0)
      },
      assignment_summary: {
        total_assignments_attempted: this.stats.assignments.attempted,
        successful_assignments: this.stats.assignments.successful,
        failed_assignments: this.stats.assignments.failed,
        success_rate: this.stats.assignments.attempted > 0 ? 
          ((this.stats.assignments.successful / this.stats.assignments.attempted) * 100).toFixed(1) : '0.0',
        assignments_with_users: this.stats.detailed_report.actions.filter(a => a.responsible_assigned || a.manager_assigned).length
      },
      user_search_analysis: this.generateUserSearchAnalysis(),
      all_actions: this.stats.detailed_report.actions.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
    };
    
    return report;
  }
  
  generateUserSearchAnalysis() {
    const search = this.stats.user_search;
    const total = search.total_searches;
    
    if (total === 0) return { message: 'No user searches performed' };
    
    return {
      total_searches: total,
      success_breakdown: {
        by_email: { count: search.successful_by_email, percentage: ((search.successful_by_email / total) * 100).toFixed(1) },
        by_email_part: { count: search.successful_by_email_part, percentage: ((search.successful_by_email_part / total) * 100).toFixed(1) },
        by_name: { count: search.successful_by_name, percentage: ((search.successful_by_name / total) * 100).toFixed(1) },
        by_name_parts: { count: search.successful_by_name_parts, percentage: ((search.successful_by_name_parts / total) * 100).toFixed(1) },
        by_fuzzy: { count: search.successful_by_fuzzy, percentage: ((search.successful_by_fuzzy / total) * 100).toFixed(1) }
      },
      failed_searches: search.failed,
      error_searches: search.errors,
      empty_queries: search.empty_queries,
      success_rate: (((total - search.failed - search.errors) / total) * 100).toFixed(1),
      recommendations: this.generateSearchRecommendations()
    };
  }
  
  generateSearchRecommendations() {
    const search = this.stats.user_search;
    const recommendations = [];
    
    if (search.failed > search.successful_by_email) {
      recommendations.push('Consider updating email addresses in Worksection or eneca.work profiles');
    }
    
    if (search.successful_by_fuzzy > 0) {
      recommendations.push('Some users found by fuzzy search - verify data accuracy');
    }
    
    if (search.errors > 0) {
      recommendations.push('Database connection issues detected during user search');
    }
    
    if (search.empty_queries > 5) {
      recommendations.push('Many empty email fields in Worksection - assign users to tasks');
    }
    
    return recommendations.length > 0 ? recommendations : ['User search system working optimally'];
  }
  
  generateUserSearchSummary() {
    const search = this.stats.user_search;
    const total = search.total_searches;
    
    if (total === 0) return null;
    
    const successful = search.successful_by_email + search.successful_by_email_part + 
                      search.successful_by_name + search.successful_by_name_parts + 
                      search.successful_by_fuzzy;
    
    return {
      total_searches: total,
      successful_searches: successful,
      failed_searches: search.failed,
      success_rate: ((successful / total) * 100).toFixed(1),
      most_effective_strategy: this.getMostEffectiveStrategy(),
      search_quality: this.getSearchQuality()
    };
  }
  
  getMostEffectiveStrategy() {
    const search = this.stats.user_search;
    const strategies = {
      'Exact Email': search.successful_by_email,
      'Email Part': search.successful_by_email_part,
      'Full Name': search.successful_by_name,
      'Name Parts': search.successful_by_name_parts,
      'Fuzzy Search': search.successful_by_fuzzy
    };
    
    const max = Math.max(...Object.values(strategies));
    return Object.keys(strategies).find(key => strategies[key] === max) || 'None';
  }
  
  getSearchQuality() {
    const search = this.stats.user_search;
    const total = search.total_searches;
    if (total === 0) return 'No Data';
    
    const successRate = ((total - search.failed - search.errors) / total) * 100;
    
    if (successRate >= 80) return 'Excellent';
    if (successRate >= 60) return 'Good';
    if (successRate >= 40) return 'Fair';
    return 'Poor';
  }
  
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}м ${seconds % 60}с`;
    }
    return `${seconds}с`;
  }
  
  logFinalStats() {
    const summary = this.getSummary();
    
    logger.info('📊 === FINAL SYNC STATISTICS ===');
    logger.info(`🆕 Total created: ${summary.total.created}`);
    logger.info(`🔄 Total updated: ${summary.total.updated}`);
    logger.info(`✅ Total unchanged: ${summary.total.unchanged}`);
    logger.info(`❌ Total errors: ${summary.total.errors}`);
    logger.info(`🚫 Total skipped: ${summary.total.skipped}`);
    
    logger.info('📋 Projects: ' + 
      `${this.stats.projects.created} created, ` +
      `${this.stats.projects.updated} updated, ` +
      `${this.stats.projects.unchanged} unchanged, ` +
      `${this.stats.projects.errors} errors, ` +
      `${this.stats.projects.skipped || 0} skipped`
    );
    
    logger.info('🎯 Stages: ' + 
      `${this.stats.stages.created} created, ` +
      `${this.stats.stages.updated} updated, ` +
      `${this.stats.stages.unchanged} unchanged, ` +
      `${this.stats.stages.errors} errors, ` +
      `${this.stats.stages.skipped || 0} skipped`
    );
    
    logger.info('📦 Objects: ' + 
      `${this.stats.objects.created} created, ` +
      `${this.stats.objects.updated} updated, ` +
      `${this.stats.objects.unchanged} unchanged, ` +
      `${this.stats.objects.errors} errors, ` +
      `${this.stats.objects.skipped || 0} skipped`
    );
    
    logger.info('📑 Sections: ' + 
      `${this.stats.sections.created} created, ` +
      `${this.stats.sections.updated} updated, ` +
      `${this.stats.sections.unchanged} unchanged, ` +
      `${this.stats.sections.errors} errors, ` +
      `${this.stats.sections.skipped || 0} skipped`
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
    
    // Log user search statistics
    if (this.stats.user_search.total_searches > 0) {
      logger.info('🔍 User Search Statistics:');
      logger.info(`  Total searches: ${this.stats.user_search.total_searches}`);
      logger.info(`  By email: ${this.stats.user_search.successful_by_email}`);
      logger.info(`  By email part: ${this.stats.user_search.successful_by_email_part}`);
      logger.info(`  By name: ${this.stats.user_search.successful_by_name}`);
      logger.info(`  By name parts: ${this.stats.user_search.successful_by_name_parts}`);
      logger.info(`  By fuzzy search: ${this.stats.user_search.successful_by_fuzzy}`);
      logger.info(`  Failed: ${this.stats.user_search.failed}`);
      logger.info(`  Most effective: ${this.getMostEffectiveStrategy()}`);
      logger.info(`  Search quality: ${this.getSearchQuality()}`);
    }
  }
  
  resetStats() {
    this.stats = {
      projects: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
      stages: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
      objects: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
      sections: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
      assignments: { attempted: 0, successful: 0, failed: 0 },
      user_search: {
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
      },
      detailed_report: { actions: [] }
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
              this.stats.objects.errors + this.stats.sections.errors,
      skipped: (this.stats.projects.skipped || 0) + (this.stats.stages.skipped || 0) + 
               (this.stats.objects.skipped || 0) + (this.stats.sections.skipped || 0)
    };
    
    return { total, ...this.stats };
  }
}

module.exports = new SyncManager(); 