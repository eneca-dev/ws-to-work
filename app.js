const express = require('express');
const cors = require('cors');
const path = require('path');
const { config, validateConfig } = require('./config/env');
const syncManager = require('./sync/sync-manager');
const logger = require('./utils/logger');

class SyncApp {
  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }
  
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }
  
  setupRoutes() {
    // Main sync endpoint
    this.app.post('/api/sync', async (req, res) => {
      try {
        // Clear old logs before starting
        logger.clearLogs();
        logger.info('Starting full synchronization via API');
        
        const result = await syncManager.fullSync();
        
        // Add only current session logs to response (limit to last 200 for safety)
        const currentLogs = logger.getLogs();
        result.logs = currentLogs.slice(-200).map(log => ({
          timestamp: log.timestamp,
          level: log.level,
          message: log.message
        }));
        
        logger.info('Full synchronization completed via API');
        res.json(result);
        
      } catch (error) {
        logger.error(`Full sync API error: ${error.message}`);
        res.status(500).json({
          success: false,
          error: error.message,
          logs: logger.getLogs().slice(-100) // Limit error logs too
        });
      }
    });
    
    // Get current logs
    this.app.get('/api/logs', (req, res) => {
      res.json(logger.getLogs());
    });
    
    // Clear logs
    this.app.post('/api/logs/clear', (req, res) => {
      logger.clearLogs();
      res.json({ success: true });
    });
    
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        config: {
          supabaseUrl: config.supabase.url ? 'configured' : 'missing',
          supabaseKey: config.supabase.key ? 'configured' : 'missing',
          worksectionDomain: config.worksection.domain ? 'configured' : 'missing',
          worksectionHash: config.worksection.hash ? 'configured' : 'missing'
        }
      });
    });
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }
  
  setupErrorHandling() {
    this.app.use((err, req, res, next) => {
      logger.error(`Server error: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message
      });
    });
    
    // Handle 404
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });
  }
  
  start() {
    try {
      // Validate configuration
      validateConfig();
      logger.success('Configuration validated');
      
      // Start server
      this.app.listen(config.port, () => {
        logger.success(`🚀 Sync server started on port ${config.port}`);
        logger.info(`📱 Web interface: http://localhost:${config.port}`);
        logger.info(`🔌 API endpoint: http://localhost:${config.port}/api/sync`);
      });
      
    } catch (error) {
      logger.error(`Failed to start server: ${error.message}`);
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the application
const app = new SyncApp();
app.start(); 