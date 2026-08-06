/**
 * Синхронизация отчёта по задачам Worksection → таблица ws_task_report.
 *
 * Полностью автономна от основной синхронизации (sync/*.js): свои файлы,
 * свой эндпоинт, своё расписание, свой флаг блокировки. Из общего кода
 * переиспользуются только клиент Worksection, логгер и конфиг — на чтение.
 *
 * Грейн = задача 3-го уровня Worksection.
 *
 *   standard: project → task(объект) → subtask(раздел) → nested(ЗАДАЧА)
 *   os:       project → task(раздел)  → subtask(этап)   → nested(ЗАДАЧА)
 *
 * ⚠️ Отличие от sync/stage-sync.js: здесь НЕ фильтруем по status === 'active'.
 * Отчёту нужны и закрытые задачи — статус открыта/закрыта это отдельная колонка.
 */

const worksection = require('../services/worksection');
const logger = require('../utils/logger');
const { config } = require('../config/env');
const { buildUserMap, REPORT_DEPARTMENTS } = require('./departments');
const store = require('./supabase');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Сколько точечных get_task делаем за прогон, чтобы добрать дату закрытия */
const CLOSED_LOOKUP_LIMIT = parseInt(process.env.TASK_REPORT_CLOSED_LOOKUP_LIMIT) || 300;

/**
 * Отделы отчёта берутся ТОЛЬКО из константы в departments.js.
 * Ни env, ни параметр запроса на это не влияют — см. REPORT_DEPARTMENTS.
 */
const DEPARTMENT_FILTER = new Set(REPORT_DEPARTMENTS);

/** Состояние последнего/текущего прогона — отдаётся в /api/task-report/status */
const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  departments: null,
  projectsTotal: 0,
  projectsDone: 0,
  projectsSkipped: 0,
  projectsFailed: 0,
  tasksUpserted: 0,
  tasksSkippedByDepartment: 0,
  closedLookups: 0,
  closedLookupsSkipped: 0,
  removedStale: 0,
  error: null
};

// ============================================================================
// Хелперы
// ============================================================================

/** "6:50" → 6.83 */
function parseTimeToHours(timeString) {
  if (!timeString) return 0;
  const parts = String(timeString).split(':');
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;
  return hours + minutes / 60;
}

/**
 * Дата Worksection → ISO с минской зоной.
 * WS отдаёт "2021-01-01 11:00" или "2021-01-01" по местному времени.
 * Беларусь круглый год UTC+3, перехода на летнее время нет.
 */
function toIso(wsDate) {
  if (!wsDate) return null;
  const raw = String(wsDate).trim();
  if (!raw) return null;
  const withTime = raw.includes(' ') ? raw.replace(' ', 'T') : `${raw}T00:00:00`;
  return `${withTime}+03:00`;
}

/** Задачи и проекты, начинающиеся с "!", в синк не идут (как в основном) */
function isSkippedByName(name) {
  return typeof name === 'string' && name.startsWith('!');
}

