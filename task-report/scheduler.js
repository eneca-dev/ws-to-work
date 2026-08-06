/**
 * Запуск синхронизации отчёта по задачам.
 *
 * Собственного расписания НЕТ. Отчёт запускается следом за основной
 * синхронизацией — через хук onSyncFinished в services/scheduler.js.
 *
 * Почему так, а не по своему крону:
 *   - накладок не бывает по построению, а не по счастливому совпадению времени
 *   - обе синхронизации бьют один и тот же Worksection API; идя друг за другом,
 *     они не конкурируют за лимиты
 *   - основная идёт около часа и её длительность плавает — подобрать
 *     безопасные слоты заранее нельзя
 *
 * Основная синхронизация ходит в 0:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00,
 * 21:00 по будням (в выходные только в 6:00) — столько же раз отработает и отчёт.
 *
 * Ручной запуск кнопкой на странице работает независимо от всего этого.
 *
 * На всякий случай оставлена возможность включить собственный крон переменной
 * TASK_REPORT_CRON — по умолчанию она не задана и крон не создаётся.
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const telegram = require('../services/telegram');
const { syncTaskReport } = require('./report-sync');
const mainScheduler = require('../services/scheduler');

const TIMEZONE = 'Europe/Minsk';

/** Необязательный собственный крон. Пусто = запуск только следом за основной. */
const CRON_PATTERN = process.env.TASK_REPORT_CRON || null;

let cronTask = null;
let subscribed = false;

function nowLabel() {
  return new Date().toLocaleString('ru-RU', {
    timeZone: TIMEZONE,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Уведомление в Telegram об итогах прогона.
 *
 * Отдельным сообщением, а не в общем отчёте синхронизации: тот отправляется
 * внутри fullSync, то есть ещё до того, как отчёт начинает работать.
 *
 * Telegram не обязателен — если он выключен, sendMessage просто ничего не делает.
 */
async function notifyResult(result) {
  const seconds = Math.round(
    (new Date(result.finishedAt) - new Date(result.startedAt)) / 1000
  );

  const hasProblems = result.projectsFailed > 0;
  const header = hasProblems
    ? '⚠️ <b>Отчёт по задачам: завершён с ошибками</b>'
    : '📋 <b>Отчёт по задачам обновлён</b>';

  let text =
    `${header}\n` +
    `⏱ Длительность: ${seconds}s\n` +
    `🏢 Отдел: ${(result.departments || []).join(', ')}\n\n` +
    `📁 Проектов обработано: ${result.projectsDone} из ${result.projectsTotal}\n` +
    `🔸 Задач в отчёте: ${result.tasksUpserted}\n`;

  if (result.projectsSkipped > 0) {
    text += `⏭ Без задач отдела: ${result.projectsSkipped}\n`;
  }
  if (result.removedStale > 0) {
    text += `🧹 Удалено устаревших: ${result.removedStale}\n`;
  }
  if (result.closedLookupsSkipped > 0) {
    text += `🔎 Не добрали дату закрытия: ${result.closedLookupsSkipped} (лимит запросов)\n`;
  }

  if (hasProblems) {
    text +=
      `\n❌ <b>Упало проектов: ${result.projectsFailed}</b>\n` +
      `🧹 Чистка устаревших пропущена — иначе их задачи удалились бы\n` +
      `Подробности в логах: /api/logs`;
  }

  await telegram.sendMessage(text);
}

/**
 * Один прогон отчёта. Причина запуска идёт в лог, чтобы по логам было понятно,
 * что именно его вызвало.
 */
async function runSync(reason) {
  logger.info(`⏰ ${nowLabel()} — синхронизация отчёта по задачам (${reason})`);

  try {
    const result = await syncTaskReport();
    await notifyResult(result);
  } catch (error) {
    // syncTaskReport уже залогировал причину; здесь только не даём упасть процессу
    logger.error(`❌ Синхронизация отчёта не удалась: ${error.message}`);

    try {
      await telegram.sendMessage(
        `❌ <b>Отчёт по задачам НЕ обновился</b>\n` +
        `Причина: ${error.message}\n\n` +
        `Данные на странице остались от прошлого успешного прогона.`
      );
    } catch (notifyError) {
      logger.warning(`⚠️ Не удалось отправить уведомление в Telegram: ${notifyError.message}`);
    }
  }
}

/** Запуск следом за основной синхронизацией */
async function runAfterMainSync({ succeeded }) {
  // Отчёт читает данные напрямую из Worksection и от результата основной
  // синхронизации не зависит — запускаем в любом случае, но помечаем в логе.
  await runSync(succeeded ? 'после основной синхронизации' : 'после основной синхронизации, она завершилась с ошибкой');
}

function initScheduler() {
  if (!subscribed) {
    mainScheduler.onSyncFinished(runAfterMainSync);
    subscribed = true;
    logger.success('✅ Отчёт по задачам: запуск следом за основной синхронизацией');
  }

  if (CRON_PATTERN && !cronTask) {
    if (!cron.validate(CRON_PATTERN)) {
      logger.error(`❌ TASK_REPORT_CRON невалиден и проигнорирован: ${CRON_PATTERN}`);
      return;
    }
    cronTask = cron.schedule(CRON_PATTERN, () => runSync('по расписанию'), { timezone: TIMEZONE });
    logger.success(`✅ Отчёт по задачам: дополнительно по расписанию ${CRON_PATTERN} (${TIMEZONE})`);
  }
}

function getScheduleInfo() {
  return {
    trigger: 'после основной синхронизации',
    subscribed,
    cron: CRON_PATTERN,
    cronEnabled: !!cronTask,
    timezone: TIMEZONE,
    description: 'Синхронизация отчёта по задачам Worksection'
  };
}

module.exports = { initScheduler, getScheduleInfo, runSync };
