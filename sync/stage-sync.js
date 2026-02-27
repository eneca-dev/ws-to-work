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
 * Извлечь тег из набора по типу (status или label)
 */
function extractTagByGroupType(taskTags, tagMap, groupType) {
  if (!taskTags || !tagMap) return null;

  for (const [tagId] of Object.entries(taskTags)) {
    const tagInfo = tagMap[tagId];
    if (tagInfo && tagInfo.groupType === groupType) {
      return tagInfo.title;
    }
  }

  return null;
}

/**
 * Извлечь максимальное значение прогресса если у задачи несколько меток "% готовности"
 */
function extractMaxProgressTag(taskTags, tagMap, groupName) {
  if (!taskTags || !tagMap) return null;

  let maxValue = -1;
  let maxTag = null;

  for (const [tagId] of Object.entries(taskTags)) {
    const tagInfo = tagMap[tagId];
    if (tagInfo && tagInfo.groupName === groupName) {
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
 * @param {Map} itemsMap - Кэш всех items (externalId → item)
 */
async function findOrCreateDefaultTask(stage, stageName, stats, itemsMap) {
  try {
    // Ищем в кэше вместо запроса к БД
    let item = itemsMap.get(String(stage.external_id));

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
      // Добавляем в кэш для последующих обращений
      itemsMap.set(String(stage.external_id), createdItem);
    }

    return createdItem;

  } catch (error) {
    logStructuredError(
      stats,
      'database_error',
      'task_creation',
      error,
      { stageId: stage.decomposition_stage_id, stageName, externalId: stage.external_id },
      true
    );
    stats.decomposition_items.errors++;
    return null;
  }
}

/**
 * Синхронизировать статус и % готовности для decomposition_stage
 * @param {Object} stage - decomposition_stage из БД
 * @param {Object} wsTask - Задача из Worksection
 * @param {Object} tagMap - Карта тегов
 * @param {Object} stats - Объект статистики
 * @param {Map} itemsMap - Кэш items
 * @param {Map} statusIdCache - Кэш statusId: statusName → uuid
 */
async function syncStageStatusAndProgress(stage, wsTask, tagMap, stats, itemsMap, statusIdCache) {
  try {
    const statusTag = extractTagByGroupType(wsTask.tags, tagMap, 'status');
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

    // === СИНХРОНИЗАЦИЯ СТАТУСА ===
    if (statusTag) {
      try {
        const mappedStatusTag = STATUS_MAPPING[statusTag] || statusTag;

        if (mappedStatusTag !== statusTag) {
          logger.info(`   🔄 Mapping status: "${statusTag}" → "${mappedStatusTag}"`);
        }

        // Используем кэш statusId вместо запроса к БД на каждый этап
        let statusId;
        if (statusIdCache.has(mappedStatusTag)) {
          statusId = statusIdCache.get(mappedStatusTag);
        } else {
          statusId = await supabase.getStageStatusIdByName(mappedStatusTag);
          statusIdCache.set(mappedStatusTag, statusId);
        }

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
          stats, 'database_error', 'status_sync', error, { ...context, statusTag }, true
        );
        stats.decomposition_stages.errors++;
      }
    }

    // === СИНХРОНИЗАЦИЯ % ГОТОВНОСТИ ===
    if (!progressTag) {
      logStructuredWarning(stats, 'no_progress_tag', 'No progress tag found, skipping default task creation', context);
      stats.decomposition_stages.skipped_no_progress++;
      return;
    }

    const progressValue = parseInt(progressTag.replace('%', '').trim());

    if (isNaN(progressValue)) {
      logStructuredWarning(stats, 'invalid_progress_tag', `Could not parse progress from tag: "${progressTag}"`, { ...context, progressTag });
      return;
    }

    if (progressValue < 0 || progressValue > 100) {
      logStructuredWarning(stats, 'invalid_progress_range', `Progress value out of range (0-100): ${progressValue}`, { ...context, progressTag, progressValue });
      return;
    }

    try {
      const defaultTask = await findOrCreateDefaultTask(stage, wsTask.name, stats, itemsMap);

      if (defaultTask) {
        if (defaultTask.decomposition_item_progress !== progressValue) {
          await supabase.updateDecompositionItemProgress(defaultTask.decomposition_item_id, progressValue);
          logger.success(`   ✅ Updated task progress: ${progressValue}% for "${defaultTask.decomposition_item_description}"`);
          stats.decomposition_items.updated++;
          stats.decomposition_items.progress_updated++;
          stats.decomposition_stages.progress_synced++;
        } else {
          logger.info(`   ℹ️ Progress unchanged (${progressValue}%), skipping update`);
        }
      }
    } catch (error) {
      logStructuredError(stats, 'database_error', 'progress_sync', error, { ...context, progressValue }, true);
      stats.decomposition_items.errors++;
    }

  } catch (error) {
    logStructuredError(
      stats, 'sync_general_error', 'stage_status_progress_sync', error,
      { projectId: wsTask.project_id, taskId: wsTask.id, taskName: wsTask.name }, true
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
        created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0,
        status_synced: 0, progress_synced: 0, auto_completed: 0, skipped_no_progress: 0
      };
    }
    if (!stats.decomposition_items) {
      stats.decomposition_items = {
        created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0,
        progress_updated: 0, default_tasks_created: 0, default_tasks_found: 0
      };
    }
    if (!stats.error_details) {
      stats.error_details = {
        total_errors: 0, errors_by_type: {}, errors_by_stage: {},
        critical_errors: [], warnings: []
      };
    }

    // Загрузить карту тегов один раз для всех проектов
    const tagMap = await loadTagMap(stats);

    // ⚡ ОПТИМИЗАЦИЯ: загружаем все данные из БД одним батчем вместо N+1 запросов
    const [allStages, allItems, allSections] = await Promise.all([
      supabase.getDecompositionStages(),
      supabase.getDecompositionItems(),
      supabase.getSections()
    ]);

    // String() защищает от type mismatch: external_id в БД может быть bigint → Map.get("123") ≠ Map.get(123)
    const stagesMap = new Map(allStages.map(s => [String(s.external_id), s]));
    const itemsMap = new Map(allItems.map(i => [String(i.external_id), i]));
    // Ключ секции: "externalId:source" — чтобы различать worksection и worksection-os
    const sectionsMap = new Map(allSections.map(s => [`${String(s.external_id)}:${s.external_source}`, s]));
    // Кэш statusId: statusName → uuid (заполняется при первом обращении к каждому статусу)
    const statusIdCache = new Map();

    logger.info(`⚡ Pre-loaded: ${allStages.length} stages, ${allItems.length} items, ${allSections.length} sections`);

    const wsProjects = await worksection.getProjectsWithSyncTags();

    // Фильтруем проекты начинающиеся с "!"
    let filteredProjects = wsProjects.filter(project => {
      if (project.name && project.name.startsWith('!')) {
        logger.info(`🚫 Skipping project starting with "!": ${project.name}`);
        return false;
      }
      return true;
    });

    if (projectId) {
      filteredProjects = filteredProjects.filter(p => p.id.toString() === projectId.toString());
      if (filteredProjects.length === 0) {
        logger.warning(`⚠️ Project ${projectId} not found in Worksection sync projects`);
        return;
      }
      logger.info(`🎯 Syncing stages for specific project: ${filteredProjects[0].name}`);
    }

    const paginatedProjects = projectId ? filteredProjects : filteredProjects.slice(offset, offset + limit);

    for (const wsProject of paginatedProjects) {
      try {
        logger.info(`📊 Processing decomposition stages for project: ${wsProject.name}`);

        const syncType = worksection.determineProjectSyncType(wsProject);
        logger.info(`📊 Project sync type: ${syncType}`);

        const wsTasks = await worksection.getProjectTasks(wsProject.id);

        if (!wsTasks || wsTasks.length === 0) {
          logger.info(`No tasks found for project ${wsProject.name}`);
          continue;
        }

        if (syncType === 'os') {
          logger.info(`📊 OS Project: Processing subtasks as decomposition_stages`);

          for (const wsTask of wsTasks) {
            if (wsTask.name && wsTask.name.startsWith('!')) {
              logger.info(`🚫 Skipping task starting with "!": ${wsTask.name}`);
              continue;
            }

            if (!wsTask.child || wsTask.child.length === 0) continue;

            // Ищем section из кэша вместо запроса к БД
            const supaSection = sectionsMap.get(`${wsTask.id}:worksection-os`);

            if (!supaSection) {
              logger.warning(`⚠️ Section not found for task ${wsTask.id}: ${wsTask.name}`);
              stats.decomposition_stages.skipped++;
              continue;
            }

            for (const wsSubtask of wsTask.child) {
              const stage = await syncSingleDecompositionStage(
                wsSubtask, supaSection, stats, tagMap, stagesMap, itemsMap, statusIdCache
              );

              if (stage && wsSubtask.child && wsSubtask.child.length > 0) {
                logger.info(`📋 Found ${wsSubtask.child.length} nested tasks in stage "${wsSubtask.name}", syncing as decomposition_items`);
                for (const wsNestedTask of wsSubtask.child) {
                  await syncSingleDecompositionItem(wsNestedTask, stage, supaSection, stats, itemsMap);
                }
              }
            }
          }

        } else {
          logger.info(`📊 Standard Project: Processing 3rd level nested tasks as decomposition_stages`);

          for (const wsTask of wsTasks) {
            if (!wsTask.child || wsTask.child.length === 0) continue;

            for (const wsSubtask of wsTask.child) {
              if (wsSubtask.status !== 'active') continue;
              if (!wsSubtask.child || wsSubtask.child.length === 0) continue;

              // Ищем section из кэша вместо запроса к БД
              const supaSection = sectionsMap.get(`${wsSubtask.id}:worksection`);

              if (!supaSection) {
                logger.warning(`⚠️ Section not found for subtask ${wsSubtask.id}: ${wsSubtask.name}`);
                stats.decomposition_stages.skipped++;
                continue;
              }

              for (const wsNestedTask of wsSubtask.child) {
                await syncSingleDecompositionStage(
                  wsNestedTask, supaSection, stats, tagMap, stagesMap, itemsMap, statusIdCache
                );
              }
            }
          }
        }

      } catch (error) {
        logger.error(`❌ Error syncing stages for project ${wsProject.name}: ${error.message}`);
        stats.decomposition_stages.errors++;
      }
    }

    logger.info(`📊 Decomposition stages sync completed: ${stats.decomposition_stages.created} created, ${stats.decomposition_stages.updated} updated, ${stats.decomposition_stages.unchanged} unchanged`);

  } catch (error) {
    logger.error(`❌ Decomposition stages sync error: ${error.message}`);
    throw error;
  }
}