/** У задачи должен быть настоящий ответственный: без него отдел не определить */
function hasRealExecutor(userTo) {
  if (!userTo || !userTo.email) return false;
  const email = String(userTo.email).toUpperCase();
  return email !== 'ANY' && email !== 'NOONE';
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// ============================================================================
// Обход дерева проекта
// ============================================================================

/**
 * Собрать задачи 3-го уровня одного проекта.
 * @param {Object} wsProject - проект из get_projects
 * @param {Array} wsTasks - дерево из get_tasks (extra=subtasks)
 * @param {string} syncType - 'standard' | 'os'
 * @returns {Array<Object>} заготовки строк отчёта (без часов и сумм)
 */
function collectTasks(wsProject, wsTasks, syncType) {
  const isOs = syncType === 'os';
  const rows = [];

  for (const level1 of wsTasks || []) {
    if (isSkippedByName(level1.name)) continue;

    for (const level2 of level1.child || []) {
      if (isSkippedByName(level2.name)) continue;

      for (const level3 of level2.child || []) {
        if (isSkippedByName(level3.name)) continue;
        if (!hasRealExecutor(level3.user_to)) continue;

        rows.push({
          ws_task_id: String(level3.id),
          ws_task_name: level3.name || '',

          // В OS-проектах объекта нет — там объект-заглушка с именем проекта,
          // а 1-й уровень это раздел (как в sync/content-sync.js).
          ws_object_id: isOs ? null : String(level1.id),
          ws_object_name: isOs ? (wsProject.name || null) : (level1.name || null),
          ws_section_id: isOs ? String(level1.id) : String(level2.id),
          ws_section_name: isOs ? (level1.name || null) : (level2.name || null),

          ws_project_id: String(wsProject.id),
          ws_project_name: wsProject.name || null,

          responsible_email: level3.user_to.email,
          responsible_name: level3.user_to.name || null,
          department: null, // проставим по карте пользователей

          ws_status: level3.status || 'active',
          date_added: toIso(level3.date_added),
          date_closed: null, // придёт из costs или точечного get_task

          total_hours: 0,
          total_money: 0,
          planned_budget: toNumberOrNull(level3.max_money)
        });
      }
    }
  }

  return rows;
}

/**
 * Свернуть отчёты проекта в суммы по задачам.
 * @param {Array} wsCosts - результат get_costs(id_project)
 * @returns {Map<string, {hours: number, money: number, dateClosed: string|null}>}
 */
function aggregateCosts(wsCosts) {
  const byTask = new Map();

  for (const cost of wsCosts || []) {
    const taskId = cost && cost.task && cost.task.id != null ? String(cost.task.id) : null;
    if (!taskId) continue;

    let agg = byTask.get(taskId);
    if (!agg) {
      agg = { hours: 0, money: 0, dateClosed: null };
      byTask.set(taskId, agg);
    }

    agg.hours += parseTimeToHours(cost.time);
    agg.money += parseFloat(cost.money) || 0;

    // date_closed приходит внутри вложенной задачи, берём первое непустое
    if (!agg.dateClosed && cost.task.date_closed) {
      agg.dateClosed = toIso(cost.task.date_closed);
    }
  }

  return byTask;
}

// ============================================================================
// Основной прогон
// ============================================================================

/**
 * Синхронизировать отчёт.
 * @param {Object} options
 * @param {string|null} options.projectId - синкать один проект (тогда без чистки устаревших)
 * @returns {Promise<Object>} итоговая статистика
 */
async function syncTaskReport({ projectId = null } = {}) {
  if (state.running) {
    throw new Error('Синхронизация отчёта уже выполняется');
  }

  const startedAt = new Date().toISOString();
  const isFullRun = !projectId;
  const departmentFilter = DEPARTMENT_FILTER;

  state.running = true;
  state.startedAt = startedAt;
  state.finishedAt = null;
  state.departments = [...departmentFilter];
  state.projectsTotal = 0;
  state.projectsDone = 0;
  state.projectsSkipped = 0;
  state.projectsFailed = 0;
  state.tasksUpserted = 0;
  state.tasksSkippedByDepartment = 0;
  state.closedLookups = 0;
  state.closedLookupsSkipped = 0;
  state.removedStale = 0;
  state.error = null;

  try {
    logger.info(
      `📋 Task report sync: старт${projectId ? ` (проект ${projectId})` : ' (все проекты)'}` +
      `, отдел: ${[...departmentFilter].join(', ')}`
    );

    // ── 1. Пользователи → карта email → отдел ────────────────────────────────
    const wsUsers = await worksection.getUsers();
    const userMap = buildUserMap(wsUsers);
    const mapped = [...userMap.values()].filter(u => u.department).length;
    logger.info(`👥 Пользователей: ${userMap.size}, с определённым отделом: ${mapped}`);

    // ── 2. Проекты под синхронизацию ─────────────────────────────────────────
    let wsProjects = await worksection.getProjectsWithSyncTags();
    wsProjects = wsProjects.filter(p => !isSkippedByName(p.name));

    if (projectId) {
      wsProjects = wsProjects.filter(p => String(p.id) === String(projectId));
      if (wsProjects.length === 0) {
        throw new Error(`Проект ${projectId} не найден среди синхронизируемых`);
      }
    }

    state.projectsTotal = wsProjects.length;
    logger.info(`📁 Проектов к обработке: ${wsProjects.length}`);

    // Задачи со статусом done без даты закрытия — доберём точечно после обхода
    const needClosedLookup = [];

    // ── 3. Обход проектов ────────────────────────────────────────────────────
    for (const wsProject of wsProjects) {
      try {
        const syncType = worksection.determineProjectSyncType(wsProject) || 'standard';

        const wsTasks = await worksection.getProjectTasks(wsProject.id);
        let rows = collectTasks(wsProject, wsTasks, syncType);

        // Отдел проставляем ДО фильтра — он же и решает, нужен ли этот проект вообще
        for (const row of rows) {
          const user = userMap.get(String(row.responsible_email).toLowerCase());
          if (user) {
            row.department = user.department;
            if (!row.responsible_name) row.responsible_name = user.name;
          }
        }

        if (departmentFilter) {
          const before = rows.length;
          rows = rows.filter(row => row.department && departmentFilter.has(row.department));
          state.tasksSkippedByDepartment += before - rows.length;
        }

        if (rows.length === 0) {
          // Ни одной подходящей задачи → get_costs не запрашиваем.
          // На фильтре по одному отделу это экономит ~2/3 вызовов к API.
          logger.info(
            `📁 ${wsProject.name}: подходящих задач нет, отчёты не запрашиваем` +
            ` (${state.projectsDone + 1}/${state.projectsTotal})`
          );
          state.projectsSkipped++;
          state.projectsDone++;
          await sleep(config.sync.delayMs);
          continue;
        }

        const wsCosts = await worksection.getCosts(wsProject.id);

        // У Worksection API нет пагинации и стоит потолок ~10 000 записей.
        // Если проект в него упёрся, часть отчётов не пришла и суммы занижены.
        if ((wsCosts || []).length >= 10000) {
          logger.warning(
            `⚠️ ${wsProject.name}: получено ${wsCosts.length} отчётов — возможен обрез ` +
            'по лимиту API (~10 000). Часы и суммы по проекту могут быть занижены.'
          );
        }

        const costsByTask = aggregateCosts(wsCosts);

        for (const row of rows) {
          const agg = costsByTask.get(row.ws_task_id);
          if (agg) {
            row.total_hours = Math.round(agg.hours * 100) / 100;
            row.total_money = Math.round(agg.money * 100) / 100;
            row.date_closed = agg.dateClosed;
          }

          if (row.ws_status === 'done' && !row.date_closed) {
            needClosedLookup.push(row);
          }

          row.synced_at = new Date().toISOString();
        }

        const written = await store.upsertRows(rows);
        state.tasksUpserted += written;
        state.projectsDone++;

        logger.success(
          `📁 ${wsProject.name} [${syncType}]: задач ${written}, отчётов ${(wsCosts || []).length}` +
          ` (${state.projectsDone}/${state.projectsTotal})`
        );

      } catch (error) {
        // Проект не должен ронять весь прогон, но его строки остались
        // необновлёнными — значит чистку устаревших делать нельзя (см. ниже).
        logger.error(`❌ Проект ${wsProject.name}: ${error.message}`);
        state.projectsFailed++;
        state.projectsDone++;
      }

      await sleep(config.sync.delayMs);
    }

    // ── 4. Дата закрытия для задач без отчётов ───────────────────────────────
    // date_closed приходит только внутри get_costs. У закрытой задачи, на которую
    // никто не списывал время, её нет — добираем точечным get_task, но с лимитом,
    // иначе прогон растянется на часы.
    if (needClosedLookup.length > 0) {
      const toLookup = needClosedLookup.slice(0, CLOSED_LOOKUP_LIMIT);
      state.closedLookupsSkipped = needClosedLookup.length - toLookup.length;

      logger.info(
        `🔎 Закрытых задач без даты закрытия: ${needClosedLookup.length}, ` +
        `запрашиваем ${toLookup.length}` +
        (state.closedLookupsSkipped > 0 ? `, пропускаем ${state.closedLookupsSkipped} (лимит)` : '')
      );

      const patched = [];

      for (const row of toLookup) {
        try {
          const task = await worksection.getTask(row.ws_task_id);
          if (task && task.date_closed) {
            row.date_closed = toIso(task.date_closed);
            row.synced_at = new Date().toISOString();
            patched.push(row);
          }
          state.closedLookups++;
        } catch (error) {
          logger.warning(`⚠️ get_task ${row.ws_task_id}: ${error.message}`);
        }

        await sleep(config.sync.delayMs);
      }

      if (patched.length > 0) {
        await store.upsertRows(patched);
        logger.success(`🔎 Проставлена дата закрытия: ${patched.length}`);
      } else {
        logger.warning('🔎 get_task не вернул date_closed ни для одной задачи');
      }
    }

    // ── 5. Чистка устаревших строк ───────────────────────────────────────────
    // Удаляем всё, что не обновилось этим прогоном. Два обязательных условия:
    //
    //   1. Прогон полный — при синке одного проекта снесло бы все остальные.
    //   2. Ни один проект не упал — иначе временная ошибка Worksection на одном
    //      проекте молча вычистила бы все его задачи из отчёта.
    //
    // Лучше оставить строку постарше, чем потерять её из-за сетевого сбоя.
    if (!isFullRun) {
      logger.info('🧹 Чистка устаревших строк пропущена (синк одного проекта)');
    } else if (state.projectsFailed > 0) {
      logger.warning(
        `🧹 Чистка устаревших строк пропущена: упало проектов ${state.projectsFailed}. ` +
        'Их задачи остались бы без обновления и были бы удалены.'
      );
    } else {
      state.removedStale = await store.deleteStale(startedAt, state.departments);
    }

    state.finishedAt = new Date().toISOString();
    const seconds = Math.round((new Date(state.finishedAt) - new Date(startedAt)) / 1000);

    const summary =
      `✅ Task report sync завершён за ${seconds}с: ` +
      `проектов ${state.projectsDone}/${state.projectsTotal}` +
      (state.projectsSkipped > 0 ? ` (без подходящих задач: ${state.projectsSkipped})` : '') +
      `, задач ${state.tasksUpserted}` +
      (state.tasksSkippedByDepartment > 0 ? `, отсеяно чужих отделов: ${state.tasksSkippedByDepartment}` : '') +
      `, удалено ${state.removedStale}`;

    if (state.projectsFailed > 0) {
      logger.warning(`${summary}, УПАЛО ПРОЕКТОВ: ${state.projectsFailed}`);
    } else {
      logger.success(summary);
    }

    return { ...state };

  } catch (error) {
    state.error = error.message;
    state.finishedAt = new Date().toISOString();
    logger.error(`❌ Task report sync упал: ${error.message}`);
    throw error;

  } finally {
    state.running = false;
    // ⚠️ НЕ вызываем worksection.clearTasksCache(): кэш задач общий с основной
    // синхронизацией. Сбросив его, мы заставили бы её перезапрашивать все проекты
    // заново — лишние вызовы и риск упереться в rate limit. Своего TTL (15 минут)
    // кэшу достаточно: между нашими прогонами проходит два часа.
  }
}

/** Состояние прогона + состояние таблицы */
async function getStatus() {
  let table = null;
  try {
    table = await store.getState();
  } catch (error) {
    table = { error: error.message };
  }
  return { run: { ...state }, table };
}

module.exports = { syncTaskReport, getStatus };
