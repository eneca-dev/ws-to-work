const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');
const userCache = require('../services/user-cache');

// Кеш для константных ID (category, status, difficulty)
let cachedCategoryId = null;
let cachedStatusId = null;
let cachedDifficultyId = null;

// Кэш для тегов (загружается один раз за синхронизацию)
let cachedTagMap = null;

// Маппинг статусов: Worksection → Supabase
const STATUS_MAPPING = {
  'Приостановлено': 'Пауза'
};

async function getCachedIds() {
  if (!cachedCategoryId) {
    cachedCategoryId = await supabase.getWorkCategoryIdByName('Управление');
    cachedStatusId = await supabase.getStatusIdByName('План');
    cachedDifficultyId = await supabase.getDifficultyIdByName('К');
    logger.info(`📦 Cached IDs: category=${cachedCategoryId}, status=${cachedStatusId}, difficulty=${cachedDifficultyId || 'null'}`);
  }
  return { categoryId: cachedCategoryId, statusId: cachedStatusId, difficultyId: cachedDifficultyId };
}

/**
 * Загрузить и кэшировать карту тегов из Worksection
 * @param {Object} stats - Объект статистики (для логирования предупреждений)
 * @returns {Promise<Object>} Карта тегов: tagId → { title, groupName, groupType }
 */
async function loadTagMap(stats) {
  if (cachedTagMap) {
    return cachedTagMap;
  }

  try {
    logger.info('🔄 Loading task tags from Worksection...');
    const allTags = await worksection.getTaskTags();
    cachedTagMap = worksection.buildTagMap(allTags);
    logger.info(`✅ Loaded ${Object.keys(cachedTagMap).length} tags (will be cached for this sync)`);
    return cachedTagMap;
  } catch (error) {
    logger.error(`Failed to load tag map: ${error.message}`);

    // Структурированное предупреждение
    if (stats && stats.error_details) {
      logStructuredWarning(
        stats,
        'tag_load_failed',
        `Failed to load tags from Worksection, status/progress sync will be skipped: ${error.message}`,
        { error: error.stack }
      );
    }

    return {};
  }
}

/**
 * Извлечь тег из конкретного набора
 * @param {Object} taskTags - Объект tags из WS задачи
 * @param {Object} tagMap - Карта тегов (из loadTagMap)
 * @param {string} groupName - Название набора (например, "Статус")
 * @returns {string|null} Значение тега или null
 */
function extractTagFromGroup(taskTags, tagMap, groupName) {
  if (!taskTags || !tagMap) return null;

  for (const [tagId, tagValue] of Object.entries(taskTags)) {
    const tagInfo = tagMap[tagId];
    if (tagInfo && tagInfo.groupName === groupName) {
      return tagInfo.title;
    }
  }

  return null;
}

/**
 * Извлечь тег из набора по типу (status или label)
 * @param {Object} taskTags - Объект tags из WS задачи
 * @param {Object} tagMap - Карта тегов (из loadTagMap)
 * @param {string} groupType - Тип набора ("status" или "label")
 * @returns {string|null} Значение тега или null
 */
function extractTagByGroupType(taskTags, tagMap, groupType) {
  if (!taskTags || !tagMap) return null;

  for (const [tagId, tagValue] of Object.entries(taskTags)) {
    const tagInfo = tagMap[tagId];
    if (tagInfo && tagInfo.groupType === groupType) {
      return tagInfo.title;
    }
  }

  return null;
}

/**
 * Извлечь максимальное значение прогресса если у задачи несколько меток "% готовности"
 * @param {Object} taskTags - Объект tags из WS задачи
 * @param {Object} tagMap - Карта тегов (из loadTagMap)
 * @param {string} groupName - Название набора (например, "⇆ % готовности")
 * @returns {string|null} Значение тега с максимальным процентом или null
 */
function extractMaxProgressTag(taskTags, tagMap, groupName) {
  if (!taskTags || !tagMap) return null;

  let maxValue = -1;
  let maxTag = null;

  for (const [tagId, tagValue] of Object.entries(taskTags)) {
    const tagInfo = tagMap[tagId];
    if (tagInfo && tagInfo.groupName === groupName) {
      // Парсим процент из строки "10%", "50%", "90%"
      const percentValue = parseInt(tagInfo.title.replace('%', '').trim());

      if (!isNaN(percentValue) && percentValue > maxValue) {
        maxValue = percentValue;
        maxTag = tagInfo.title;
      }
    }
  }

  return maxTag;
}