/**
 * Синхронизация одной decomposition_stage
 * @param {Object} wsNestedTask - Задача из Worksection
 * @param {Object} supaSection - Section из Supabase
 * @param {Object} stats - Объект статистики
 * @param {Object} tagMap - Карта тегов
 * @param {Map} stagesMap - Кэш stages (externalId → stage)
 * @param {Map} itemsMap - Кэш items (externalId → item)
 * @param {Map} statusIdCache - Кэш statusId (statusName → uuid)
 */
async function syncSingleDecompositionStage(wsNestedTask, supaSection, stats, tagMap, stagesMap, itemsMap, statusIdCache) {
  try {
    logger.info(`📊 Processing stage: ${wsNestedTask.name} (status: ${wsNestedTask.status})`);

    const externalId = String(wsNestedTask.id);

    // Ищем ответственного
    let responsibles = [];
    if (wsNestedTask.user_to?.email) {
      const user = userCache.findUser(wsNestedTask.user_to.email, stats);
      if (user) responsibles = [user.user_id];
    }

    // Ищем существующий этап из кэша вместо запроса к БД
    const existingStage = stagesMap.get(externalId);

    const stageData = {
      decomposition_stage_section_id: supaSection.section_id,
      decomposition_stage_name: wsNestedTask.name,
      decomposition_stage_description: wsNestedTask.text || null,
      decomposition_stage_start: wsNestedTask.date_start || null,
      decomposition_stage_finish: wsNestedTask.date_end || null,
      decomposition_stage_responsibles: responsibles,
      external_id: externalId,
      external_source: 'worksection'
    };

    let stage;

    if (existingStage) {
      // Проверяем изменилось ли название или ответственный
      const existingResponsible = (existingStage.decomposition_stage_responsibles || [])[0] || null;
      const newResponsible = responsibles[0] || null;
      const hasChanges = existingStage.decomposition_stage_name !== wsNestedTask.name ||
                         existingResponsible !== newResponsible;

      if (hasChanges) {
        await supabase.updateDecompositionStage(existingStage.decomposition_stage_id, stageData);
        stats.decomposition_stages.updated++;
        logger.info(`🔄 Updated decomposition_stage: ${wsNestedTask.name}`);

        if (stats.detailed_report) {
          stats.detailed_report.actions.push({
            action: 'updated', type: 'decomposition_stage',
            id: wsNestedTask.id, name: wsNestedTask.name, timestamp: new Date().toISOString()
          });
        }
      } else {
        stats.decomposition_stages.unchanged++;
        logger.info(`✓ Unchanged decomposition_stage: ${wsNestedTask.name}`);
      }

      stage = existingStage;

    } else {
      // CREATE нового stage
      const newStage = await supabase.createDecompositionStage(stageData);
      stats.decomposition_stages.created++;
      logger.success(`✅ Created decomposition_stage: ${wsNestedTask.name}`);

      // Добавляем в кэш для последующих обращений
      stagesMap.set(externalId, newStage);

      if (stats.detailed_report) {
        stats.detailed_report.actions.push({
          action: 'created', type: 'decomposition_stage',
          id: wsNestedTask.id, name: wsNestedTask.name, timestamp: new Date().toISOString()
        });
      }

      stage = newStage;
    }

    // Синхронизировать статус и % готовности через теги
    if (tagMap && stage) {
      try {
        const fullTaskData = await worksection.getTask(wsNestedTask.id);
        if (fullTaskData && fullTaskData.tags) {
          await syncStageStatusAndProgress(stage, fullTaskData, tagMap, stats, itemsMap, statusIdCache);
        } else {
          logger.warning(`   ⚠️ No tags found for task ${wsNestedTask.id} via get_task`);
          await syncStageStatusAndProgress(stage, wsNestedTask, tagMap, stats, itemsMap, statusIdCache);
        }
      } catch (error) {
        logger.warning(`   ⚠️ Failed to load full task data for ${wsNestedTask.id}: ${error.message}`);
        await syncStageStatusAndProgress(stage, wsNestedTask, tagMap, stats, itemsMap, statusIdCache);
      }
    }

    return stage;

  } catch (error) {
    logger.error(`❌ Error syncing decomposition_stage ${wsNestedTask.name}: ${error.message}`);
    stats.decomposition_stages.errors++;

    if (stats.detailed_report) {
      stats.detailed_report.actions.push({
        action: 'error', type: 'decomposition_stage',
        id: wsNestedTask.id, name: wsNestedTask.name,
        timestamp: new Date().toISOString(), error: error.message
      });
    }

    return null;
  }
}

