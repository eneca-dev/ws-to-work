const logger = require('../utils/logger');
const worksectionService = require('../services/worksection');
const supabaseService = require('../services/supabase');

// Проект "Отпуск" в eneca.work (используем объект "Больничный" внутри него)
const VACATION_PROJECT_ID = '80bea5b8-1ecc-4ace-8d73-91f26e67b898';

// HR-проект в Worksection с задачами по сикдеям: одна родительская задача
// [Sick day], каждый случай — подзадача внутри неё.
const SICK_DAY_PROJECT_ID = '130340';
const SICK_DAY_PARENT_TASK_ID = '4905680';
const SICK_DAY_PARENT_PATH = `/${SICK_DAY_PROJECT_ID}/${SICK_DAY_PARENT_TASK_ID}/`;

// Окно событий. HR подтвердила: сикдей создаётся не раньше чем за 7 дней до
// даты и не позже самой даты — 8d с запасом на таймзоны/время прогона cron
// гарантированно ловит любой пост хотя бы одним прогоном шедулера (каждые 3ч).
const SICK_DAY_EVENTS_PERIOD = '8d';

function emptyStats() {
  return {
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    skipped_no_profile: 0,
    skipped_not_production: 0,
    skipped_incomplete: 0,
    skipped_already_covered: 0,
    errors: 0
  };
}

/**
 * Синхронизирует сикдеи из HR-проекта Worksection в загрузки на разделах
 * "<Отдел> - Больничный". В отличие от отпусков/больничных по графику
 * (vacation-sync.js), источник тут не расписание, а подзадачи в конкретном
 * HR-проекте — синк идёт через события (get_events), а не через диапазон дат.
 *
 * Идемпотентность: external_id = "sick_day:<ws_task_id>" — стабилен и не
 * зависит от дат, поэтому при сдвиге дат (событие update) строка не
 * пересоздаётся, а обновляется на месте (upsertOrUpdateLoadingByKey).
 * При action=delete — строка с этим ключом удаляется.
 *
 * Никогда не бросает исключение наружу — как и syncVacations, чтобы сбой
 * этого шага не обрушивал fullSync целиком.
 */
async function syncSickDays(stats) {
  stats.sick_day = emptyStats();

  try {
    logger.info('🩹 Syncing sick days from Worksection HR project');

    const sickLeaveSections = await supabaseService.getDepartmentSectionsBySuffix(VACATION_PROJECT_ID, 'Больничный');
    if (sickLeaveSections.size === 0) {
      logger.warning('⚠️ No "Больничный" sections found for production departments — skipping sick day sync');
      return stats.sick_day;
    }

    const departmentNameById = new Map();
    for (const [name, info] of sickLeaveSections) departmentNameById.set(info.departmentId, name);

    const profiles = await supabaseService.getUsers();
    const profileByEmail = new Map(
      profiles.filter((p) => p.email).map((p) => [p.email.toLowerCase().trim(), p])
    );

    const events = await worksectionService.getEvents(SICK_DAY_PROJECT_ID, SICK_DAY_EVENTS_PERIOD);
    const relevant = events.filter(
      (e) =>
        e.object?.type === 'task' &&
        e.object?.page?.includes(SICK_DAY_PARENT_PATH) &&
        ['post', 'update', 'delete'].includes(e.action)
    );

    // Последнее по времени событие на каждый task_id
    const lastEventByTaskId = new Map();
    const sorted = [...relevant].sort((a, b) => a.date_added.localeCompare(b.date_added));
    for (const e of sorted) lastEventByTaskId.set(e.object.id, e);

    logger.info(`🩹 Sick day events: ${events.length} total, ${lastEventByTaskId.size} task(s) touched in this window`);

    for (const [taskId, lastEvent] of lastEventByTaskId) {
      const externalId = `sick_day:${taskId}`;

      if (lastEvent.action === 'delete') {
        try {
          const existing = await supabaseService.getLoadingByExternalId(externalId);
          if (existing) {
            await supabaseService.deleteLoadings([existing.loading_id]);
            stats.sick_day.deleted++;
            logger.info(`🗑️ Removed sick day (deleted in WS): task ${taskId}`);
          }
        } catch (error) {
          stats.sick_day.errors++;
          logger.error(`❌ Sick day delete-sync failed for task ${taskId}: ${error.message}`);
        }
        continue;
      }

      try {
        const task = await worksectionService.getTask(taskId);
        const email = task?.user_to?.email ? task.user_to.email.toLowerCase().trim() : null;
        if (!email || !task.date_start || !task.date_end) {
          stats.sick_day.skipped_incomplete++;
          logger.warning(`⚠️ Sick day task ${taskId} incomplete (no user/dates), skipping`);
          continue;
        }

        const profile = profileByEmail.get(email);
        if (!profile) {
          stats.sick_day.skipped_no_profile++;
          logger.warning(`⚠️ Sick day: no eneca.work profile for ${email}, skipping`);
          continue;
        }

        const departmentName = departmentNameById.get(profile.department_id);
        if (!departmentName) {
          stats.sick_day.skipped_not_production++;
          continue;
        }

        const { sectionId } = sickLeaveSections.get(departmentName);

        // Если это ещё не отслеживаемая нами задача (нет строки с таким
        // external_id) — проверяем, не занят ли уже этот период чем-то другим
        // (ручной больничный, sick-leave по графику и т.п.), прежде чем
        // создавать новую строку. Если задачу уже отслеживаем — апдейт её
        // собственной записи ниже безопасен независимо от пересечений.
        const existingByKey = await supabaseService.getLoadingByExternalId(externalId);
        if (!existingByKey) {
          const overlapping = await supabaseService.getOverlappingLoadings(
            sectionId, profile.user_id, task.date_start, task.date_end
          );
          if (overlapping.length > 0) {
            stats.sick_day.skipped_already_covered++;
            logger.info(`⏭️ Sick day already covered by an existing entry, skipping: ${email} ${task.date_start}..${task.date_end}`);
            continue;
          }
        }

        const { wasCreated, wasUpdated } = await supabaseService.upsertOrUpdateLoadingByKey(sectionId, externalId, {
          loading_start: task.date_start,
          loading_finish: task.date_end,
          loading_responsible: profile.user_id,
          loading_status: 'active',
          loading_rate: 1,
          is_shortage: false
        });

        if (wasCreated) {
          stats.sick_day.created++;
          logger.success(`✅ Created sick day: ${email} (${departmentName}) ${task.date_start}..${task.date_end}`);
        } else if (wasUpdated) {
          stats.sick_day.updated++;
          logger.success(`🔄 Updated sick day: ${email} (${departmentName}) ${task.date_start}..${task.date_end}`);
        } else {
          stats.sick_day.unchanged++;
        }
      } catch (error) {
        stats.sick_day.errors++;
        logger.error(`❌ Sick day sync failed for task ${taskId}: ${error.message}`);
      }
    }

    logger.success(
      `✅ Sick days synced: ${stats.sick_day.created} created, ${stats.sick_day.updated} updated, ` +
      `${stats.sick_day.unchanged} unchanged, ${stats.sick_day.deleted} deleted, ${stats.sick_day.errors} errors`
    );
  } catch (error) {
    stats.sick_day.errors++;
    logger.error(`❌ Sick day sync step failed entirely: ${error.message}`);
  }

  return stats.sick_day;
}

module.exports = { syncSickDays };
