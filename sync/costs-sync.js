const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// КЕШ для часто используемых ID (загружается один раз при первой синхронизации)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let cachedCategoryId = null;
let cachedStatusId = null;
let cachedDifficultyId = null;

async function getCachedIds() {
  if (!cachedCategoryId) {
    cachedCategoryId = await supabase.getWorkCategoryIdByName('Управление');
    cachedStatusId = await supabase.getStatusIdByName('План');
    cachedDifficultyId = await supabase.getDifficultyIdByName('К');

    logger.info(`📦 Cached IDs: category=${cachedCategoryId}, status=${cachedStatusId}, difficulty=${cachedDifficultyId || 'null'}`);
  }

  return {
    categoryId: cachedCategoryId,
    statusId: cachedStatusId,
    difficultyId: cachedDifficultyId
  };
}

/**
 * Синхронизация отчетов (costs) из Worksection → work_logs в Supabase
 *
 * Режимы синхронизации (costsMode):
 * - 'skip': Не синхронизировать отчеты вообще
 * - 'daily': Синхронизировать только за вчерашний день
 * - 'full': Синхронизировать все отчеты с дедупликацией
 *
 * Логика:
 * 1. Получаем costs из WS
 * 2. Фильтруем по дате (если режим 'daily')
 * 3. Обнаруживаем "лишние" work_logs (есть в Supabase, нет в WS)
 * 4. Обновляем бюджеты (если нужно увеличить)
 * 5. Создаем work_logs (с дедупликацией по external_id)
 */
async function syncCosts(stats, offset = 0, limit = 7, projectId = null, costsMode = 'skip', costsDate = null) {
  try {
    // Инициализация статистики
    if (!stats.work_logs) {
      stats.work_logs = { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 };
    }
    if (!stats.budgets) {
      stats.budgets = { updated: 0, errors: 0 };
    }
    if (!stats.orphan_work_logs) {
      stats.orphan_work_logs = { total: 0, details: [] };
    }
    if (!stats.decomposition_items) {
      stats.decomposition_items = { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 };
    }

    // Режим 'skip' - пропускаем синхронизацию отчетов
    if (costsMode === 'skip') {
      logger.info('⏭️ Costs sync skipped (mode: skip)');
      return;
    }

    // Определяем фильтр по дате
    let dateFilter = null;
    if (costsMode === 'daily') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dateFilter = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
      logger.info(`📅 Costs sync mode: daily (date: ${dateFilter})`);
    } else if (costsMode === 'date') {
      dateFilter = costsDate; // Используем переданную дату
      logger.info(`📅 Costs sync mode: date (date: ${dateFilter})`);
    } else if (costsMode === 'full') {
      logger.info('📊 Costs sync mode: full (all costs with deduplication)');
    }

    const wsProjects = await worksection.getProjectsWithSyncTags();

    // Фильтруем проекты
    let filteredProjects = wsProjects.filter(project => {
      if (project.name && project.name.startsWith('!')) {
        return false;
      }
      return true;
    });

    // Если указан конкретный projectId
    if (projectId) {
      filteredProjects = filteredProjects.filter(p => p.id.toString() === projectId.toString());
      if (filteredProjects.length === 0) {
        logger.warning(`⚠️ Project ${projectId} not found`);
        return;
      }
    }

    // Применяем пагинацию
    const paginatedProjects = projectId ? filteredProjects : filteredProjects.slice(offset, offset + limit);

    for (const wsProject of paginatedProjects) {
      try {
        logger.info(`💰 Syncing costs for project: ${wsProject.name} (ID: ${wsProject.id})`);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ЭТАП А: ПОЛУЧЕНИЕ COSTS ИЗ WORKSECTION
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        let wsCosts = await worksection.getCosts(wsProject.id);

        if (!wsCosts || wsCosts.length === 0) {
          logger.info(`📋 No costs found for project ${wsProject.name}`);
          continue;
        }

        logger.info(`📋 Found ${wsCosts.length} costs for project ${wsProject.name}`);

        // Фильтрация по дате если режим 'daily'
        if (dateFilter) {
          const originalCount = wsCosts.length;
          wsCosts = wsCosts.filter(cost => cost.date === dateFilter);
          const filtered = originalCount - wsCosts.length;

          if (filtered > 0) {
            logger.info(`📅 Filtered to ${wsCosts.length} costs for ${dateFilter} (excluded ${filtered} costs)`);
          }

          if (wsCosts.length === 0) {
            logger.info(`📋 No costs for date ${dateFilter} in project ${wsProject.name}`);
            continue;
          }
        }

        // Создаем Set из external_id для проверки "лишних"
        const wsCostIds = new Set(wsCosts.map(c => c.id.toString()));

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ЭТАП Б: ОБНАРУЖЕНИЕ "ЛИШНИХ" WORK_LOGS
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        await detectOrphanWorkLogs(wsProject, wsCostIds, stats);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ЭТАП В: СИНХРОНИЗАЦИЯ WORK_LOGS
        // (Бюджет проверяется и обновляется индивидуально перед каждым work_log)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        for (const cost of wsCosts) {
          await syncSingleCost(cost, stats);
        }

      } catch (error) {
        logger.error(`❌ Error syncing costs for project ${wsProject.name}: ${error.message}`);
        stats.work_logs.errors++;
      }
    }

    // Итоговый лог
    logger.info(`💰 Costs sync completed: ${stats.work_logs.created} created, ${stats.work_logs.unchanged} unchanged, ${stats.work_logs.errors} errors`);

    if (stats.orphan_work_logs.total > 0) {
      logger.warning(`⚠️ Found ${stats.orphan_work_logs.total} orphan work_logs (exist in Supabase but NOT in Worksection)`);
    }

  } catch (error) {
    logger.error(`❌ Costs sync error: ${error.message}`);
    throw error;
  }
}

