#!/usr/bin/env node
// scripts/scheduled-sync.js
// Скрипт автоматической синхронизации по расписанию (каждые 3 часа)

require('dotenv').config();
const syncManager = require('../sync/sync-manager');
const logger = require('../utils/logger');

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

  if (!shouldRunSync()) {
    console.log(`Skipping sync - not scheduled for hour ${currentHour}`);
    console.log(`Next sync at: ${Math.ceil(currentHour / 3) * 3}:00`);
    process.exit(0);
  }

  console.log(`✅ Starting scheduled sync at hour ${currentHour}`);

  try {
    // Запускаем полную синхронизацию
    // offset=0, limit=999 (все проекты), sendNotifications=true
    const result = await syncManager.fullSync(0, 999, true);

    if (result.success) {
      console.log(`✅ Scheduled sync completed successfully`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Projects: ${result.stats.projects.created} created, ${result.stats.projects.updated} updated`);
      console.log(`Objects: ${result.stats.objects.created} created, ${result.stats.objects.updated} updated`);
      console.log(`Sections: ${result.stats.sections.created} created, ${result.stats.sections.updated} updated`);
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

// Запуск скрипта
main();
