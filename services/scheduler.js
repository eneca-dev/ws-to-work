const cron = require('node-cron');
const logger = require('../utils/logger');
const syncManager = require('../sync/sync-manager');

// Расписание синхронизации (часы)
const SYNC_HOURS = [0, 3, 6, 9, 12, 15, 18, 21]; // Каждые 3 часа
const TIMEZONE = 'Europe/Minsk'; // Временная зона

/**
 * Выполняет запланированную синхронизацию
 */
async function runScheduledSync() {
  const now = new Date();
  const currentHour = now.getHours();

  const timeString = now.toLocaleString('ru-RU', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  logger.info(`⏰ Запуск автоматической синхронизации в ${timeString}`);

  // Определяем режим синхронизации отчетов
  const costsMode = currentHour === 9 ? 'daily' : 'skip';
  logger.info(`💰 Costs mode: ${costsMode}`);

  try {
    // Запускаем полную синхронизацию (все проекты)
    await syncManager.fullSync(0, 999, true, null, costsMode);
    logger.success('✅ Автоматическая синхронизация завершена успешно');
  } catch (error) {
    logger.error(`❌ Ошибка автоматической синхронизации: ${error.message}`);
    console.error(error.stack);
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

module.exports = {
  initScheduler,
  getScheduleInfo,
  runScheduledSync
};