/**
 * Обнаружение "лишних" work_logs (есть в Supabase, но нет в Worksection)
 */
async function detectOrphanWorkLogs(wsProject, wsCostIdsSet, stats) {
  try {
    // Сначала находим проект в Supabase по external_id
    const supaProject = await supabase.getProjectByExternalId(wsProject.id.toString());

    if (!supaProject) {
      logger.warning(`⚠️ Project not found in Supabase: ${wsProject.name} (external_id: ${wsProject.id})`);
      return;
    }

    // Получаем все work_logs из Supabase для этого проекта
    // (через связь decomposition_items → sections → project)
    const workLogs = await supabase.getWorkLogsByProject(supaProject.project_id);

    if (!workLogs || workLogs.length === 0) {
      return;
    }

    logger.info(`🔍 Checking ${workLogs.length} existing work_logs in Supabase for project ${wsProject.name}`);

    for (const workLog of workLogs) {
      // Пропускаем записи без external_id (ручные)
      if (!workLog.external_id || workLog.external_source !== 'worksection') {
        continue;
      }

      // Проверяем есть ли этот external_id в списке costs из WS
      if (!wsCostIdsSet.has(workLog.external_id)) {
        // ЛИШНИЙ ОТЧЕТ - его нет в Worksection!
        stats.orphan_work_logs.total++;
        stats.orphan_work_logs.details.push({
          work_log_id: workLog.work_log_id,
          external_id: workLog.external_id,
          date: workLog.work_log_date,
          user_email: workLog.user_email || 'Unknown',
          user_name: workLog.user_name || 'Unknown',
          amount: workLog.work_log_amount,
          hours: workLog.work_log_hours,
          description: workLog.work_log_description,
          project_id: wsProject.id,
          project_name: wsProject.name
        });

        logger.warning(`⚠️ ORPHAN work_log: ${workLog.external_id} (${workLog.work_log_date}, ${workLog.user_name})`);
      }
    }

  } catch (error) {
    logger.error(`Error detecting orphan work_logs: ${error.message}`);
  }
}

/**
 * Находит или создает decomposition_item для отчета
 * ℹ️ decomposition_items создаются ТОЛЬКО когда есть отчет на них
 */
async function findOrCreateDecompositionItem(cost, stats) {
  const taskId = cost.task.id.toString();

  // 1. Проверяем существование item
  let item = await supabase.getDecompositionItemByExternalId(taskId);
  if (item) {
    return item; // Уже существует
  }

  // 2. Находим decomposition_stage (должен существовать после stage-sync!)
  const stage = await supabase.getDecompositionStageByExternalId(taskId);
  if (!stage) {
    logger.error(`❌ Decomposition stage not found for task ${taskId} (${cost.task.name})`);
    logger.error(`   Stage должен быть создан в stage-sync.js перед синхронизацией отчетов`);
    return null;
  }

  // 3. Получаем константы (кешированные)
  const { categoryId, statusId, difficultyId } = await getCachedIds();

  if (!categoryId) {
    logger.error(`❌ Work category "Управление" not found in database`);
    return null;
  }

  // 4. Находим ответственного (если есть в cost)
  let responsibleId = null;
  if (cost.user_from?.email) {
    const user = await supabase.findUser(cost.user_from.email, stats);
    if (user) {
      responsibleId = user.user_id;
    }
  }

  // 5. Создаем decomposition_item
  const itemData = {
    decomposition_item_section_id: stage.decomposition_stage_section_id,
    decomposition_item_stage_id: stage.decomposition_stage_id,
    decomposition_item_description: cost.task.name || 'Unnamed task',
    decomposition_item_work_category_id: categoryId,
    decomposition_item_status_id: statusId,
    decomposition_item_difficulty_id: difficultyId,
    decomposition_item_planned_hours: parseTimeToHours(cost.time) || 0,
    decomposition_item_order: 1,
    decomposition_item_responsible: responsibleId,
    external_id: taskId,
    external_source: 'worksection'
  };

  item = await supabase.createDecompositionItem(itemData);
  stats.decomposition_items.created++;

  logger.success(`✅ Created decomposition_item for cost: ${cost.task.name}`);

  return item;
}

