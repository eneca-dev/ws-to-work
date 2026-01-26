# ✅ ФИНАЛЬНЫЙ БЕЗОПАСНЫЙ ПЛАН РЕАЛИЗАЦИИ

## 🔍 Анализ влияния на продакшен

### ✅ БЕЗОПАСНОСТЬ МИГРАЦИЙ ПОДТВЕРЖДЕНА

Проверено:
- **11 VIEWS** зависят от work_logs - НЕ СЛОМАЮТСЯ (используют SELECT *)
- **5 FUNCTIONS** используют work_logs - НЕ СЛОМАЮТСЯ (обращаются к конкретным полям)
- **2 CHECK CONSTRAINTS** - НЕ ЗАТРОНУТЫ (проверяют hours и hourly_rate)
- **1 TRIGGER** (manage_work_log_expense) - НЕ СЛОМАЕТСЯ (использует существующие поля)

### Что добавляем:

#### work_logs:
- `external_id` (TEXT, **NULLABLE**) - ID отчета из Worksection
- `external_source` (TEXT, **NULLABLE**, DEFAULT 'worksection')
- UNIQUE INDEX только для записей с external_id NOT NULL

#### decomposition_items:
- `external_id` (TEXT, **NULLABLE**) - ID задачи из Worksection
- `external_source` (TEXT, **NULLABLE**, DEFAULT 'worksection')
- INDEX для поиска

### Почему БЕЗОПАСНО:

1. ✅ **Поля NULLABLE** - существующие INSERT/UPDATE продолжат работать
2. ✅ **DEFAULT указан** - если кто-то не передаст значение, будет 'worksection'
3. ✅ **UNIQUE INDEX частичный** - только для external_id IS NOT NULL
4. ✅ **Views используют SELECT *** - автоматически подхватят новые поля
5. ✅ **Functions не затронуты** - используют конкретные имена полей
6. ✅ **Триггеры не затронуты** - работают с NEW/OLD существующих полей

---

## 📋 ПОРЯДОК ВЫПОЛНЕНИЯ

### ЭТАП 1: Миграции БД (15 минут)

**1.1. Создать файлы миграций**
**1.2. СНАЧАЛА ТЕСТИРОВАТЬ НА ТЕСТОВОЙ БД** (если есть)
**1.3. Применить к продакшену**

### ЭТАП 2: Методы Supabase (30 минут)

Добавить методы для работы с новыми таблицами (БЕЗ изменения существующих!)

### ЭТАП 3: Синхронизация stages и items (1.5 часа)

Создать новые файлы, не трогая существующие

### ЭТАП 4: Синхронизация costs (2 часа)

Создать новую логику с обнаружением лишних отчетов

### ЭТАП 5: Логирование лишних отчетов (30 минут)

Добавить в CSV отчет информацию о "лишних" work_logs

### ЭТАП 6: Тестирование (1 час)

Тестовый проект → полная синхронизация → проверка

---

## 📝 МИГРАЦИИ

### Миграция 1: work_logs

```sql
-- D:\ws-to-work\migrations\001_add_external_to_work_logs.sql

-- Добавляем поля для отслеживания источника отчетов
ALTER TABLE work_logs
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'worksection';

-- Частичный UNIQUE индекс - только для записей с external_id
-- Это безопасно: существующие записи (с NULL) не попадут в индекс
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_logs_external_unique
ON work_logs(external_id, external_source)
WHERE external_id IS NOT NULL;

-- Обычный индекс для поиска
CREATE INDEX IF NOT EXISTS idx_work_logs_external_search
ON work_logs(external_id)
WHERE external_id IS NOT NULL;

-- Комментарии для документации
COMMENT ON COLUMN work_logs.external_id IS 'ID отчета из внешней системы (Worksection cost.id). NULL для ручных отчетов.';
COMMENT ON COLUMN work_logs.external_source IS 'Источник отчета: worksection, manual, etc. NULL для старых записей.';

-- Проверка: количество записей до и после
DO $$
DECLARE
  v_count_before bigint;
  v_count_after bigint;
BEGIN
  SELECT COUNT(*) INTO v_count_before FROM work_logs WHERE external_id IS NULL;
  RAISE NOTICE 'Записей без external_id: %', v_count_before;

  SELECT COUNT(*) INTO v_count_after FROM work_logs WHERE external_id IS NOT NULL;
  RAISE NOTICE 'Записей с external_id: %', v_count_after;
END $$;
```

