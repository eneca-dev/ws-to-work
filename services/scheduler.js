const cron = require('node-cron');
const logger = require('../utils/logger');
const syncManager = require('../sync/sync-manager');

// Расписание синхронизации (каждые 3 часа)
const SYNC_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const TIMEZONE = 'Europe/Minsk';

// Флаг выполнения синхронизации (защита от наложения)
let syncInProgress = false;

/**
 * Обработчики, которые запускаются ПОСЛЕ окончания основной синхронизации.
 * Регистрируются через onSyncFinished(). Нужны, чтобы смежные синхронизации
 * (например task-report) шли следом, а не параллельно.
 */
const afterSyncHooks = [];

/**
 * Проверяет, является ли сегодня выходным днём (суббота или воскресенье)
 * @returns {boolean} true если выходной
 */
function isWeekend() {
  const now = new Date();
  // Получаем день недели в таймзоне Минска
  const dayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE })).getDay();
  // 0 = воскресенье, 6 = суббота
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Выполняет запланированную синхронизацию
 */
async function runScheduledSync() {
  const now = new Date();
  const timeString = now.toLocaleString('ru-RU', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  // Определяем текущий час в таймзоне Минска (исправленный метод)
  const minsk = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const currentHour = minsk.getHours();

  const isWeekendDay = isWeekend();

  // В выходные запускаем ТОЛЬКО в 6:00 с отчетами
  if (isWeekendDay && currentHour !== 6) {
    logger.info(`📅 ${timeString} — выходной день, синхронизация только в 6:00 (сейчас ${currentHour}:00)`);
    return;
  }

  if (isWeekendDay) {
    logger.info(`📅 ${timeString} — выходной день: запуск синхронизации в 6:00 (без отчётов)`);
  }

  // Защита от наложения синхронизаций
  if (syncInProgress) {
    logger.warning(`⚠️ ${timeString} — синхронизация уже выполняется, пропуск`);
    return;
  }

  // Синхронизация отчётов (work_logs) отключена по расписанию — всегда 'skip'.
  // Ранее в 6:00 запускался режим 'daily', но фактически work_logs не пополнялись
  // с 30.04.2026. Запустить вручную по-прежнему можно через POST /api/sync
  // с телом { "costs_mode": "daily" | "full" | "date" }.
  const costsMode = 'skip';

  logger.info(`⏰ Запуск автоматической синхронизации в ${timeString}`);
  logger.info(`📊 Параметры: offset=0, limit=999, costsMode=${costsMode}${costsMode === 'daily' ? ' (отчёты за вчера)' : ' (без отчётов)'}`);

  syncInProgress = true;
  let succeeded = false;

  try {
    // Запускаем синхронизацию (отчёты только в 6:00)
    await syncManager.fullSync(0, 999, true, null, costsMode);
    succeeded = true;
    logger.success('✅ Автоматическая синхронизация завершена успешно');
  } catch (error) {
    logger.error(`❌ Ошибка автоматической синхронизации: ${error.message}`);
    console.error(error.stack);
  } finally {
    syncInProgress = false;
  }

  // Хуки «после основной синхронизации». Запускаются, когда флаг уже снят,
  // чтобы подписчик не увидел синхронизацию как ещё идущую.
  // Ошибка в хуке не влияет ни на основную синхронизацию, ни на другие хуки.
  for (const hook of afterSyncHooks) {
    try {
      await hook({ succeeded });
    } catch (error) {
      logger.error(`❌ Хук после синхронизации упал: ${error.message}`);
    }
  }
}

/**
 * Инициализирует планировщик задач
 */
function initScheduler() {
  console.log('-'.repeat(60));
  logger.info('⏰ Инициализация планировщика автоматической синхронизации...');
  logger.info(`📅 Расписание: ${SYNC_HOURS.map(h => `${h}:00`).join(', ')} (${TIMEZONE})`);

  // Создаем задачу для каждого часа из расписания
  SYNC_HOURS.forEach((hour) => {
    // Cron pattern: минута час * * *
    // '0 8 * * *' = каждый день в 8:00
    const cronPattern = `0 ${hour} * * *`;

    cron.schedule(cronPattern, runScheduledSync, {
      timezone: TIMEZONE
    });

    logger.success(`✅ Задача создана: синхронизация каждый день в ${hour}:00`);
  });

  logger.success('✨ Планировщик инициализирован! Автоматическая синхронизация активна.');
  console.log('-'.repeat(60));
}

/**
 * Получить информацию о расписании
 */
function getScheduleInfo() {
  return {
    enabled: true,
    hours: SYNC_HOURS,
    timezone: TIMEZONE,
    schedule: SYNC_HOURS.map(h => `${h}:00`).join(', ')
  };
}

/**
 * Идёт ли сейчас основная синхронизация.
 * Нужно синхронизации отчёта (task-report/scheduler.js), чтобы не стартовать
 * поверх неё и не конкурировать за лимиты Worksection API.
 */
function isSyncInProgress() {
  return syncInProgress;
}

/**
 * Подписаться на окончание основной синхронизации.
 * Обработчик получает { succeeded } и выполняется последовательно,
 * когда флаг syncInProgress уже снят.
 *
 * @param {(result: {succeeded: boolean}) => Promise<void>} handler
 */
function onSyncFinished(handler) {
  afterSyncHooks.push(handler);
}

module.exports = {
  initScheduler,
  getScheduleInfo,
  runScheduledSync,
  isSyncInProgress,
  onSyncFinished
};
