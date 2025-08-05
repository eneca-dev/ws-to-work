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
    // Более явные CORS настройки для диагностики
    this.app.use(cors({
      origin: true, // Разрешить любой origin
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));
    
    this.app.use(express.json({ limit: '10mb' })); // Увеличиваем лимит JSON
    this.app.use(express.static(path.join(__dirname, 'public')));
  }
  
  setupRoutes() {
    // OPTIONS handler for CORS preflight
    this.app.options('/api/sync', (req, res) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.sendStatus(200);
    });
    
    // Main sync endpoint
    this.app.post('/api/sync', async (req, res) => {
      try {
        // Clear old logs before starting
        logger.clearLogs();
        logger.info('Starting full synchronization via API');
        
        const result = await syncManager.fullSync();
        
        // ВРЕМЕННО убираем логи из ответа для диагностики размера
        // const currentLogs = logger.getLogs();
        // result.logs = currentLogs.slice(-50).map(log => ({
        //   timestamp: log.timestamp,
        //   level: log.level,
        //   message: log.message
        // }));
        result.logs = ["Logs temporarily disabled for size optimization"];
        
        // ВРЕМЕННО убираем детальный отчет для уменьшения размера
        if (result.detailed_report && result.detailed_report.all_actions) {
          const originalCount = result.detailed_report.all_actions.length;
          result.detailed_report.all_actions = result.detailed_report.all_actions.slice(-10); // Только последние 10
          result.detailed_report.size_note = `Showing last 10 of ${originalCount} actions`;
        }
        
        logger.info('Full synchronization completed via API');
        
        // Логируем размер ответа для диагностики
        const responseSize = JSON.stringify(result).length;
        logger.info(`Response size: ${responseSize} bytes (${(responseSize/1024).toFixed(1)} KB)`);
        
        // Убеждаемся что CORS заголовки установлены ПЕРЕД отправкой
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        
        res.json(result);
        
      } catch (error) {
        logger.error(`Full sync API error: ${error.message}`);
        
        // Добавляем CORS заголовки и для ошибок
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        
        res.status(500).json({
          success: false,
          error: error.message,
          logs: ["Error logs temporarily disabled"] // Убираем логи и из ошибок
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