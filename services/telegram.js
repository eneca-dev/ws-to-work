// services/telegram.js
// Сервис для отправки уведомлений в Telegram

const axios = require('axios');
const FormData = require('form-data');
const { config } = require('../config/env');
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
  // Если уже строка ISO - используем как есть
  if (typeof date === 'string') {
    return date.replace('T', ' ').substring(0, 19);
  }
  // Если Date объект - конвертируем в ISO
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
  csv += `Projects Created,${stats.projectsCreated || 0}\n`;
  csv += `Projects Updated,${stats.projectsUpdated || 0}\n`;
  csv += `Objects Created,${stats.objectsCreated || 0}\n`;
  csv += `Objects Updated,${stats.objectsUpdated || 0}\n`;
  csv += `Sections Created,${stats.sectionsCreated || 0}\n`;
  csv += `Sections Updated,${stats.sectionsUpdated || 0}\n`;
  csv += `Decomposition Stages Created,${stats.stagesCreated || 0}\n`;
  csv += `Decomposition Stages Updated,${stats.stagesUpdated || 0}\n`;
  csv += `Stage Statuses Synced,${stats.stagesStatusSynced || 0}\n`;
  csv += `Stage Progress Synced,${stats.stagesProgressSynced || 0}\n`;
  csv += `Stages Auto-Completed (100%),${stats.stagesAutoCompleted || 0}\n`;
  csv += `Stages Skipped (No Progress Tag),${stats.stagesSkippedNoProgress || 0}\n`;
  csv += `Decomposition Items Created,${stats.itemsCreated || 0}\n`;
  csv += `Decomposition Items Updated,${stats.itemsUpdated || 0}\n`;
  csv += `Default Tasks Created,${stats.defaultTasksCreated || 0}\n`;
  csv += `Default Tasks Found Existing,${stats.defaultTasksFound || 0}\n`;
  csv += `Task Progress Updated,${stats.taskProgressUpdated || 0}\n`;
  csv += `Work Logs Created,${stats.workLogsCreated || 0}\n`;
  csv += `Work Logs Skipped,${stats.workLogsSkipped || 0}\n`;
  csv += `Budgets Updated,${stats.budgetsUpdated || 0}\n`;
  csv += `Budget Total Increase,${stats.budgetTotalIncrease ? stats.budgetTotalIncrease.toFixed(2) : '0.00'}\n`;
  csv += `Orphan Work Logs,${stats.orphanWorkLogs || 0}\n`;
  csv += `Vacations Created,${stats.vacationsCreated || 0}\n`;
  csv += `Vacations Unchanged,${stats.vacationsUnchanged || 0}\n`;
  csv += `Vacations Stale Deleted,${stats.vacationsDeletedStale || 0}\n`;
  csv += `Vacations Skipped (No Profile),${stats.vacationsSkippedNoProfile || 0}\n`;
  csv += `Vacations Skipped (Not Production Dept),${stats.vacationsSkippedNotProduction || 0}\n`;
  csv += `Total Errors,${stats.errors || 0}\n`;
  csv += '\n';

  // Секция ERROR DETAILS
  if (stats.errorDetails && stats.errorDetails.total_errors > 0) {
    csv += 'ERROR SUMMARY\n';
    csv += `Total Errors,${stats.errorDetails.total_errors}\n`;
    csv += `Critical Errors,${stats.errorDetails.critical_errors?.length || 0}\n`;
    csv += `Warnings,${stats.errorDetails.warnings?.length || 0}\n`;
    csv += '\n';

    // Группировка по типам
    if (stats.errorDetails.errors_by_type && Object.keys(stats.errorDetails.errors_by_type).length > 0) {
      csv += 'ERRORS BY TYPE\n';
      csv += 'Type,Count\n';
      Object.entries(stats.errorDetails.errors_by_type).forEach(([type, count]) => {
        csv += `${type},${count}\n`;
      });
      csv += '\n';
    }

    // Группировка по стадиям
    if (stats.errorDetails.errors_by_stage && Object.keys(stats.errorDetails.errors_by_stage).length > 0) {
      csv += 'ERRORS BY STAGE\n';
      csv += 'Stage,Count\n';
      Object.entries(stats.errorDetails.errors_by_stage).forEach(([stage, count]) => {
        csv += `${stage},${count}\n`;
      });
      csv += '\n';
    }

    // Детальная таблица критических ошибок
    if (stats.errorDetails.critical_errors && stats.errorDetails.critical_errors.length > 0) {
      csv += 'CRITICAL ERRORS DETAILS\n';
      csv += 'Timestamp,Type,Stage,Message,Project,Task/Stage,Stack Trace\n';

      stats.errorDetails.critical_errors.forEach(error => {
        const timestamp = formatDateTime(error.timestamp);
        const type = error.type || 'unknown';
        const stage = error.stage || 'unknown';
        const message = (error.message || 'No message').replace(/"/g, '""');
        const project = (error.context?.project_name || 'N/A').replace(/"/g, '""');
        const taskStage = (error.context?.task_name || error.context?.stage_name || 'N/A').replace(/"/g, '""');
        const stack = error.stack ? error.stack.substring(0, 200).replace(/"/g, '""') : 'N/A';

        csv += `${timestamp},${type},${stage},"${message}","${project}","${taskStage}","${stack}"\n`;
      });

      csv += '\n';
    }

    // Детальная таблица предупреждений
    if (stats.errorDetails.warnings && stats.errorDetails.warnings.length > 0) {
      csv += 'WARNINGS DETAILS\n';
      csv += 'Timestamp,Type,Message,Project,Task/Stage,Additional Info\n';

      stats.errorDetails.warnings.forEach(warning => {
        const timestamp = formatDateTime(warning.timestamp);
        const type = warning.type || 'unknown';
        const message = (warning.message || 'No message').replace(/"/g, '""');
        const project = (warning.context?.projectName || 'N/A').replace(/"/g, '""');
        const taskStage = (warning.context?.taskName || warning.context?.stageName || 'N/A').replace(/"/g, '""');
        const additional = JSON.stringify(warning.context?.additional || {}).replace(/"/g, '""');

        csv += `${timestamp},${type},"${message}","${project}","${taskStage}","${additional}"\n`;
      });

      csv += '\n';
    }
  }

  // Добавляем информацию о дельте, если есть
  if (stats.delta) {
    csv += 'DELTA (Added by Sync)\n';
    csv += `Projects Added,${stats.delta.projects}\n`;
    csv += `Objects Added,${stats.delta.objects}\n`;
    csv += `Sections Added,${stats.delta.sections}\n`;
    csv += `Decomposition Stages Added,${stats.delta.decomposition_stages}\n`;
    csv += `Decomposition Items Added,${stats.delta.decomposition_items}\n`;
    csv += `Total Added,${stats.delta.total}\n`;
    csv += '\n';
    csv += 'COUNT BEFORE/AFTER\n';
    csv += `Projects Before,${stats.countBefore.projects}\n`;
    csv += `Projects After,${stats.countAfter.projects}\n`;
    csv += `Objects Before,${stats.countBefore.objects}\n`;
    csv += `Objects After,${stats.countAfter.objects}\n`;
    csv += `Sections Before,${stats.countBefore.sections}\n`;
    csv += `Sections After,${stats.countAfter.sections}\n`;
    csv += `Decomposition Stages Before,${stats.countBefore.decomposition_stages}\n`;
    csv += `Decomposition Stages After,${stats.countAfter.decomposition_stages}\n`;
    csv += `Decomposition Items Before,${stats.countBefore.decomposition_items}\n`;
    csv += `Decomposition Items After,${stats.countAfter.decomposition_items}\n`;
    csv += `Total Before,${stats.countBefore.total}\n`;
    csv += `Total After,${stats.countAfter.total}\n`;
    csv += '\n';
  }

  // Добавляем детальную таблицу пропущенных отчетов, если есть
  if (stats.failedWorkLogs && stats.failedWorkLogs.length > 0) {
    csv += 'FAILED WORK LOGS DETAILS\n';
    csv += 'Cost ID,User Email,User Name,Date,Hours,Amount,Task ID,Task Name,Parent Task,Project,Reason\n';

    stats.failedWorkLogs.forEach(failed => {
      const costId = failed.cost_id || 'N/A';
      const userEmail = (failed.user_email || 'N/A').replace(/"/g, '""');
      const userName = (failed.user_name || 'N/A').replace(/"/g, '""');
      const date = failed.date || 'N/A';
      const hours = failed.hours || 0;
      const amount = failed.amount ? failed.amount.toFixed(2) : '0.00';
      const taskId = failed.task_id || 'N/A';
      const taskName = (failed.task_name || 'N/A').replace(/"/g, '""');
      const parentTask = (failed.parent_task || 'N/A').replace(/"/g, '""');
      const project = (failed.project_name || 'N/A').replace(/"/g, '""');
      const reason = (failed.reason || 'Unknown').replace(/"/g, '""');

      csv += `${costId},"${userEmail}","${userName}",${date},${hours},${amount},${taskId},"${taskName}","${parentTask}","${project}","${reason}"\n`;
    });

    csv += '\n';
  }

  csv += 'DETAILED LOGS\n';

  // Ограничиваем количество логов: первые 500 + последние 500.
  // Полные логи и так почти никогда не читаются целиком — начало (что вообще
  // стартовало) и конец (чем закончилось/какие ошибки) покрывают почти все
  // разборы инцидентов, а файл остаётся маленьким и открывается мгновенно.
  const MAX_FIRST_LOGS = 500;
  const MAX_LAST_LOGS = 500;
  const MAX_TOTAL_LOGS = MAX_FIRST_LOGS + MAX_LAST_LOGS;

  let logsToInclude = [];

  if (logs.length <= MAX_TOTAL_LOGS) {
    // Если логов мало - включаем все
    logsToInclude = logs;
  } else {
    // Берем первые 10,000 и последние 10,000
    const firstLogs = logs.slice(0, MAX_FIRST_LOGS);
    const lastLogs = logs.slice(-MAX_LAST_LOGS);
    logsToInclude = firstLogs.concat(lastLogs);

    csv += `Note: Showing first ${MAX_FIRST_LOGS} and last ${MAX_LAST_LOGS} of ${logs.length} total logs (${logs.length - MAX_TOTAL_LOGS} logs omitted from middle)\n`;
  }

  csv += 'Timestamp,Level,Message\n';

  logsToInclude.forEach(log => {
    const timestamp = formatDateTime(log.timestamp);
    const level = log.level;
    const message = log.message.replace(/"/g, '""'); // Экранируем кавычки
    csv += `${timestamp},${level},"${message}"\n`;
  });

  return csv;
}

/**
 * Возвращает массив chat IDs для отправки сообщений
 */
function getChatIds() {
  const ids = [config.telegram.chatId];
  if (config.telegram.chatId2) {
    ids.push(config.telegram.chatId2);
  }
  return ids;
}

/**
 * Отправляет текстовое сообщение в конкретный Telegram чат
 */
async function sendMessageToChat(text, chatId) {
  const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
  await axios.post(url, {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  }, {
    timeout: 10000
  });
}

/**
 * Отправляет текстовое сообщение во все настроенные Telegram чаты
 */
async function sendMessage(text) {
  if (!config.telegram.enabled) {
    return;
  }

  const chatIds = getChatIds();
  const results = await Promise.allSettled(
    chatIds.map(chatId => sendMessageToChat(text, chatId))
  );

  // Логируем результаты для каждого чата
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.warning(`⚠️ Не удалось отправить сообщение в Telegram чат ${chatIds[index]}: ${result.reason.message}`);
    } else {
      logger.info(`✅ Сообщение отправлено в Telegram чат ${chatIds[index]}`);
    }
  });
}

/**
 * Отправляет уведомление о начале синхронизации
 */
async function sendSyncStarted(totalProjects, countBefore) {
  const message = `🚀 <b>Синхронизация запущена</b>\n` +
    `⏰ Время: ${formatDateTime(new Date())}\n` +
    `📊 Проектов в Worksection: ${totalProjects}\n` +
    `📊 Текущее состояние базы:\n` +
    `   📋 Проекты: ${countBefore.projects}\n` +
    `   📦 Объекты: ${countBefore.objects}\n` +
    `   📑 Разделы: ${countBefore.sections}\n` +
    `   🔹 Этапы декомпозиции: ${countBefore.decomposition_stages}\n` +
    `   🔸 Задачи декомпозиции: ${countBefore.decomposition_items}\n` +
    `   🔢 Всего: ${countBefore.total} записей`;

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
 * Отправляет CSV файл в конкретный Telegram чат
 */
async function sendCsvFileToChat(csvContent, filename, caption, chatId) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', Buffer.from(csvContent, 'utf-8'), {
    filename: filename,
    contentType: 'text/csv'
  });
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendDocument`;

  try {
    await axios.post(url, formData, {
      headers: formData.getHeaders(),
      timeout: 60000, // Увеличен таймаут до 60 секунд
      maxBodyLength: 50 * 1024 * 1024 // Максимум 50 MB
    });
  } catch (error) {
    // Если ошибка 413 (файл слишком большой) - отправить только caption
    if (error.response?.status === 413) {
      logger.warning(`⚠️ CSV file too large for Telegram (413), sending summary only to chat ${chatId}`);
      const fallbackMessage = caption + '\n\n⚠️ <i>CSV файл слишком большой для отправки (превышен лимит Telegram API)</i>';
      await sendMessageToChat(fallbackMessage, chatId);
    } else {
      throw error;
    }
  }
}

/**
 * Отправляет CSV файл во все настроенные Telegram чаты
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
    let caption = `📊 <b>Синхронизация завершена</b>\n` +
      `⏱ Длительность: ${Math.round((endTime - startTime) / 1000)}s\n\n` +

      `<b>Основные метрики:</b>\n` +
      `✅ Проекты: ${stats.projectsCreated} создано, ${stats.projectsUpdated} обновлено\n` +
      `📦 Объекты: ${stats.objectsCreated} создано, ${stats.objectsUpdated} обновлено\n` +
      `📑 Разделы: ${stats.sectionsCreated} создано, ${stats.sectionsUpdated} обновлено\n` +
      `🔹 Этапы декомпозиции: ${stats.stagesCreated || 0} создано, ${stats.stagesUpdated || 0} обновлено\n` +
      `🔸 Задачи декомпозиции: ${stats.itemsCreated || 0} создано, ${stats.itemsUpdated || 0} обновлено\n\n`;

    // Новая секция: Статусы и прогресс
    if (stats.stagesStatusSynced || stats.stagesProgressSynced || stats.stagesAutoCompleted) {
      caption += `<b>Статусы и прогресс этапов:</b>\n` +
        `🔹 Статусов синхронизировано: ${stats.stagesStatusSynced || 0}\n` +
        `📊 Прогресса обновлено: ${stats.stagesProgressSynced || 0}\n` +
        `🎯 Автоматически 100%: ${stats.stagesAutoCompleted || 0}\n`;

      if (stats.defaultTasksCreated || stats.defaultTasksFound) {
        caption += `🔸 Дефолтных задач создано: ${stats.defaultTasksCreated || 0}\n` +
          `🔸 Дефолтных задач найдено: ${stats.defaultTasksFound || 0}\n`;
      }

      caption += '\n';
    }

    // Секция отпусков
    if (stats.vacationsCreated || stats.vacationsDeletedStale || stats.vacationsSkippedNotProduction) {
      caption += `<b>Отпуска:</b>\n` +
        `🏖️ Создано: ${stats.vacationsCreated || 0}, без изменений: ${stats.vacationsUnchanged || 0}\n` +
        `🗑️ Удалено протухших: ${stats.vacationsDeletedStale || 0}\n`;
      if (stats.vacationsSkippedNoProfile || stats.vacationsSkippedNotProduction) {
        caption += `🚫 Пропущено: ${stats.vacationsSkippedNoProfile || 0} без профиля, ${stats.vacationsSkippedNotProduction || 0} не из производственных отделов\n`;
      }
      caption += '\n';
    }

    // Секция ошибок и предупреждений
    if (stats.errors > 0 || (stats.errorDetails && stats.errorDetails.warnings && stats.errorDetails.warnings.length > 0)) {
      caption += `<b>Ошибки и предупреждения:</b>\n`;

      if (stats.errorDetails && stats.errorDetails.critical_errors && stats.errorDetails.critical_errors.length > 0) {
        caption += `❌ Критических ошибок: ${stats.errorDetails.critical_errors.length}\n`;
      }

      if (stats.errorDetails && stats.errorDetails.warnings && stats.errorDetails.warnings.length > 0) {
        caption += `⚠️ Предупреждений: ${stats.errorDetails.warnings.length}\n`;

        // Показать топ-3 типа предупреждений
        const warningTypes = {};
        stats.errorDetails.warnings.forEach(w => {
          warningTypes[w.type] = (warningTypes[w.type] || 0) + 1;
        });
        const topWarnings = Object.entries(warningTypes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

        topWarnings.forEach(([type, count]) => {
          caption += `   • ${type}: ${count}\n`;
        });
      }

      caption += `\n📄 Детали в CSV файле\n\n`;
    } else {
      caption += `✨ <b>Без ошибок</b>\n\n`;
    }

    // Добавляем информацию о дельте, если есть
    if (stats.delta) {
      caption += `<b>📈 Добавлено синхронизацией:</b>\n` +
        `📋 Проекты: ${stats.delta.projects}\n` +
        `📦 Объекты: ${stats.delta.objects}\n` +
        `📑 Разделы: ${stats.delta.sections}\n` +
        `🔹 Этапы декомпозиции: ${stats.delta.decomposition_stages}\n` +
        `🔸 Задачи декомпозиции: ${stats.delta.decomposition_items}\n` +
        `🔢 Всего: ${stats.delta.total} записей`;
    }

    // Telegram обрезает/отклоняет caption документа длиннее 1024 символов —
    // при большом количестве секций (ошибки + отпуска + дельта и т.д.) легко
    // превысить лимит, и тогда sendDocument падает с 400 и отчёт не уходит
    // вообще. Подстраховываемся: если не влезает — обрезаем caption, полная
    // статистика в любом случае есть в самом CSV.
    const TELEGRAM_CAPTION_LIMIT = 1024;
    if (caption.length > TELEGRAM_CAPTION_LIMIT) {
      const suffix = '\n\n📄 Полный отчёт — в приложенном CSV';
      caption = caption.substring(0, TELEGRAM_CAPTION_LIMIT - suffix.length) + suffix;
    }

    // Отправляем в все чаты
    const chatIds = getChatIds();
    const results = await Promise.allSettled(
      chatIds.map(chatId => sendCsvFileToChat(csvContent, filename, caption, chatId))
    );

    // Логируем результаты для каждого чата
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.warning(`⚠️ Не удалось отправить CSV в Telegram чат ${chatIds[index]}: ${result.reason.message}`);
      } else {
        logger.info(`✅ CSV отправлен в Telegram чат ${chatIds[index]}`);
      }
    });
  } catch (error) {
    // Ошибка отправки в Telegram не должна ломать основной процесс
    logger.warning(`⚠️ Ошибка при отправке логов в Telegram: ${error.message}`);
  }
}

module.exports = {
  sendSyncStarted,
  sendError,
  sendCsvFile,
  // Произвольное сообщение (HTML). Используется синхронизацией отчёта,
  // которая отрабатывает уже после отправки основного отчёта в чат.
  sendMessage
};