/**
 * Синхронизация одной decomposition_item (для OS проектов: вложенные задачи 3-го уровня)
 * @param {Object} wsNestedTask - Задача из Worksection
 * @param {Object} stage - decomposition_stage из БД
 * @param {Object} section - section из БД
 * @param {Object} stats - Объект статистики
 * @param {Map} itemsMap - Кэш items (externalId → item)
 */
async function syncSingleDecompositionItem(wsNestedTask, stage, section, stats, itemsMap) {
  try {
    logger.info(`📋 Processing item: ${wsNestedTask.name} (status: ${wsNestedTask.status})`);

    const externalId = String(wsNestedTask.id);

    // Ищем существующую задачу из кэша вместо запроса к БД
    const existingItem = itemsMap.get(externalId);

    const { categoryId, statusId, difficultyId } = await getCachedIds();

    const itemData = {
      decomposition_item_section_id: section.section_id,
      decomposition_item_stage_id: stage.decomposition_stage_id,
      decomposition_item_description: wsNestedTask.name,
      decomposition_item_work_category_id: categoryId,
      decomposition_item_status_id: statusId,
      decomposition_item_difficulty_id: difficultyId,
      decomposition_item_planned_hours: 0,
      decomposition_item_order: 1,
      external_id: externalId,
      external_source: 'worksection'
    };

    if (existingItem) {
      // Обновляем только если изменилось название
      if (existingItem.decomposition_item_description !== wsNestedTask.name) {
        await supabase.updateDecompositionItem(existingItem.decomposition_item_id, itemData);
        stats.decomposition_items.updated++;
        logger.info(`🔄 Updated decomposition_item: ${wsNestedTask.name}`);

        if (stats.detailed_report) {
          stats.detailed_report.actions.push({
            action: 'updated', type: 'decomposition_item',
            id: wsNestedTask.id, name: wsNestedTask.name, timestamp: new Date().toISOString()
          });
        }
      } else {
        stats.decomposition_items.unchanged++;
        logger.info(`✓ Unchanged decomposition_item: ${wsNestedTask.name}`);
      }

    } else {
      const newItem = await supabase.createDecompositionItem(itemData);
      stats.decomposition_items.created++;
      logger.success(`✅ Created decomposition_item: ${wsNestedTask.name}`);

      // Добавляем в кэш для последующих обращений
      if (newItem) itemsMap.set(externalId, newItem);

      if (stats.detailed_report) {
        stats.detailed_report.actions.push({
          action: 'created', type: 'decomposition_item',
          id: wsNestedTask.id, name: wsNestedTask.name, timestamp: new Date().toISOString()
        });
      }
    }

  } catch (error) {
    logger.error(`❌ Error syncing decomposition_item ${wsNestedTask.name}: ${error.message}`);
    stats.decomposition_items.errors++;

    if (stats.detailed_report) {
      stats.detailed_report.actions.push({
        action: 'error', type: 'decomposition_item',
        id: wsNestedTask.id, name: wsNestedTask.name,
        timestamp: new Date().toISOString(), error: error.message
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