/**
 * Логирует структурированную ошибку в stats
 * @param {Object} stats - Объект статистики
 * @param {string} errorType - Тип ошибки
 * @param {string} stage - Стадия синхронизации
 * @param {Error|string} error - Объект ошибки или строка
 * @param {Object} context - Дополнительный контекст
 * @param {boolean} isCritical - Критическая ли ошибка
 */
function logStructuredError(stats, errorType, stage, error, context = {}, isCritical = false) {
  const errorDetails = stats.error_details;

  errorDetails.total_errors++;
  errorDetails.errors_by_type[errorType] = (errorDetails.errors_by_type[errorType] || 0) + 1;
  errorDetails.errors_by_stage[stage] = (errorDetails.errors_by_stage[stage] || 0) + 1;

  const errorObj = {
    timestamp: new Date().toISOString(),
    type: errorType,
    stage: stage,
    message: error.message || error.toString(),
    stack: error.stack || null,
    context: {
      project_id: context.projectId || null,
      project_name: context.projectName || null,
      task_id: context.taskId || null,
      task_name: context.taskName || null,
      stage_id: context.stageId || null,
      stage_name: context.stageName || null,
      additional: context.additional || null
    }
  };

  if (isCritical) {
    errorDetails.critical_errors.push(errorObj);
    logger.error(`❌ CRITICAL ERROR [${errorType}/${stage}]: ${errorObj.message}`);
  } else {
    logger.error(`❌ ERROR [${errorType}/${stage}]: ${errorObj.message}`);
  }
}

/**
 * Логирует структурированное предупреждение
 */
function logStructuredWarning(stats, warningType, message, context = {}) {
  const warningObj = {
    timestamp: new Date().toISOString(),
    type: warningType,
    message: message,
    context: context
  };

  stats.error_details.warnings.push(warningObj);
  logger.warning(`⚠️ WARNING [${warningType}]: ${message}`);
}

/**
 * Найти или создать дефолтную задачу (decomposition_item) для этапа
 * @param {Object} stage - decomposition_stage из БД
 * @param {string} stageName - Название этапа
 * @param {Object} stats - Объект статистики
 * @returns {Promise<Object|null>} decomposition_item или null
 */
async function findOrCreateDefaultTask(stage, stageName, stats, itemsMap = null) {
  try {
    let item = itemsMap
      ? itemsMap.get(String(stage.external_id))
      : await supabase.getDecompositionItemByExternalId(stage.external_id);

    if (item) {
      logger.info(`   ✅ Found existing default task: ${item.decomposition_item_description}`);
      stats.decomposition_items.default_tasks_found++;
      return item;
    }

    logger.info(`   🔨 Creating default task for stage: ${stageName}`);

    const { categoryId, statusId, difficultyId } = await getCachedIds();

    const itemData = {
      decomposition_item_section_id: stage.decomposition_stage_section_id,
      decomposition_item_stage_id: stage.decomposition_stage_id,
      decomposition_item_description: `${stageName} - задача`,
      decomposition_item_work_category_id: categoryId,
      decomposition_item_status_id: statusId,
      decomposition_item_difficulty_id: difficultyId,
      decomposition_item_planned_hours: 0,
      decomposition_item_order: 1,
      decomposition_item_progress: 0,
      external_id: stage.external_id,
      external_source: 'worksection'
    };

    const createdItem = await supabase.createDecompositionItem(itemData);

    if (createdItem) {
      logger.success(`   ✅ Created default task: ${createdItem.decomposition_item_description}`);
      stats.decomposition_items.created++;
      stats.decomposition_items.default_tasks_created++;
      // Обновляем кэш чтобы повторный поиск в этом же прогоне не шёл в БД
      if (itemsMap) itemsMap.set(String(stage.external_id), createdItem);
    }

    return createdItem;

  } catch (error) {
    logStructuredError(
      stats,
      'database_error',
      'task_creation',
      error,
      {
        stageId: stage.decomposition_stage_id,
        stageName: stageName,
        externalId: stage.external_id
      },
      true
    );
    stats.decomposition_items.errors++;
    return null;
  }
}