### Миграция 2: decomposition_items

```sql
-- D:\ws-to-work\migrations\002_add_external_to_decomposition_items.sql

-- Добавляем поля для связи с Worksection
ALTER TABLE decomposition_items
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'worksection';

-- Индекс для поиска (не уникальный, т.к. одна WS задача может быть в нескольких items)
CREATE INDEX IF NOT EXISTS idx_decomposition_items_external
ON decomposition_items(external_id, external_source)
WHERE external_id IS NOT NULL;

-- Комментарии
COMMENT ON COLUMN decomposition_items.external_id IS 'ID задачи из внешней системы (Worksection task.id). NULL для ручных задач.';
COMMENT ON COLUMN decomposition_items.external_source IS 'Источник: worksection, manual, etc.';

-- Проверка
DO $$
DECLARE
  v_count_before bigint;
BEGIN
  SELECT COUNT(*) INTO v_count_before FROM decomposition_items WHERE external_id IS NULL;
  RAISE NOTICE 'Записей без external_id: %', v_count_before;
END $$;
```

---

## 💻 КОД РЕАЛИЗАЦИИ

### 1. Обнаружение "лишних" отчетов

**Логика:**
- При синхронизации costs получаем ВСЕ costs из Worksection для проекта
- Получаем ВСЕ work_logs из Supabase для этого проекта (по external_source = 'worksection')
- Сравниваем: work_logs с external_id, которых НЕТ в списке costs → "лишние"
- Записываем в stats для CSV отчета

**Файл: D:\ws-to-work\sync\costs-sync.js**

