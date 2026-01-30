#!/usr/bin/env node
// scripts/scheduled-sync.js
// Скрипт автоматической синхронизации по расписанию (каждые 3 часа)

require('dotenv').config();
const syncManager = require('../sync/sync-manager');
const logger = require('../utils/logger');

/**
 * Проверяет, является ли сегодня выходным днём
 */
function isWeekend() {
  const now = new Date();
  const dayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Minsk' })).getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Проверяет, нужно ли запускать синхронизацию в текущий час
 */
function shouldRunSync() {
  const currentHour = new Date().getHours();
  // Запускаем синхронизацию в 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00
  return currentHour % 3 === 0;
}

/**
 * Главная функция
 */
async function main() {
  const now = new Date();
  const currentHour = now.getHours();

  console.log(`[${now.toISOString()}] Scheduled sync check: hour ${currentHour}`);

  // Пропускаем выходные
  if (isWeekend()) {
    console.log(`📅 Weekend day, skipping sync`);
    process.exit(0);
  }

  if (!shouldRunSync()) {
    console.log(`Skipping sync - not scheduled for hour ${currentHour}`);
    console.log(`Next sync at: ${Math.ceil(currentHour / 3) * 3}:00`);
    process.exit(0);
  }

  console.log(`✅ Starting scheduled sync at hour ${currentHour}`);

  try {
    // Режим синхронизации отчетов: всегда 'daily' (отчеты за вчера)
    const costsMode = 'daily';

    console.log(`💰 Costs mode: ${costsMode} (syncing yesterday's reports)`);
    console.log(`📊 Parameters: offset=0, limit=999`);

    // Запускаем полную синхронизацию
    // offset=0, limit=999 (все проекты), sendNotifications=true, projectId=null, costsMode=daily
    const result = await syncManager.fullSync(0, 999, true, null, costsMode);

    if (result.success) {
      console.log(`✅ Scheduled sync completed successfully`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Projects: ${result.stats.projects.created} created, ${result.stats.projects.updated} updated`);
      console.log(`Objects: ${result.stats.objects.created} created, ${result.stats.objects.updated} updated`);
      console.log(`Sections: ${result.stats.sections.created} created, ${result.stats.sections.updated} updated`);

      if (result.stats.work_logs) {
        console.log(`Work logs: ${result.stats.work_logs.created} created, ${result.stats.work_logs.skipped} skipped`);
      }

      if (result.stats.orphan_work_logs && result.stats.orphan_work_logs.total > 0) {
        console.log(`⚠️  Found ${result.stats.orphan_work_logs.total} orphan work_logs`);
      }

      process.exit(0);
    } else {
      console.error(`❌ Scheduled sync failed`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Scheduled sync error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Обработка сигналов для graceful shutdown
process.on('SIGTERM', () => {
  console.log('Получен SIGTERM, завершение работы...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Получен SIGINT, завершение работы...');
  process.exit(0);
});

// Запуск скрипта
main();