/**
 * Синхронизировать статус и % готовности для decomposition_stage
 * @param {Object} stage - decomposition_stage из БД
 * @param {Object} wsTask - Задача из Worksection (nested task)
 * @param {Object} tagMap - Карта тегов
 * @param {Object} stats - Объект статистики
 */
async function syncStageStatusAndProgress(stage, wsTask, tagMap, stats, itemsMap = null) {
  try {
    // Статус берем из набора с type="status"
    const statusTag = extractTagByGroupType(wsTask.tags, tagMap, 'status');
    // Прогресс берем из набора "01. ⇆ % готовности" - максимальное значение если меток несколько
    const progressTag = extractMaxProgressTag(wsTask.tags, tagMap, '01. ⇆ % готовности');

    logger.info(`   📊 Tags found - Status: "${statusTag}", Progress: "${progressTag}"`);

    const context = {
      projectId: wsTask.project_id,
      projectName: wsTask.project_name,
      taskId: wsTask.id,
      taskName: wsTask.name,
      stageId: stage.decomposition_stage_id,
      stageName: stage.decomposition_stage_name
    };

    // === СИНХРОНИЗАЦИЯ СТАТУСА (тег) ===
    if (statusTag) {
      try {
        // Применяем маппинг статусов (Worksection → Supabase)
        const mappedStatusTag = STATUS_MAPPING[statusTag] || statusTag;

        if (mappedStatusTag !== statusTag) {
          logger.info(`   🔄 Mapping status: "${statusTag}" → "${mappedStatusTag}"`);
        }

        const statusId = await supabase.getStageStatusIdByName(mappedStatusTag);

        if (!statusId) {
          logStructuredWarning(
            stats,
            'status_not_found',
            `Status "${mappedStatusTag}" not found in stage_statuses table`,
            { ...context, statusTag, mappedStatusTag }
          );
        } else if (stage.stage_status_id !== statusId) {
          await supabase.updateDecompositionStage(stage.decomposition_stage_id, {
            stage_status_id: statusId
          });
          logger.success(`   ✅ Updated stage status: ${mappedStatusTag}`);
          stats.decomposition_stages.status_synced++;
        }
      } catch (error) {
        logStructuredError(
          stats,
          'database_error',
          'status_sync',
          error,
          { ...context, statusTag },
          true
        );
        stats.decomposition_stages.errors++;
      }
    }

    // === СИНХРОНИЗАЦИЯ % ГОТОВНОСТИ ===

    if (!progressTag) {
      logStructuredWarning(
        stats,
        'no_progress_tag',
        'No progress tag found, skipping default task creation',
        context
      );
      stats.decomposition_stages.skipped_no_progress++;
      return;
    }

    const progressValue = parseInt(progressTag.replace('%', '').trim());

    if (isNaN(progressValue)) {
      logStructuredWarning(
        stats,
        'invalid_progress_tag',
        `Could not parse progress from tag: "${progressTag}"`,
        { ...context, progressTag }
      );
      return;
    }

    // Валидация диапазона (0-100)
    if (progressValue < 0 || progressValue > 100) {
      logStructuredWarning(
        stats,
        'invalid_progress_range',
        `Progress value out of range (0-100): ${progressValue}`,
        { ...context, progressTag, progressValue }
      );
      return;
    }

    try {
      const defaultTask = await findOrCreateDefaultTask(stage, wsTask.name, stats, itemsMap);

      if (defaultTask) {
        if (defaultTask.decomposition_item_progress !== progressValue) {
          await supabase.updateDecompositionItemProgress(
            defaultTask.decomposition_item_id,
            progressValue
          );
          logger.success(`   ✅ Updated task progress: ${progressValue}% for "${defaultTask.decomposition_item_description}"`);
          stats.decomposition_items.updated++;
          stats.decomposition_items.progress_updated++;
          stats.decomposition_stages.progress_synced++;
        } else {
          logger.info(`   ℹ️ Progress unchanged (${progressValue}%), skipping update`);
        }
      }
    } catch (error) {
      logStructuredError(
        stats,
        'database_error',
        'progress_sync',
        error,
        { ...context, progressValue },
        true
      );
      stats.decomposition_items.errors++;
    }

  } catch (error) {
    logStructuredError(
      stats,
      'sync_general_error',
      'stage_status_progress_sync',
      error,
      {
        projectId: wsTask.project_id,
        taskId: wsTask.id,
        taskName: wsTask.name
      },
      true
    );
    stats.decomposition_stages.errors++;
  }
}