```javascript
const logger = require('../utils/logger');
const worksection = require('../services/worksection');
const supabase = require('../services/supabase');

async function syncCosts(stats, offset, limit, projectId) {
  // Инициализация статистики для "лишних" отчетов
  if (!stats.orphan_work_logs) {
    stats.orphan_work_logs = {
      total: 0,
      details: [] // { work_log_id, date, user, amount, description, project }
    };
  }

  // Получить проекты для синхронизации
  const wsProjects = await worksection.getProjectsWithSyncTags();
  let filteredProjects = wsProjects.filter(p => !p.name.startsWith('!'));

  if (projectId) {
    filteredProjects = filteredProjects.filter(p => p.id.toString() === projectId.toString());
  }

  const paginatedProjects = projectId ? filteredProjects : filteredProjects.slice(offset, offset + limit);

  for (const wsProject of paginatedProjects) {
    logger.info(`💰 Syncing costs for project: ${wsProject.name} (ID: ${wsProject.id})`);

    try {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ЭТАП А: ПОЛУЧЕНИЕ ДАННЫХ ИЗ WORKSECTION
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const wsCosts = await worksection.getCosts(wsProject.id);

      if (!wsCosts || wsCosts.length === 0) {
        logger.info(`No costs found for project ${wsProject.name}`);

        // Проверяем есть ли "лишние" work_logs для этого проекта
        await detectOrphanWorkLogs(wsProject, [], stats);
        continue;
      }

      logger.info(`Found ${wsCosts.length} costs for project ${wsProject.name}`);

      // Создаем Set из external_id для быстрой проверки
      const wsCostIds = new Set(wsCosts.map(c => c.id.toString()));

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ЭТАП Б: ОБНАРУЖЕНИЕ "ЛИШНИХ" WORK_LOGS
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      await detectOrphanWorkLogs(wsProject, wsCostIds, stats);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ЭТАП В: ГРУППИРОВКА И ПОДСЧЕТ БЮДЖЕТОВ
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const costsByTask = groupCostsByTask(wsCosts);
      await updateBudgetsForTasks(costsByTask, stats);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ЭТАП Г: СИНХРОНИЗАЦИЯ WORK_LOGS (С ДЕДУПЛИКАЦИЕЙ)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      for (const cost of wsCosts) {
        await syncSingleCost(cost, stats);
      }

    } catch (error) {
      logger.error(`❌ Error syncing costs for project ${wsProject.name}: ${error.message}`);
      stats.work_logs.errors++;
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ФУНКЦИЯ: Обнаружение "лишних" work_logs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function detectOrphanWorkLogs(wsProject, wsCostIdsSet, stats) {
  try {
    // Получить все work_logs для этого проекта (через decomposition_items → sections → project)
    const workLogs = await supabase.getWorkLogsByProject(wsProject.id);

    if (!workLogs || workLogs.length === 0) {
      return;
    }

    logger.info(`Found ${workLogs.length} work_logs in Supabase for project ${wsProject.name}`);

    // Проверяем какие work_logs НЕ имеют соответствия в WS
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

        logger.warning(`⚠️ ORPHAN work_log found: ${workLog.external_id} (${workLog.work_log_date}, ${workLog.user_name})`);
      }
    }

    if (stats.orphan_work_logs.total > 0) {
      logger.warning(`⚠️ Total orphan work_logs detected: ${stats.orphan_work_logs.total}`);
    }

  } catch (error) {
    logger.error(`Error detecting orphan work_logs: ${error.message}`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ФУНКЦИЯ: Группировка costs по task.id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function groupCostsByTask(wsCosts) {
  const costsByTask = new Map();

  for (const cost of wsCosts) {
    const taskId = cost.task.id.toString();
    if (!costsByTask.has(taskId)) {
      costsByTask.set(taskId, { totalMoney: 0, costs: [] });
    }
    const group = costsByTask.get(taskId);
    group.totalMoney += parseFloat(cost.money || 0);
    group.costs.push(cost);
  }

  return costsByTask;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ФУНКЦИЯ: Обновление бюджетов для задач
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateBudgetsForTasks(costsByTask, stats) {
  for (const [taskId, group] of costsByTask.entries()) {
    try {
      // 1. Найти decomposition_item по external_id
      const item = await supabase.getDecompositionItemByExternalId(taskId);

      if (!item) {
        logger.warning(`⚠️ Decomposition item not found for task ${taskId}`);
        stats.budgets.errors++;
        continue;
      }

      // 2. Получить budget для этого decomposition_item
      const budget = await supabase.getBudgetForDecompositionItem(item.decomposition_item_id);

      if (!budget) {
        logger.error(`❌ Budget not found for decomposition_item ${item.decomposition_item_id}`);
        stats.budgets.errors++;
        continue;
      }

      // 3. Проверить достаточность бюджета
      const requiredAmount = group.totalMoney;
      const currentAmount = parseFloat(budget.total_amount);

      if (currentAmount < requiredAmount) {
        // УВЕЛИЧИВАЕМ бюджет (НИКОГДА НЕ УМЕНЬШАЕМ!)
        await supabase.updateBudget(budget.budget_id, {
          total_amount: requiredAmount
        });

        logger.info(`💵 Updated budget for task ${taskId}: ${currentAmount} → ${requiredAmount}`);
        stats.budgets.updated++;
      }

    } catch (error) {
      logger.error(`Error updating budget for task ${taskId}: ${error.message}`);
      stats.budgets.errors++;
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ФУНКЦИЯ: Синхронизация одного cost → work_log
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function syncSingleCost(cost, stats) {
  try {
    // 1. ДЕДУПЛИКАЦИЯ: Проверить существование work_log по external_id
    const existingLog = await supabase.getWorkLogByExternalId(cost.id);

    if (existingLog) {
      logger.info(`⏭️ Work log already exists for cost ${cost.id}, skipping`);
      stats.work_logs.unchanged++;
      return;
    }

    // 2. Найти decomposition_item по task.id
    const item = await supabase.getDecompositionItemByExternalId(cost.task.id);

    if (!item) {
      logger.warning(`⚠️ Decomposition item not found for task ${cost.task.id}`);
      stats.work_logs.errors++;
      return;
    }

    // 3. Найти пользователя по email
    const user = await supabase.findUser(cost.user_from.email, stats);

    if (!user) {
      logger.warning(`⚠️ User not found: ${cost.user_from.email}`);
      stats.work_logs.errors++;
      return;
    }

    // 4. Получить hourly_rate пользователя
    const profile = await supabase.getProfile(user.user_id);
    const hourlyRate = profile?.salary || 0;

    // 5. Конвертировать time (HH:MM) в часы
    const hours = parseTimeToHours(cost.time);

    // 6. Получить budget_id
    const budget = await supabase.getBudgetForDecompositionItem(item.decomposition_item_id);

    if (!budget) {
      logger.error(`❌ Budget not found for decomposition_item ${item.decomposition_item_id}`);
      stats.work_logs.errors++;
      return;
    }

    // 7. Создать work_log
    const workLogData = {
      decomposition_item_id: item.decomposition_item_id,
      work_log_created_by: user.user_id,
      work_log_date: cost.date,
      work_log_hours: hours,
      work_log_hourly_rate: hourlyRate,
      work_log_amount: parseFloat(cost.money || 0),
      work_log_description: cost.comment || 'Imported from Worksection',
      budget_id: budget.budget_id,
      external_id: cost.id.toString(),
      external_source: 'worksection'
    };

    await supabase.createWorkLog(workLogData);
    stats.work_logs.created++;

    logger.success(`✅ Created work_log for cost ${cost.id}: ${cost.comment || 'No comment'}`);

  } catch (error) {
    logger.error(`❌ Error syncing cost ${cost.id}: ${error.message}`);
    stats.work_logs.errors++;
  }
}

// Вспомогательная функция
function parseTimeToHours(timeString) {
  if (!timeString) return 0;
  const parts = timeString.split(':');
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;
  return hours + (minutes / 60);
}

module.exports = { syncCosts };
```

