const logger = require('../utils/logger');
const worksectionService = require('../services/worksection');
const supabaseService = require('../services/supabase');

// Проект "Отпуск" в eneca.work
const VACATION_PROJECT_ID = '80bea5b8-1ecc-4ace-8d73-91f26e67b898';

// Окно расписания: WS отдаёт план по дням, берём с запасом назад (уже начавшиеся
// отпуска) и вперёд (запланированные заранее).
const SCHEDULE_DAYS_BACK = 30;
const SCHEDULE_DAYS_FORWARD = 365;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Схлопывает отсортированный список ISO-дат ('YYYY-MM-DD') в непрерывные диапазоны
function collapseDatesToRanges(sortedDates) {
  const ranges = [];
  let start = null;
  let prev = null;

  for (const date of sortedDates) {
    if (start === null) {
      start = date;
    } else {
      const expected = toIsoDate(addDays(new Date(prev), 1));
      if (date !== expected) {
        ranges.push({ start, finish: prev });
        start = date;
      }
    }
    prev = date;
  }
  if (start !== null) ranges.push({ start, finish: prev });
  return ranges;
}

function emptyStats() {
  return {
    created: 0,
    unchanged: 0,
    deleted_stale: 0,
    skipped_no_profile: 0,
    skipped_not_production: 0,
    errors: 0
  };
}

/**
 * Синхронизирует отпуска из расписания Worksection в загрузки на разделах
 * "<Отдел> - Отпуск" проекта "Отпуск". Синхронизируются только сотрудники
 * отделов подразделения "Производственные отделы" — остальные пропускаются.
 *
 * Идемпотентность: каждая загрузка получает external_id вида
 * "vacation:<email>:<start>:<finish>" и апсертится по (loading_section,
 * external_source, external_id). Если диапазон отпуска в WS сдвинулся —
 * старая загрузка с прежним external_id для этого сотрудника удаляется, но
 * только среди external_source='worksection' и только в пределах окна
 * синхронизации (см. комментарий в getWorksectionLoadingsForResponsible) —
 * ручные загрузки и уже прошедшие вне окна отпуска никогда не трогаются.
 *
 * Никогда не бросает исключение наружу: любая непредвиденная ошибка (сбой WS
 * API, недоступность Supabase и т.п.) ловится, пишется в stats.vacations.errors
 * и в лог, чтобы поломка этого шага не обрушивала весь fullSync и не мешала
 * остальным шагам синхронизации/отчёту в Telegram.
 */
