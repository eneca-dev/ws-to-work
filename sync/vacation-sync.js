const logger = require('../utils/logger');
const worksectionService = require('../services/worksection');
const supabaseService = require('../services/supabase');

// Проект "Отпуск" в eneca.work (объекты "Отпуск" и "Больничный" внутри него)
const VACATION_PROJECT_ID = '80bea5b8-1ecc-4ace-8d73-91f26e67b898';

// Окно расписания: синхронизируем только с сегодняшнего дня и далее —
// прошлое не трогаем и не досоздаём задним числом.
//
// Из-за этого у уже ИДУЩЕГО отпуска WS будет каждый раз показывать датой
// начала "сегодня" (мы не спрашиваем про более ранние дни) — то есть при
// пересчёте на следующий день получится другой диапазон/ключ, чем вчера.
// Это не проблема: перед созданием новой загрузки synAbsenceType проверяет
// getOverlappingLoadings — если период уже чем-то занят (хоть вчерашней
// версией этого же отпуска, хоть ручной записью), новая просто не создаётся,
// старая не трогается. Так что "плывущий" при пересчёте диапазон не образует
// дублей — с первого раза, как отпуск попал в БД, дата начала в ней
// фиксируется навсегда, даже если она с опозданием (не с истинного начала
// отпуска, а с того дня, когда синк его впервые увидел).
const SCHEDULE_DAYS_BACK = 0;
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

function emptyAbsenceStats() {
  return {
    created: 0,
    unchanged: 0,
    skipped_no_profile: 0,
    skipped_not_production: 0,
    errors: 0
  };
}

/**
 * Синхронизирует один тип отсутствия (WS-тип 'vacation' или 'sick-leave') из
 * уже загруженного расписания в загрузки на разделах "<Отдел> - <тип>".
 *
 * Сверка ПОСУТОЧНАЯ, не по целому диапазону: для каждого сотрудника берём
 * все дни, которые WS считает отсутствием, вычитаем дни, уже покрытые ЛЮБОЙ
 * существующей загрузкой (ручной или из WS, неважно с каким ключом) —
 * загрузка создаётся только на оставшиеся ("недостающие") дни, склеенные в
 * диапазоны. Так продления в WS подхватываются сами (недостающий хвост
 * станет отдельной новой загрузкой), а уже внесённое НИКОГДА не
 * перезаписывается и не дублируется — существующие записи не трогаются
 * вообще, только читаются для вычисления покрытия.
 *
 * Если отпуск/больничный в WS отменили, сдвинули или сократили — старая
 * загрузка в eneca.work так и останется как есть, синк её не тронет. Так
 * решили сознательно: у get_users_schedule нет понятия "явное удаление"
 * (это снимок дней на момент запроса, а не журнал событий), поэтому
 * надёжно отличить "запись реально отменили" от "мы просто иначе её
 * увидели" невозможно — расхождения разбираются руками по запросу.
 */
async function syncAbsenceType({
  absenceStats, wsType, externalPrefix, logEmoji, logName,
  schedule, profileByEmail, sectionsByDepartment, departmentNameById
}) {
  const datesByEmail = new Map();
  for (const userData of Object.values(schedule)) {
    const email = userData.email ? userData.email.toLowerCase().trim() : null;
    if (!email || !userData.schedule) continue;

    const dates = Object.entries(userData.schedule)
      .filter(([, type]) => type === wsType)
      .map(([date]) => date)
      .sort();
    if (dates.length > 0) datesByEmail.set(email, dates);
  }
  logger.info(`${logEmoji} WS schedule: ${datesByEmail.size} employees have "${logName}" days in this window`);

  for (const [email, dates] of datesByEmail) {
    const profile = profileByEmail.get(email);
    if (!profile) {
      absenceStats.skipped_no_profile++;
      logger.warning(`⚠️ ${logName}: no eneca.work profile for ${email}, skipping`);
      continue;
    }

    const departmentName = departmentNameById.get(profile.department_id);
    if (!departmentName) {
      absenceStats.skipped_not_production++;
      continue;
    }

    const sectionInfo = sectionsByDepartment.get(departmentName);
    if (!sectionInfo) continue;
    const { sectionId } = sectionInfo;

    // Дни, которые WS считает отсутствием, но которые ещё НИЧЕМ не покрыты
    // (ни ручной записью, ни другой WS-записью) — только на них создаём
    // новые загрузки. Уже покрытые дни не трогаем, даже если диапазон в
    // существующей записи не совпадает 1-в-1 с тем, что сейчас говорит WS —
    // так продления в WS подхватываются (недостающий хвост станет отдельной
    // новой загрузкой), а уже внесённое никогда не переписывается и не дублируется.
    const windowStart = dates[0];
    const windowEnd = dates[dates.length - 1];

    let existing;
    try {
      existing = await supabaseService.getOverlappingLoadings(sectionId, profile.user_id, windowStart, windowEnd);
    } catch (error) {
      absenceStats.errors++;
      logger.error(`❌ ${logName} coverage lookup failed for ${email}: ${error.message}`);
      continue;
    }

    const coveredDays = new Set();
    for (const row of existing) {
      const from = row.loading_start > windowStart ? row.loading_start : windowStart;
      const to = row.loading_finish < windowEnd ? row.loading_finish : windowEnd;
      for (let d = from; d <= to; d = toIsoDate(addDays(new Date(d), 1))) {
        coveredDays.add(d);
      }
    }

    const gapDates = dates.filter((d) => !coveredDays.has(d));
    if (gapDates.length === 0) {
      absenceStats.unchanged++;
      continue;
    }

    const gapRanges = collapseDatesToRanges(gapDates);
    for (const range of gapRanges) {
      const externalId = `${externalPrefix}:${email}:${range.start}:${range.finish}`;
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
          absenceStats.created++;
          logger.success(`${logEmoji} Created ${logName} loading (gap-filled): ${email} (${departmentName}) ${range.start}..${range.finish}`);
        } else {
          absenceStats.unchanged++;
        }
      } catch (error) {
        absenceStats.errors++;
        logger.error(`❌ ${logName} upsert failed for ${email} ${range.start}..${range.finish}: ${error.message}`);
      }
    }
  }

  logger.info(
    `${logEmoji} ${logName}: skipped ${absenceStats.skipped_no_profile} no profile, ` +
    `${absenceStats.skipped_not_production} not production department`
  );
}