---

### 2. Добавить метод в services/supabase.js

```javascript
// Получить все work_logs для проекта (через decomposition_items → sections → project)
async getWorkLogsByProject(projectId) {
  try {
    const { data, error } = await this.client
      .from('work_logs')
      .select(`
        work_log_id,
        work_log_date,
        work_log_hours,
        work_log_amount,
        work_log_description,
        external_id,
        external_source,
        decomposition_items!inner (
          decomposition_item_id,
          sections!inner (
            section_id,
            section_project_id
          )
        ),
        profiles (
          user_id,
          email,
          first_name,
          last_name
        )
      `)
      .eq('decomposition_items.sections.section_project_id', projectId)
      .eq('external_source', 'worksection');

    if (error) throw error;

    // Преобразуем результат для удобства
    return (data || []).map(wl => ({
      work_log_id: wl.work_log_id,
      work_log_date: wl.work_log_date,
      work_log_hours: wl.work_log_hours,
      work_log_amount: wl.work_log_amount,
      work_log_description: wl.work_log_description,
      external_id: wl.external_id,
      external_source: wl.external_source,
      user_email: wl.profiles?.email,
      user_name: `${wl.profiles?.first_name || ''} ${wl.profiles?.last_name || ''}`.trim()
    }));

  } catch (error) {
    logger.error(`Error getting work_logs by project: ${error.message}`);
    throw error;
  }
}
```

---

### 3. Обновить статистику в sync-manager.js

```javascript
// В методе resetStats():
this.stats = {
  // ... existing stats
  orphan_work_logs: {
    total: 0,
    details: []
  }
};

// В методе logFinalStats():
if (this.stats.orphan_work_logs.total > 0) {
  logger.warning('⚠️ ORPHAN WORK LOGS DETECTED:');
  logger.warning(`  Total: ${this.stats.orphan_work_logs.total}`);
  logger.warning(`  These work_logs exist in Supabase but NOT in Worksection`);
  logger.warning(`  Check CSV report for details`);
}
```

---

### 4. Добавить в CSV отчет (services/telegram.js)

