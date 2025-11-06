// services/telegram.js
// Сервис для отправки уведомлений в Telegram

const axios = require('axios');
const FormData = require('form-data');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * Форматирует дату и время для имени файла
 */
function formatDateForFilename(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Форматирует дату и время для CSV
 */
function formatDateTime(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Генерирует CSV контент из логов и статистики
 */
function generateCsvContent(logs, stats, startTime, endTime) {
  const duration = Math.round((endTime - startTime) / 1000);

  let csv = 'SYNC SUMMARY\n';
  csv += `Started,${formatDateTime(startTime)}\n`;
  csv += `Finished,${formatDateTime(endTime)}\n`;
  csv += `Duration,"${duration}s"\n`;
  csv += '\n';

  csv += 'STATISTICS\n';
  csv += `Projects Created,${stats.projectsCreated}\n`;
  csv += `Projects Updated,${stats.projectsUpdated}\n`;
  csv += `Stages Created,${stats.stagesCreated}\n`;
  csv += `Objects Created,${stats.objectsCreated}\n`;
  csv += `Objects Updated,${stats.objectsUpdated}\n`;
  csv += `Sections Created,${stats.sectionsCreated}\n`;
  csv += `Sections Updated,${stats.sectionsUpdated}\n`;
  csv += `Total Errors,${stats.errors}\n`;
  csv += '\n';

  csv += 'DETAILED LOGS\n';
  csv += 'Timestamp,Level,Message\n';

  logs.forEach(log => {
    const timestamp = formatDateTime(log.timestamp);
    const level = log.level;
    const message = log.message.replace(/"/g, '""'); // Экранируем кавычки
    csv += `${timestamp},${level},"${message}"\n`;
  });

  return csv;
}

/**
 * Отправляет текстовое сообщение в Telegram
 */
async function sendMessage(text) {
  if (!config.telegram.enabled) {
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    await axios.post(url, {
      chat_id: config.telegram.chatId,
      text: text,
      parse_mode: 'HTML'
    }, {
      timeout: 10000
    });
  } catch (error) {
    // Ошибки Telegram не ломают основной процесс
    logger.warning(`⚠️ Не удалось отправить сообщение в Telegram: ${error.message}`);
  }
}

/**
 * Отправляет уведомление о начале синхронизации
 */
async function sendSyncStarted(offset, limit) {
  const message = `🚀 <b>Синхронизация запущена</b>\n` +
    `⏰ Время: ${formatDateTime(new Date())}\n` +
    `📄 Параметры: offset=${offset}, limit=${limit}`;

  await sendMessage(message);
}

/**
 * Отправляет уведомление об ошибке
 */
async function sendError(error, context = '') {
  const message = `❌ <b>Ошибка синхронизации</b>\n` +
    `⏰ Время: ${formatDateTime(new Date())}\n` +
    (context ? `📍 Контекст: ${context}\n` : '') +
    `⚠️ Ошибка: ${error.message}\n` +
    (error.stack ? `\n<code>${error.stack.substring(0, 500)}</code>` : '');

  await sendMessage(message);
}

/**
 * Отправляет CSV файл в Telegram
 */
async function sendCsvFile(logs, stats, startTime, endTime) {
  // Проверяем, включены ли уведомления
  if (!config.telegram.enabled) {
    return;
  }

  try {
    const csvContent = generateCsvContent(logs, stats, startTime, endTime);
    const filename = `sync_${formatDateForFilename(endTime)}.csv`;

    // Формируем сообщение-заголовок
    const caption = `📊 Синхронизация завершена\n` +
      `⏱ Длительность: ${Math.round((endTime - startTime) / 1000)}s\n` +
      `✅ Проекты: ${stats.projectsCreated} создано, ${stats.projectsUpdated} обновлено\n` +
      `📦 Объекты: ${stats.objectsCreated} создано, ${stats.objectsUpdated} обновлено\n` +
      `${stats.errors > 0 ? `❌ Ошибки: ${stats.errors}` : '✨ Без ошибок'}`;

    // Создаем FormData для отправки файла
    const formData = new FormData();
    formData.append('chat_id', config.telegram.chatId);
    formData.append('document', Buffer.from(csvContent, 'utf-8'), {
      filename: filename,
      contentType: 'text/csv'
    });
    formData.append('caption', caption);

    // Отправляем файл через Telegram Bot API
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendDocument`;
    await axios.post(url, formData, {
      headers: formData.getHeaders(),
      timeout: 10000 // 10 секунд таймаут
    });

    logger.info('✅ Логи отправлены в Telegram');
  } catch (error) {
    // Ошибка отправки в Telegram не должна ломать основной процесс
    logger.warning(`⚠️ Не удалось отправить логи в Telegram: ${error.message}`);
  }
}

module.exports = {
  sendSyncStarted,
  sendError,
  sendCsvFile
};