/**
 * Синхронизация одного cost → work_log
 */
async function syncSingleCost(cost, stats) {
  try {
    const externalId = cost.id.toString();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. ДЕДУПЛИКАЦИЯ: Проверить существование work_log
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const existingLog = await supabase.getWorkLogByExternalId(externalId);

    if (existingLog) {
      logger.info(`⏭️ Work log already exists for cost ${externalId}, skipping`);
      stats.work_logs.unchanged++;
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. Найти или создать decomposition_item
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const item = await findOrCreateDecompositionItem(cost, stats);

    if (!item) {
      logger.warning(`⚠️ Failed to find or create decomposition_item, skipping cost ${externalId}`);
      stats.work_logs.skipped++;
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. Найти пользователя по email
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const userEmail = cost.user_from?.email;
    if (!userEmail) {
      logger.warning(`⚠️ No user email in cost ${externalId}, skipping`);
      stats.work_logs.skipped++;
      return;
    }

    const user = await supabase.findUser(userEmail, stats);
    if (!user) {
      logger.warning(`⚠️ User not found: ${userEmail}, skipping cost ${externalId}`);
      stats.work_logs.skipped++;
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. Получить hourly_rate пользователя
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const profile = await supabase.getProfile(user.user_id);
    const hourlyRate = profile?.salary || 0;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5. Получить budget_id
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const budget = await supabase.getBudgetForDecompositionItem(item.decomposition_item_id);
    if (!budget) {
      logger.error(`❌ Budget not found for decomposition_item ${item.decomposition_item_id}`);
      stats.work_logs.errors++;
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 6. Конвертировать time (HH:MM) в часы и вычислить сумму
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const hours = parseTimeToHours(cost.time);
    // Вычисляем сумму как hours * hourlyRate (так же как в базе данных)
    const newAmount = hours * hourlyRate;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 7. Проверить и обновить бюджет если нужно
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const currentBudget = parseFloat(budget.total_amount);

    // Получаем все существующие work_logs для этого бюджета
    const existingWorkLogs = await supabase.getWorkLogsByBudget(budget.budget_id);

    // Считаем сумму уже потраченных денег
    const spentAmount = existingWorkLogs.reduce((sum, log) => sum + parseFloat(log.work_log_amount || 0), 0);

    // Считаем требуемую сумму (потрачено + новый отчет)
    const requiredAmount = spentAmount + newAmount;

    // Если требуемая сумма больше текущего бюджета - увеличиваем бюджет
    if (requiredAmount > currentBudget) {
      const deficit = requiredAmount - currentBudget;
      await supabase.updateBudget(budget.budget_id, {
        total_amount: requiredAmount
      });

      logger.info(`💵 Budget increased for task ${cost.task.id}: ${currentBudget} → ${requiredAmount} (added ${deficit.toFixed(2)} for new work_log)`);
      stats.budgets.updated++;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 8. Создать work_log
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const workLogData = {
      decomposition_item_id: item.decomposition_item_id,
      work_log_created_by: user.user_id,
      work_log_date: cost.date,
      work_log_hours: hours,
      work_log_hourly_rate: hourlyRate,
      // work_log_amount НЕ передаем - вычисляется автоматически в БД как hours * hourlyRate
      work_log_description: cost.comment || 'Imported from Worksection',
      budget_id: budget.budget_id,
      external_id: externalId,
      external_source: 'worksection'
    };

    await supabase.createWorkLog(workLogData);
    stats.work_logs.created++;

    logger.success(`✅ Created work_log for cost ${externalId}: ${cost.comment || 'No comment'} (${hours}h × ${hourlyRate}/h = ${newAmount.toFixed(2)})`);

    // Добавляем в детальный отчет
    if (stats.detailed_report) {
      stats.detailed_report.actions.push({
        action: 'created',
        type: 'work_log',
        id: cost.id,
        timestamp: new Date().toISOString(),
        user: userEmail,
        hours: hours,
        hourly_rate: hourlyRate,
        amount: newAmount,
        description: cost.comment
      });
    }

  } catch (error) {
    logger.error(`❌ Error syncing cost ${cost.id}: ${error.message}`);
    stats.work_logs.errors++;

    if (stats.detailed_report) {
      stats.detailed_report.actions.push({
        action: 'error',
        type: 'work_log',
        id: cost.id,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
}

/**
 * Конвертация времени из HH:MM в часы (decimal)
 * "10:30" → 10.5
 * "2:00" → 2.0
 */
function parseTimeToHours(timeString) {
  if (!timeString) return 0;

  const parts = timeString.split(':');
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;

  return hours + (minutes / 60);
}

module.exports = { syncCosts };