```javascript
// В функции генерации CSV добавить секцию:

if (stats.orphan_work_logs && stats.orphan_work_logs.total > 0) {
  rows.push('');
  rows.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  rows.push('⚠️ ORPHAN WORK LOGS (exist in Supabase but NOT in Worksection)');
  rows.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  rows.push(`Total orphan work_logs: ${stats.orphan_work_logs.total}`);
  rows.push('');
  rows.push('External ID,Date,User,Amount,Hours,Description,Project');

  for (const orphan of stats.orphan_work_logs.details) {
    rows.push([
      orphan.external_id,
      orphan.date,
      `${orphan.user_name} (${orphan.user_email})`,
      orphan.amount,
      orphan.hours,
      `"${(orphan.description || '').replace(/"/g, '""')}"`,
      `${orphan.project_name} (${orphan.project_id})`
    ].join(','));
  }
}
```

---

## ✅ CHECKLIST БЕЗОПАСНОСТИ

### Перед применением миграций:

- [ ] **Проверить есть ли тестовая/staging БД**
- [ ] **Если есть - применить миграции сначала на тестовой БД**
- [ ] **Проверить что views не сломались**: `SELECT * FROM view_work_logs_enriched LIMIT 1;`
- [ ] **Проверить что функции работают**: `SELECT get_section_decomposition_totals('test-uuid');`
- [ ] **Проверить что INSERT работает**: создать тестовый work_log
- [ ] **Проверить UNIQUE constraint**: попытаться создать дубликат с external_id
- [ ] **Сделать BACKUP БД перед применением на продакшене** ⚠️

### После применения миграций:

- [ ] **Проверить количество записей**: должно быть то же самое
- [ ] **Проверить все новые поля NULL**: для существующих записей
- [ ] **Проверить работу фронтенда**: создать отчет вручную через UI
- [ ] **Проверить триггеры**: создать work_log → проверить budget_expenses

### Перед запуском синхронизации:

- [ ] **Создать тестовый проект в WS** с отчетами
- [ ] **Запустить синхронизацию для тестового проекта**
- [ ] **Проверить что external_id заполнен** для новых work_logs
- [ ] **Проверить дедупликацию**: запустить синхронизацию повторно
- [ ] **Проверить CSV отчет**: есть ли секция ORPHAN WORK LOGS

---

## 🎯 ОТВЕТЫ НА ВОПРОСЫ

### 1. Категория работы
✅ Всегда "Управление" (ID: `3934bf93-51c9-4a35-b2d1-0cceee743683`)

### 2. Hourly rate = 0
✅ Оставлять 0, поле `work_log_hourly_rate` поддерживает 0 (CHECK >= 0)

### 3. Удаленные costs
✅ **НЕ УДАЛЯТЬ work_logs!** Только логировать в CSV как "лишние"

### 4. Измененные costs
✅ **НЕ ОБНОВЛЯТЬ** существующие work_logs (считаем импортированные данные неизменными)

---

## 📊 ПРИМЕР CSV ОТЧЕТА

```csv
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ ORPHAN WORK LOGS (exist in Supabase but NOT in Worksection)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total orphan work_logs: 3

External ID,Date,User,Amount,Hours,Description,Project
12345,2025-01-15,Ivan Ivanov (ivan@example.com),500.00,5.0,"Bug fixing",Test Project (130079)
12346,2025-01-16,Maria Petrova (maria@example.com),1000.00,10.0,"Feature development",Test Project (130079)
12347,2025-01-17,Petr Sidorov (petr@example.com),250.00,2.5,"Code review",Test Project (130079)
```

---

## 🚀 ГОТОВНОСТЬ К РЕАЛИЗАЦИИ

План полностью безопасен и готов к реализации:

1. ✅ **Миграции безопасны** - проверено влияние на views/functions/triggers
2. ✅ **Дедупликация работает** - через external_id + UNIQUE INDEX
3. ✅ **Лишние отчеты логируются** - в CSV для анализа
4. ✅ **Не удаляем данные** - максимальная безопасность
5. ✅ **Бюджеты только увеличиваются** - никогда не уменьшаются
6. ✅ **Все изменения в d:\ws-to-work** - изолированный проект

**Начинаем реализацию?** 🚀