/**
 * Синхронизация decomposition_stages и decomposition_items
 * Standard проекты: WS Project → Task → Subtask → Nested task → decomposition_stages
 * OS проекты: WS Project → Task → Subtask → decomposition_stages → Nested task → decomposition_items
 */
async function syncDecompositionStages(stats, offset = 0, limit = 7, projectId = null) {
  try {
    // Инициализация статистики
    if (!stats.decomposition_stages) {
      stats.decomposition_stages = {
        created: 0,
        updated: 0,
        unchanged: 0,
        errors: 0,
        skipped: 0,
        status_synced: 0,
        progress_synced: 0,
        auto_completed: 0,
        skipped_no_progress: 0
      };
    }
    if (!stats.decomposition_items) {
      stats.decomposition_items = {
        created: 0,
        updated: 0,
        unchanged: 0,
        errors: 0,
        skipped: 0,
        progress_updated: 0,
        default_tasks_created: 0,
        default_tasks_found: 0
      };
    }
    if (!stats.error_details) {
      stats.error_details = {
        total_errors: 0,
        errors_by_type: {},
        errors_by_stage: {},
        critical_errors: [],
        warnings: []
      };
    }

    // Загрузить карту тегов один раз для всех проектов
    const tagMap = await loadTagMap(stats);

    const wsProjects = await worksection.getProjectsWithSyncTags();

    // Фильтруем проекты начинающиеся с "!"
    let filteredProjects = wsProjects.filter(project => {
      if (project.name && project.name.startsWith('!')) {
        logger.info(`🚫 Skipping project starting with "!": ${project.name}`);
        return false;
      }
      return true;
    });

    // Если указан конкретный projectId - фильтруем только его
    if (projectId) {
      filteredProjects = filteredProjects.filter(p => p.id.toString() === projectId.toString());
      if (filteredProjects.length === 0) {
        logger.warning(`⚠️ Project ${projectId} not found in Worksection sync projects`);
        return;
      }
      logger.info(`🎯 Syncing stages for specific project: ${filteredProjects[0].name}`);
    }

    // Применяем offset и limit для пагинации
    const paginatedProjects = projectId ? filteredProjects : filteredProjects.slice(offset, offset + limit);

    // ⚡ ОПТИМИЗАЦИЯ: загружаем все данные один раз вместо N+1 запросов
    const [allSections, allStages, allItems] = await Promise.all([
      supabase.getSections(),
      supabase.getDecompositionStages(),
      supabase.getDecompositionItems()
    ]);
    // String() защищает от type mismatch: если external_id в БД bigint → вернётся число, Map.get("123") ≠ Map.get(123)
    const sectionMap = new Map(allSections.map(s => [`${String(s.external_id)}:${s.external_source}`, s]));
    const stagesMap = new Map(allStages.map(s => [String(s.external_id), s]));
    const itemsMap = new Map(allItems.map(i => [String(i.external_id), i]));
    logger.info(`⚡ Pre-loaded: ${allSections.length} sections, ${allStages.length} stages, ${allItems.length} items`);

    for (const wsProject of paginatedProjects) {
      try {
        logger.info(`📊 Processing decomposition stages for project: ${wsProject.name}`);

        // Определяем тип синхронизации проекта
        const syncType = worksection.determineProjectSyncType(wsProject);
        logger.info(`📊 Project sync type: ${syncType}`);

        // Получаем все задачи проекта с подзадачами
        const wsTasks = await worksection.getProjectTasks(wsProject.id);

        if (!wsTasks || wsTasks.length === 0) {
          logger.info(`No tasks found for project ${wsProject.name}`);
          continue;
        }

        if (syncType === 'os') {
          // OS проекты: Task → Section, Subtask → Decomposition Stage
          logger.info(`📊 OS Project: Processing subtasks as decomposition_stages`);

          for (const wsTask of wsTasks) {
            // Пропускаем только задачи начинающиеся с "!"
            if (wsTask.name && wsTask.name.startsWith('!')) {
              logger.info(`🚫 Skipping task starting with "!": ${wsTask.name}`);
              continue;
            }

            // Проверяем есть ли подзадачи
            if (!wsTask.child || wsTask.child.length === 0) continue;

            // Находим section для РОДИТЕЛЬСКОЙ задачи с external_source = 'worksection-os'
            const supaSection = sectionMap.get(`${wsTask.id}:worksection-os`);

            if (!supaSection) {
              logger.warning(`⚠️ Section not found for task ${wsTask.id}: ${wsTask.name}`);
              stats.decomposition_stages.skipped++;
              continue;
            }

            // Обрабатываем подзадачи как decomposition_stages
            for (const wsSubtask of wsTask.child) {
              const createdStage = await syncSingleDecompositionStage(wsSubtask, supaSection, stats, tagMap, stagesMap, itemsMap);

              // Для OS проектов: если у подзадачи есть вложенные задачи 3-го уровня - синхронизируем их как decomposition_items
              if (createdStage && wsSubtask.child && wsSubtask.child.length > 0) {
                logger.info(`📋 Found ${wsSubtask.child.length} nested tasks in stage "${wsSubtask.name}", syncing as decomposition_items`);
                for (const wsNestedTask of wsSubtask.child) {
                  await syncSingleDecompositionItem(wsNestedTask, createdStage, supaSection, stats, itemsMap);
                }
              }
            }
          }

        } else {
          // Standard проекты: вложенные задачи 3-го уровня → decomposition_stages
          logger.info(`📊 Standard Project: Processing 3rd level nested tasks as decomposition_stages`);

          // Обрабатываем каждую задачу (Task → Object)
          for (const wsTask of wsTasks) {
            // Пропускаем если это не task group или нет подзадач
            if (!wsTask.child || wsTask.child.length === 0) continue;

            // Обрабатываем подзадачи (Subtask → Section)
            for (const wsSubtask of wsTask.child) {
              // Пропускаем не активные подзадачи
              if (wsSubtask.status !== 'active') continue;

              // Проверяем есть ли вложенные задачи 3-го уровня
              if (!wsSubtask.child || wsSubtask.child.length === 0) continue;

              // Находим section в Supabase по external_id подзадачи
              const supaSection = sectionMap.get(`${wsSubtask.id}:worksection`);

              if (!supaSection) {
                logger.warning(`⚠️ Section not found for subtask ${wsSubtask.id}: ${wsSubtask.name}`);
                stats.decomposition_stages.skipped++;
                continue;
              }

              // Обрабатываем вложенные задачи 3-го уровня (Nested task → decomposition_stage)
              for (const wsNestedTask of wsSubtask.child) {
                await syncSingleDecompositionStage(wsNestedTask, supaSection, stats, tagMap, stagesMap, itemsMap);
              }
            }
          }
        }

      } catch (error) {
        logger.error(`❌ Error syncing stages for project ${wsProject.name}: ${error.message}`);
        stats.decomposition_stages.errors++;
      }
    }

    logger.info(`📊 Decomposition stages sync completed: ${stats.decomposition_stages.created} created, ${stats.decomposition_stages.updated} updated`);

  } catch (error) {
    logger.error(`❌ Decomposition stages sync error: ${error.message}`);
    throw error;
  }
}