async function syncVacations(stats) {
  stats.vacations = emptyStats();

  try {
    logger.info('🏖️ Syncing vacations from Worksection schedule');

    const departmentSections = await supabaseService.getVacationSectionsByDepartment(VACATION_PROJECT_ID);
    if (departmentSections.size === 0) {
      logger.warning('⚠️ No vacation sections found for production departments — skipping vacation sync');
      return stats.vacations;
    }
    logger.info(`🏖️ Resolved ${departmentSections.size} production department vacation sections: ${Array.from(departmentSections.keys()).join(', ')}`);

    const departmentNameById = new Map();
    for (const [name, info] of departmentSections) {
      departmentNameById.set(info.departmentId, name);
    }

    const profiles = await supabaseService.getUsers();
    const profileByEmail = new Map(
      profiles.filter((p) => p.email).map((p) => [p.email.toLowerCase().trim(), p])
    );
    logger.info(`🏖️ Loaded ${profiles.length} profiles for email resolution`);

    const dateStart = addDays(new Date(), -SCHEDULE_DAYS_BACK);
    const dateEnd = addDays(new Date(), SCHEDULE_DAYS_FORWARD);
    const dateStartIso = toIsoDate(dateStart);
    const dateEndIso = toIsoDate(dateEnd);
    logger.info(`🏖️ Fetching WS schedule for window ${dateStartIso}..${dateEndIso}`);

    const schedule = await worksectionService.getUsersSchedule(dateStart, dateEnd);

    // email → отсортированный список дат типа 'vacation'
    const vacationDatesByEmail = new Map();
    for (const userData of Object.values(schedule)) {
      const email = userData.email ? userData.email.toLowerCase().trim() : null;
      if (!email || !userData.schedule) continue;

      const dates = Object.entries(userData.schedule)
        .filter(([, type]) => type === 'vacation')
        .map(([date]) => date)
        .sort();
      if (dates.length > 0) vacationDatesByEmail.set(email, dates);
    }
    logger.info(`🏖️ WS schedule: ${vacationDatesByEmail.size} employees have vacation days in this window`);

    // section_id → (responsible_id → Set актуальных на этот прогон external_id)
    const touchedByResponsibleInSection = new Map();

    for (const [email, dates] of vacationDatesByEmail) {
      const profile = profileByEmail.get(email);
      if (!profile) {
        stats.vacations.skipped_no_profile++;
        logger.warning(`⚠️ Vacation: no eneca.work profile for ${email}, skipping`);
        continue;
      }

      const departmentName = departmentNameById.get(profile.department_id);
      if (!departmentName) {
        stats.vacations.skipped_not_production++;
        continue;
      }

      const { sectionId } = departmentSections.get(departmentName);
      const ranges = collapseDatesToRanges(dates);

      if (!touchedByResponsibleInSection.has(sectionId)) {
        touchedByResponsibleInSection.set(sectionId, new Map());
      }
      const touchedByResponsible = touchedByResponsibleInSection.get(sectionId);
      const currentExternalIds = new Set();
      touchedByResponsible.set(profile.user_id, currentExternalIds);

      for (const range of ranges) {
        const externalId = `vacation:${email}:${range.start}:${range.finish}`;
        currentExternalIds.add(externalId);

        try {
          const { wasCreated } = await supabaseService.upsertLoadingByKey(sectionId, externalId, {
            loading_start: range.start,
            loading_finish: range.finish,
            loading_responsible: profile.user_id,
            loading_status: 'active',
            loading_rate: 1,
            is_shortage: false
          });
          if (wasCreated) {
            stats.vacations.created++;
            logger.success(`✅ Created vacation loading: ${email} (${departmentName}) ${range.start}..${range.finish}`);
          } else {
            stats.vacations.unchanged++;
          }
        } catch (error) {
          stats.vacations.errors++;
          logger.error(`❌ Vacation upsert failed for ${email} ${range.start}..${range.finish}: ${error.message}`);
        }
      }
    }

    logger.info(`🏖️ Skipped: ${stats.vacations.skipped_no_profile} no profile, ${stats.vacations.skipped_not_production} not production department`);

    // Удаляем протухшие загрузки: были синхронизированы Worksection ранее, но в
    // этом прогоне у сотрудника такого диапазона уже нет (сдвинули/сократили/удалили в WS).
    // Сравнение ограничено окном синхронизации — прошедшие вне окна отпуска не трогаем.
    for (const [sectionId, touchedByResponsible] of touchedByResponsibleInSection) {
      for (const [responsibleId, currentExternalIds] of touchedByResponsible) {
        try {
          const existing = await supabaseService.getWorksectionLoadingsForResponsible(
            sectionId, responsibleId, dateStartIso, dateEndIso
          );
          const stale = existing.filter((row) => !currentExternalIds.has(row.external_id));
          if (stale.length > 0) {
            await supabaseService.deleteLoadings(stale.map((row) => row.loading_id));
            stats.vacations.deleted_stale += stale.length;
            stale.forEach((row) => {
              logger.info(`🗑️ Removed stale vacation loading: ${row.loading_start}..${row.loading_finish} (no longer in WS schedule)`);
            });
          }
        } catch (error) {
          stats.vacations.errors++;
          logger.error(`❌ Stale vacation cleanup failed: ${error.message}`);
        }
      }
    }

    logger.success(
      `✅ Vacations synced: ${stats.vacations.created} created, ${stats.vacations.unchanged} unchanged, ` +
      `${stats.vacations.deleted_stale} stale deleted, ${stats.vacations.skipped_no_profile} no profile, ` +
      `${stats.vacations.skipped_not_production} not production, ${stats.vacations.errors} errors`
    );
  } catch (error) {
    stats.vacations.errors++;
    logger.error(`❌ Vacation sync step failed entirely: ${error.message}`);
  }

  return stats.vacations;
}

module.exports = { syncVacations, collapseDatesToRanges };
