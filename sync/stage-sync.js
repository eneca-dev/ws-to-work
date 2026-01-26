const worksection = require('../services/worksection');
const supabase = require('../services/supabase');
const logger = require('../utils/logger');

// Кеш для константных ID (category, status, difficulty)
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
  return { categoryId: cachedCategoryId, statusId: cachedStatusId, difficultyId: cachedDifficultyId };
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
      stats.decomposition_stages = { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 };
    }
    if (!stats.decomposition_items) {
      stats.decomposition_items = { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 };
    }

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
            const supaSection = await supabase.getSectionByExternalId(wsTask.id.toString(), 'worksection-os');

            if (!supaSection) {
              logger.warning(`⚠️ Section not found for task ${wsTask.id}: ${wsTask.name}`);
              stats.decomposition_stages.skipped++;
              continue;
            }

            // Обрабатываем подзадачи как decomposition_stages
            for (const wsSubtask of wsTask.child) {
              const createdStage = await syncSingleDecompositionStage(wsSubtask, supaSection, stats);

              // Для OS проектов: если у подзадачи есть вложенные задачи 3-го уровня - синхронизируем их как decomposition_items
              if (createdStage && wsSubtask.child && wsSubtask.child.length > 0) {
                logger.info(`📋 Found ${wsSubtask.child.length} nested tasks in stage "${wsSubtask.name}", syncing as decomposition_items`);
                for (const wsNestedTask of wsSubtask.child) {
                  await syncSingleDecompositionItem(wsNestedTask, createdStage, supaSection, stats);
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
              const supaSection = await supabase.getSectionByExternalId(wsSubtask.id.toString());

              if (!supaSection) {
                logger.warning(`⚠️ Section not found for subtask ${wsSubtask.id}: ${wsSubtask.name}`);
                stats.decomposition_stages.skipped++;
                continue;
              }

              // Обрабатываем вложенные задачи 3-го уровня (Nested task → decomposition_stage)
              for (const wsNestedTask of wsSubtask.child) {
                await syncSingleDecompositionStage(wsNestedTask, supaSection, stats);
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
async function syncSingleDecompositionStage(wsNestedTask, supaSection, stats) {
  try {
    // Синхронизируем все статусы (active, done, hold, canceled)
    logger.info(`📊 Processing stage: ${wsNestedTask.name} (status: ${wsNestedTask.status})`);

    const externalId = wsNestedTask.id.toString();

    // Проверяем существование decomposition_stage
    const existingStage = await supabase.getDecompositionStageByExternalId(externalId);

    const stageData = {
      decomposition_stage_section_id: supaSection.section_id,
      decomposition_stage_name: wsNestedTask.name,
      decomposition_stage_description: wsNestedTask.text || null,
      decomposition_stage_start: wsNestedTask.date_start || null,
      decomposition_stage_finish: wsNestedTask.date_end || null,
      external_id: externalId,
      external_source: 'worksection'
    };

    if (existingStage) {
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
      // CREATE нового stage
      const newStage = await supabase.createDecompositionStage(stageData);
      stats.decomposition_stages.created++;
      logger.success(`✅ Created decomposition_stage: ${wsNestedTask.name}`);

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

      // ℹ️ decomposition_item создается автоматически при синхронизации отчетов (costs-sync.js)
      return newStage;
    }

    return existingStage;

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
async function syncSingleDecompositionItem(wsNestedTask, stage, section, stats) {
  try {
    // Синхронизируем все статусы (active, done, hold, canceled)
    logger.info(`📋 Processing item: ${wsNestedTask.name} (status: ${wsNestedTask.status})`);

    const externalId = wsNestedTask.id.toString();

    // Проверяем существование decomposition_item
    const existingItem = await supabase.getDecompositionItemByExternalId(externalId);

    // Получаем кешированные ID констант
    const { categoryId, statusId, difficultyId } = await getCachedIds();

    // Ищем ответственного
    let responsibleId = null;
    if (wsNestedTask.user_to?.email) {
      const user = await supabase.findUser(wsNestedTask.user_to.email, stats);
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
      // CREATE нового item
      const newItem = await supabase.createDecompositionItem(itemData);
      stats.decomposition_items.created++;
      logger.success(`✅ Created decomposition_item: ${wsNestedTask.name}`);

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

// ℹ️ Для OS проектов decomposition_items создаются из вложенных задач 3-го уровня
// ℹ️ Для Standard проектов decomposition_items создаются автоматически в costs-sync.js
// ℹ️ при синхронизации отчетов (только для задач, на которые есть отчеты)

module.exports = { syncDecompositionStages };