/**
 * Синхронизация одной decomposition_stage
 */
async function syncSingleDecompositionStage(wsNestedTask, supaSection, stats, tagMap = null, stagesMap = null, itemsMap = null) {
  try {
    // Синхронизируем все статусы (active, done, hold, canceled)
    logger.info(`📊 Processing stage: ${wsNestedTask.name} (status: ${wsNestedTask.status})`);

    const externalId = wsNestedTask.id.toString();

    // Проверяем существование decomposition_stage (из кэша или из БД)
    const existingStage = stagesMap
      ? stagesMap.get(externalId)
      : await supabase.getDecompositionStageByExternalId(externalId);

    const stageData = {
      decomposition_stage_section_id: supaSection.section_id,
      decomposition_stage_name: wsNestedTask.name,
      decomposition_stage_description: wsNestedTask.text || null,
      decomposition_stage_start: wsNestedTask.date_start || null,
      decomposition_stage_finish: wsNestedTask.date_end || null,
      external_id: externalId,
      external_source: 'worksection'
    };

    let stage;

    if (existingStage) {
      // Нормализуем даты к YYYY-MM-DD (Supabase может вернуть timestamp "2025-01-15T00:00:00+00:00")
      const normDate = d => d ? d.split('T')[0] : null;

      // Dirty-check: обновляем только если данные изменились
      const hasChanges =
        existingStage.decomposition_stage_name !== wsNestedTask.name ||
        existingStage.decomposition_stage_description !== (wsNestedTask.text || null) ||
        normDate(existingStage.decomposition_stage_start) !== (wsNestedTask.date_start || null) ||
        normDate(existingStage.decomposition_stage_finish) !== (wsNestedTask.date_end || null) ||
        existingStage.decomposition_stage_section_id !== supaSection.section_id;

      if (hasChanges) {
        // UPDATE существующего stage
        await supabase.updateDecompositionStage(existingStage.decomposition_stage_id, stageData);
        stats.decomposition_stages.updated++;
        logger.info(`🔄 Updated decomposition_stage: ${wsNestedTask.name}`);

        // Добавляем в детальный отчет
        if (stats.detailed_report) {
          stats.detailed_report.actions.push({
            action: 'updated',
            type: 'decomposition_stage',
            id: wsNestedTask.id,
            name: wsNestedTask.name,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        stats.decomposition_stages.unchanged++;
        logger.info(`✅ decomposition_stage unchanged: ${wsNestedTask.name}`);
      }

      stage = existingStage;

    } else {
      // CREATE нового stage
      const newStage = await supabase.createDecompositionStage(stageData);
      stats.decomposition_stages.created++;
      logger.success(`✅ Created decomposition_stage: ${wsNestedTask.name}`);

      // Добавляем в кэш, чтобы повторные обращения работали без запроса в БД
      if (stagesMap) stagesMap.set(externalId, newStage);

      // Добавляем в детальный отчет
      if (stats.detailed_report) {
        stats.detailed_report.actions.push({
          action: 'created',
          type: 'decomposition_stage',
          id: wsNestedTask.id,
          name: wsNestedTask.name,
          timestamp: new Date().toISOString()
        });
      }

      stage = newStage;
    }

    // Синхронизировать статус и % готовности
    if (tagMap && stage) {
      // Загружаем полную информацию о задаче через get_task для получения тегов
      // т.к. get_tasks с extra=subtasks не всегда возвращает теги для вложенных задач
      try {
        const fullTaskData = await worksection.getTask(wsNestedTask.id);
        if (fullTaskData && fullTaskData.tags) {
          // Используем теги из полной загрузки задачи
          await syncStageStatusAndProgress(stage, fullTaskData, tagMap, stats, itemsMap);
        } else {
          logger.warning(`   ⚠️ No tags found for task ${wsNestedTask.id} via get_task`);
          await syncStageStatusAndProgress(stage, wsNestedTask, tagMap, stats, itemsMap);
        }
      } catch (error) {
        logger.warning(`   ⚠️ Failed to load full task data for ${wsNestedTask.id}: ${error.message}`);
        await syncStageStatusAndProgress(stage, wsNestedTask, tagMap, stats, itemsMap);
      }
    }

    return stage;

  } catch (error) {
    logger.error(`❌ Error syncing decomposition_stage ${wsNestedTask.name}: ${error.message}`);
    stats.decomposition_stages.errors++;

    if (stats.detailed_report) {
      stats.detailed_report.actions.push({
        action: 'error',
        type: 'decomposition_stage',
        id: wsNestedTask.id,
        name: wsNestedTask.name,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }

    return null;
  }
}

/**
 * Синхронизация одной decomposition_item (для OS проектов: вложенные задачи 3-го уровня)
 */
async function syncSingleDecompositionItem(wsNestedTask, stage, section, stats, itemsMap = null) {
  try {
    // Синхронизируем все статусы (active, done, hold, canceled)
    logger.info(`📋 Processing item: ${wsNestedTask.name} (status: ${wsNestedTask.status})`);

    const externalId = wsNestedTask.id.toString();

    // Проверяем существование decomposition_item (из кэша или из БД)
    const existingItem = itemsMap
      ? itemsMap.get(externalId)
      : await supabase.getDecompositionItemByExternalId(externalId);

    // Получаем кешированные ID констант
    const { categoryId, statusId, difficultyId } = await getCachedIds();

    // Ищем ответственного
    let responsibleId = null;
    if (wsNestedTask.user_to?.email) {
      const user = userCache.findUser(wsNestedTask.user_to.email, stats);
      if (user) responsibleId = user.user_id;
    }

    const itemData = {
      decomposition_item_section_id: section.section_id,
      decomposition_item_stage_id: stage.decomposition_stage_id,
      decomposition_item_description: wsNestedTask.name,
      decomposition_item_work_category_id: categoryId,
      decomposition_item_status_id: statusId,
      decomposition_item_difficulty_id: difficultyId,
      decomposition_item_planned_hours: 0,
      decomposition_item_order: 1,
      decomposition_item_responsible: responsibleId,
      external_id: externalId,
      external_source: 'worksection'
    };

    if (existingItem) {
      // Dirty-check: обновляем только если данные изменились
      const hasChanges =
        existingItem.decomposition_item_description !== wsNestedTask.name ||
        existingItem.decomposition_item_section_id !== section.section_id ||
        existingItem.decomposition_item_stage_id !== stage.decomposition_stage_id ||
        existingItem.decomposition_item_responsible !== (responsibleId || null) ||
        existingItem.decomposition_item_work_category_id !== categoryId ||
        existingItem.decomposition_item_status_id !== statusId;

      if (hasChanges) {
        // UPDATE существующего item
        await supabase.updateDecompositionItem(existingItem.decomposition_item_id, itemData);
        stats.decomposition_items.updated++;
        logger.info(`🔄 Updated decomposition_item: ${wsNestedTask.name}`);

        if (stats.detailed_report) {
          stats.detailed_report.actions.push({
            action: 'updated',
            type: 'decomposition_item',
            id: wsNestedTask.id,
            name: wsNestedTask.name,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        stats.decomposition_items.unchanged++;
        logger.info(`✅ decomposition_item unchanged: ${wsNestedTask.name}`);
      }

    } else {
      // CREATE нового item
      const newItem = await supabase.createDecompositionItem(itemData);
      stats.decomposition_items.created++;
      logger.success(`✅ Created decomposition_item: ${wsNestedTask.name}`);

      // Добавляем в кэш, чтобы повторные обращения работали без запроса в БД
      if (itemsMap) itemsMap.set(externalId, newItem);

      if (stats.detailed_report) {
        stats.detailed_report.actions.push({
          action: 'created',
          type: 'decomposition_item',
          id: wsNestedTask.id,
          name: wsNestedTask.name,
          timestamp: new Date().toISOString()
        });
      }
    }

  } catch (error) {
    logger.error(`❌ Error syncing decomposition_item ${wsNestedTask.name}: ${error.message}`);
    stats.decomposition_items.errors++;

    if (stats.detailed_report) {
      stats.detailed_report.actions.push({
        action: 'error',
        type: 'decomposition_item',
        id: wsNestedTask.id,
        name: wsNestedTask.name,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
}

/**
 * Очистить кэш тегов (вызывается после синхронизации)
 */
function clearTagCache() {
  cachedTagMap = null;
  logger.info('🧹 Tag cache cleared');
}

// ℹ️ Для OS проектов decomposition_items создаются из вложенных задач 3-го уровня
// ℹ️ Для Standard проектов decomposition_items создаются автоматически в costs-sync.js
// ℹ️ при синхронизации отчетов (только для задач, на которые есть отчеты)

module.exports = { syncDecompositionStages, clearTagCache };
