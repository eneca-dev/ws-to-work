/**
 * Отчёт по задачам Worksection — точка подключения к приложению.
 *
 * Всё, что нужно от app.js:
 *   const taskReport = require('./task-report');
 *   taskReport.registerRoutes(this.app);   // в setupRoutes()
 *   taskReport.initScheduler();            // в start(), рядом с основным планировщиком
 *
 * Существующие маршруты и планировщик не затрагиваются.
 */

const logger = require('../utils/logger');
const { syncTaskReport, getStatus } = require('./report-sync');
const { REPORT_DEPARTMENTS } = require('./departments');
const scheduler = require('./scheduler');

/**
 * Маршруты отчёта.
 *
 * ⚠️ POST /api/task-report/sync отвечает СРАЗУ, работа идёт в фоне.
 * У существующего /api/sync иначе: он ждёт окончания синка и только потом
 * отвечает, а в nginx не задан proxy_read_timeout (дефолт 60с) — отсюда
 * обрывы соединения на длинных прогонах. Здесь эту ошибку не повторяем.
 */
function registerRoutes(app) {
  app.post('/api/task-report/sync', (req, res) => {
    const body = req.body || {};
    const projectId = body.project_id || req.query.project_id || null;

    // Отдел задан константой REPORT_DEPARTMENTS в departments.js и через запрос
    // не меняется — параметр departments намеренно не принимается.

    // Отвечаем немедленно — прогон идёт минуты, ждать его по HTTP нельзя
    res.status(202).json({
      success: true,
      started: true,
      projectId: projectId || null,
      departments: [...REPORT_DEPARTMENTS],
      message: 'Синхронизация отчёта запущена. Прогресс: GET /api/task-report/status'
    });

    syncTaskReport({ projectId }).catch(error => {
      logger.error(`❌ Фоновая синхронизация отчёта не удалась: ${error.message}`);
    });
  });

  app.get('/api/task-report/status', async (req, res) => {
    try {
      res.json({ success: true, ...(await getStatus()) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/task-report/schedule', (req, res) => {
    res.json({ success: true, schedule: scheduler.getScheduleInfo() });
  });

  logger.info('🔌 Маршруты отчёта по задачам: /api/task-report/{sync,status,schedule}');
}

module.exports = {
  registerRoutes,
  initScheduler: scheduler.initScheduler,
  syncTaskReport,
  getStatus
};
