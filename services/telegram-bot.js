// services/telegram-bot.js
// Обработчик команд Telegram бота

const axios = require('axios');
const { config } = require('../config/env');
const logger = require('../utils/logger');
const syncManager = require('../sync/sync-manager');

/**
 * Отправляет текстовое сообщение в Telegram
 */
async function sendMessage(chatId, text) {
  if (!config.telegram.enabled) {
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    }, {
      timeout: 10000
    });
  } catch (error) {
    logger.warning(`⚠️ Не удалось отправить сообщение в Telegram: ${error.message}`);
  }
}

/**
 * Обработчик команды /start_sync
 */
async function handleStartSync(chatId) {
  try {
    // Отправляем подтверждение начала
    await sendMessage(chatId, '⏳ <b>Запускаю синхронизацию...</b>');

    // Запускаем полную синхронизацию
    // offset=0, limit=999 (все проекты), sendNotifications=true
    const result = await syncManager.fullSync(0, 999, true);

    // Результат уже отправлен в Telegram через sync-manager
    logger.info('Синхронизация завершена через Telegram бот');
  } catch (error) {
    logger.error(`Ошибка при запуске синхронизации через бота: ${error.message}`);
    await sendMessage(chatId, `❌ <b>Ошибка запуска синхронизации</b>\n${error.message}`);
  }
}

/**
 * Обработчик команды /help
 */
async function handleHelp(chatId) {
  const helpText = `
📚 <b>Доступные команды:</b>

/start_sync - Запустить синхронизацию Worksection → eneca.work
/help - Показать это сообщение

<i>Бот автоматически отправляет уведомления о начале и завершении синхронизации.</i>
  `;

  await sendMessage(chatId, helpText.trim());
}

/**
 * Обработчик входящих сообщений от Telegram
 */
async function handleUpdate(update) {
  try {
    // Проверяем наличие сообщения
    if (!update.message || !update.message.text) {
      return;
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();

    logger.info(`Получена команда от Telegram: ${text} (chat_id: ${chatId})`);

    // Проверяем что команда от правильного пользователя
    if (chatId.toString() !== config.telegram.chatId.toString()) {
      logger.warning(`Отклонена команда от неавторизованного пользователя: ${chatId}`);
      return;
    }

    // Обрабатываем команды
    if (text === '/start_sync') {
      await handleStartSync(chatId);
    } else if (text === '/help' || text === '/start') {
      await handleHelp(chatId);
    } else {
      // Неизвестная команда
      await sendMessage(chatId, 'Неизвестная команда. Используйте /help для списка команд.');
    }
  } catch (error) {
    logger.error(`Ошибка обработки Telegram update: ${error.message}`);
  }
}

/**
 * Устанавливает webhook для Telegram бота
 */
async function setWebhook(webhookUrl) {
  if (!config.telegram.enabled) {
    logger.info('Telegram не настроен, webhook не устанавливается');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/setWebhook`;
    const response = await axios.post(url, {
      url: webhookUrl
    });

    if (response.data.ok) {
      logger.info(`✅ Telegram webhook установлен: ${webhookUrl}`);
    } else {
      logger.warning(`⚠️ Не удалось установить webhook: ${response.data.description}`);
    }
  } catch (error) {
    logger.error(`Ошибка установки Telegram webhook: ${error.message}`);
  }
}

/**
 * Получает информацию о боте
 */
async function getBotInfo() {
  if (!config.telegram.enabled) {
    return null;
  }

  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/getMe`;
    const response = await axios.get(url);
    return response.data.result;
  } catch (error) {
    logger.error(`Ошибка получения информации о боте: ${error.message}`);
    return null;
  }
}

module.exports = {
  handleUpdate,
  setWebhook,
  getBotInfo,
  sendMessage
};