/**
 * Синхронизирует отпуска (WS: 'vacation' → раздел "<Отдел> - Отпуск") и
 * больничные по общему графику (WS: 'sick-leave' → "<Отдел> - Больничный")
 * из одного и того же расписания Worksection — за один запрос к API.
 *
 * Никогда не бросает исключение наружу: любая непредвиденная ошибка (сбой WS
 * API, недоступность Supabase и т.п.) ловится, пишется в stats.*.errors и в
 * лог, чтобы поломка этого шага не обрушивала весь fullSync.
 */
async function syncVacations(stats) {
  stats.vacations = emptyAbsenceStats();
  stats.sick_leave = emptyAbsenceStats();

  try {
    logger.info('🏖️ Syncing vacations and sick leave from Worksection schedule');

    const [vacationSections, sickLeaveSections] = await Promise.all([
      supabaseService.getDepartmentSectionsBySuffix(VACATION_PROJECT_ID, 'Отпуск'),
      supabaseService.getDepartmentSectionsBySuffix(VACATION_PROJECT_ID, 'Больничный')
    ]);

    if (vacationSections.size === 0 && sickLeaveSections.size === 0) {
      logger.warning('⚠️ No vacation/sick-leave sections found for production departments — skipping');
      return stats.vacations;
    }
    logger.info(`🏖️ Resolved ${vacationSections.size} "Отпуск" and ${sickLeaveSections.size} "Больничный" department sections`);

    const departmentNameById = new Map();
    for (const [name, info] of vacationSections) departmentNameById.set(info.departmentId, name);
    for (const [name, info] of sickLeaveSections) departmentNameById.set(info.departmentId, name);

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

    if (vacationSections.size > 0) {
      await syncAbsenceType({
        absenceStats: stats.vacations,
        wsType: 'vacation',
        externalPrefix: 'vacation',
        logEmoji: '🏖️',
        logName: 'vacation',
        schedule,
        profileByEmail,
        sectionsByDepartment: vacationSections,
        departmentNameById
      });
    }

    if (sickLeaveSections.size > 0) {
      await syncAbsenceType({
        absenceStats: stats.sick_leave,
        wsType: 'sick-leave',
        externalPrefix: 'sick_leave',
        logEmoji: '🤒',
        logName: 'sick leave',
        schedule,
        profileByEmail,
        sectionsByDepartment: sickLeaveSections,
        departmentNameById
      });
    }

    logger.success(
      `✅ Vacations synced: ${stats.vacations.created} created, ${stats.vacations.unchanged} unchanged, ` +
      `${stats.vacations.errors} errors`
    );
    logger.success(
      `✅ Sick leave synced: ${stats.sick_leave.created} created, ${stats.sick_leave.unchanged} unchanged, ` +
      `${stats.sick_leave.errors} errors`
    );
  } catch (error) {
    stats.vacations.errors++;
    logger.error(`❌ Vacation/sick-leave sync step failed entirely: ${error.message}`);
  }

  return stats.vacations;
}

module.exports = { syncVacations, collapseDatesToRanges };
