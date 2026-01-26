# План синхронизации отчетов (costs) из Worksection в Supabase

## Анализ текущей ситуации

### Что работает сейчас:
- ✅ Синхронизация проектов (WS Project → Supabase projects)
- ✅ Синхронизация задач (WS Task → Supabase objects)
- ✅ Синхронизация подзадач (WS Subtask → Supabase sections)
- ✅ Фильтрация по тегам "eneca.work sync" и "eneca.work sync OS"
- ✅ Пагинация (offset/limit)
- ✅ Синхронизация одного проекта (project_id parameter)

### Что НЕ работает:
- ❌ Синхронизация вложенных задач 3-го уровня (WS child[].child[] → Supabase decomposition_stages)
- ❌ Синхронизация отчетов (WS costs → Supabase work_logs)
- ❌ Нет полей external_id/external_source в таблице decomposition_items

## Структура данных

### Иерархия Worksection → Supabase:
```
WS Project (проект)           → Supabase projects
  └─ WS Task (задача)         → Supabase objects
      └─ WS Subtask           → Supabase sections
          └─ WS Nested task   → Supabase decomposition_stages (НЕ СИНХРОНИЗИРУЕТСЯ!)
              └─ decomposition_items (задачи внутри этапа)
```

### Отчеты могут быть привязаны к любому уровню:
- Отчет на Task → Supabase object (через external_id)
- Отчет на Subtask → Supabase section (через external_id)
- Отчет на Nested task → Supabase decomposition_stage (через external_id, которого пока нет!)

### Структура WS costs (API):
```json
{
  "id": "12345",
  "comment": "Работа над задачей",
  "time": "10:00",
  "money": "100.00",
  "date": "2025-01-21",
  "is_timer": false,
  "user_from": {
    "id": "123",
    "email": "user@example.com",
    "name": "Иван Иванов"
  },
  "task": {
    "id": "67890",
    "name": "Название задачи",
    "status": "active",
    "project": { "id": "111" }
  }
}
```

### Структура Supabase work_logs:
- work_log_id (uuid, PK)
- decomposition_item_id (uuid, FK) - связь с задачей
- user_id (uuid, FK) - кто сделал отчет
- work_log_date (date)
- work_log_hours (numeric)
- work_log_amount (numeric) - финансовая сумма
- work_category_id (uuid, FK) - категория работы
- work_log_description (text)
- external_id (text) - ID отчета из WS
- external_source (text) - 'worksection'

### Структура Supabase budgets:
- budget_id (uuid, PK)
- entity_type (text) - 'project', 'object', 'section', 'decomposition_stage', 'decomposition_item'
- entity_id (uuid) - ID сущности
- total_amount (numeric) - общая сумма бюджета
- **ОГРАНИЧЕНИЕ**: total_amount >= SUM(work_logs.work_log_amount) для всех отчетов

## Проблемы, которые нужно решить

### 1. Отсутствие external_id в decomposition_items
**Проблема**: Невозможно связать WS costs с конкретной задачей в decomposition_items

**Решение**: Добавить поля:
- external_id (text) - ID из Worksection
- external_source (text) - 'worksection'

### 2. Не синхронизируются decomposition_stages
**Проблема**: 3-й уровень вложенности (WS nested tasks) не попадает в Supabase

**Решение**: Создать синхронизацию:
- WS child[].child[] → Supabase decomposition_stages
- Добавить external_id/external_source для отслеживания

### 3. Определение уровня привязки отчета
**Проблема**: Как понять, к какому уровню (object/section/stage) относится отчет?

**Решение**: Использовать API Worksection:
1. Получить costs через `get_costs(id_project=PROJECT_ID)`
2. Для каждого cost получить task.id
3. Проверить в Supabase по external_id:
   - Сначала ищем в objects (task_id = cost.task.id)
   - Если не найден → ищем в sections (subtask_id = cost.task.id)
   - Если не найден → ищем в decomposition_stages (nested_task_id = cost.task.id)
4. Найдя уровень, получаем decomposition_items для этой сущности
5. Создаем work_log для найденного decomposition_item

### 4. Управление бюджетами
**Проблема**: work_log нельзя создать, если budget.total_amount < work_log_amount

**Рекомендуемая стратегия** (проанализировав варианты):

**Вариант А: Инкрементальное увеличение** ❌
- Брать текущий бюджет
- Если не хватает → добавлять недостающую сумму
- **Минус**: Много запросов UPDATE, сложная логика

**Вариант Б: Предварительный подсчет** ✅ РЕКОМЕНДУЕТСЯ
- Перед синхронизацией отчетов:
  1. Получить ВСЕ costs из WS для проекта
  2. Сгруппировать по task.id и просуммировать money
  3. Для каждой задачи проверить текущий бюджет
  4. Если SUM(costs.money) > budget.total_amount:
     - UPDATE budget SET total_amount = SUM(costs.money)
  5. После обновления всех бюджетов → синхронизировать отчеты

**Преимущества варианта Б:**
- Один UPDATE на задачу
- Гарантируем достаточный бюджет перед вставкой work_logs
- Меньше запросов к БД
- Проще отладка и мониторинг

### 5. Создание decomposition_items
**Проблема**: При синхронизации stages/objects/sections не создаются decomposition_items

**Решение**:
- Trigger `trg_create_default_budget_decomposition_item` автоматически создает бюджет при INSERT decomposition_item
- Но нам нужно создавать decomposition_items при синхронизации!
- Добавить логику создания decomposition_items для каждого stage/object/section

## Итоговый план реализации

### Фаза 1: Подготовка БД (Миграции)

**1.1. Добавить external поля в decomposition_items**
```sql
ALTER TABLE decomposition_items
ADD COLUMN external_id TEXT,
ADD COLUMN external_source TEXT DEFAULT 'worksection';

CREATE INDEX idx_decomposition_items_external
ON decomposition_items(external_id, external_source);
```

**1.2. Добавить external поля в decomposition_stages (если нет)**
```sql
-- Проверить, есть ли уже эти поля
ALTER TABLE decomposition_stages
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'worksection';

CREATE INDEX IF NOT EXISTS idx_decomposition_stages_external
ON decomposition_stages(external_id, external_source);
```

### Фаза 2: Синхронизация 3-го уровня (nested tasks → decomposition_stages)

**2.1. Создать файл sync/stage-sync.js**
- Функция `syncDecompositionStages(stats, offset, limit, projectId)`
- Получить tasks с extra=subtasks из WS (уже есть в content-sync.js)
- Для каждого subtask.child[] (nested task):
  1. Найти родительский section в Supabase по subtask.id
  2. Проверить существование decomposition_stage по external_id
  3. Создать или обновить decomposition_stage:
     - stage_name = nested_task.name
     - section_id = parent_section.section_id
     - external_id = nested_task.id
     - external_source = 'worksection'
     - start_date / end_date из nested_task

**2.2. Интегрировать в sync-manager.js**
```javascript
// После Step 3 (sections):
logger.info('📊 Step 4/5: Syncing decomposition stages');
await syncDecompositionStages(this.stats, offset, limit, projectId);
```

### Фаза 3: Создание decomposition_items при синхронизации

**3.1. Модифицировать content-sync.js**
- После создания/обновления object/section:
  1. Проверить существование decomposition_item с external_id = ws_task.id
  2. Если не существует:
     ```javascript
     const itemData = {
       decomposition_stage_id: stage.stage_id, // или default stage
       item_name: ws_task.name,
       external_id: ws_task.id.toString(),
       external_source: 'worksection'
     };
     await supabase.createDecompositionItem(itemData);
     ```

**3.2. Добавить методы в services/supabase.js**
```javascript
async getDecompositionItems() { ... }
async createDecompositionItem(data) { ... }
async updateDecompositionItem(id, data) { ... }
```

### Фаза 4: Синхронизация отчетов (costs → work_logs)

**4.1. Создать services/worksection.js методы**
```javascript
async getCosts(projectId = null, taskId = null) {
  const params = { action: 'get_costs' };
  if (projectId) params.id_project = projectId;
  if (taskId) params.id_task = taskId;
  return this.request(params);
}
```

**4.2. Создать sync/costs-sync.js**

Основная функция: `syncCosts(stats, offset, limit, projectId)`

**Алгоритм:**

```
1. Получить список проектов для синхронизации (с тегами sync)
2. Для каждого проекта:

   A. ПОЛУЧЕНИЕ ДАННЫХ ИЗ WS
   - Вызвать worksection.getCosts(projectId)
   - Получить массив costs с полями: id, comment, time, money, date, user_from, task

   B. ПРЕДВАРИТЕЛЬНЫЙ ПОДСЧЕТ БЮДЖЕТОВ
   - Сгруппировать costs по task.id: Map<taskId, totalMoney>
   - Для каждой уникальной task.id:
     1. Найти в Supabase по external_id (object/section/stage)
     2. Получить decomposition_items для найденной сущности
     3. Для каждого decomposition_item:
        - Получить текущий budget (entity_type='decomposition_item', entity_id=item.id)
        - Вычислить требуемую сумму = SUM(costs.money) для этого task.id
        - Если budget.total_amount < требуемая сумма:
          UPDATE budgets SET total_amount = требуемая сумма

   C. СИНХРОНИЗАЦИЯ ОТЧЕТОВ
   - Для каждого cost из массива:
     1. Проверить существование work_log по external_id = cost.id
     2. Если существует → пропустить (или обновить, если изменились данные)
     3. Если не существует:
        - Найти task в Supabase (object/section/stage) по cost.task.id
        - Получить decomposition_item для этой задачи
        - Найти user по cost.user_from.email (используя findUser)
        - Конвертировать time (HH:MM) в часы (numeric)
        - Получить hourly_rate из profiles.salary для user_id
        - Создать work_log:
          {
            decomposition_item_id: item.id,
            user_id: user.user_id,
            work_log_date: cost.date,
            work_log_hours: parseTime(cost.time), // "10:00" → 10.0
            work_log_amount: parseFloat(cost.money),
            work_category_id: '3934bf93-51c9-4a35-b2d1-0cceee743683', // Управление
            work_log_description: cost.comment || '',
            external_id: cost.id.toString(),
            external_source: 'worksection'
          }
```

**Функция определения уровня задачи:**
```javascript
async findTaskLevel(taskId, supabaseClient) {
  // 1. Проверяем objects
  const object = await supabaseClient
    .from('objects')
    .select('object_id')
    .eq('external_id', taskId)
    .eq('external_source', 'worksection')
    .single();
  if (object) return { type: 'object', id: object.object_id };

  // 2. Проверяем sections
  const section = await supabaseClient
    .from('sections')
    .select('section_id')
    .eq('external_id', taskId)
    .eq('external_source', 'worksection')
    .single();
  if (section) return { type: 'section', id: section.section_id };

  // 3. Проверяем decomposition_stages
  const stage = await supabaseClient
    .from('decomposition_stages')
    .select('stage_id')
    .eq('external_id', taskId)
    .eq('external_source', 'worksection')
    .single();
  if (stage) return { type: 'decomposition_stage', id: stage.stage_id };

  return null;
}
```

**Функция получения decomposition_items:**
```javascript
async getDecompositionItemsForEntity(entityType, entityId) {
  // Найти все decomposition_items для object/section/stage
  if (entityType === 'object') {
    // decomposition_items → decomposition_stages → sections → objects
    return await supabaseClient
      .from('decomposition_items')
      .select('*, decomposition_stages!inner(section_id, sections!inner(object_id))')
      .eq('decomposition_stages.sections.object_id', entityId);
  }

  if (entityType === 'section') {
    return await supabaseClient
      .from('decomposition_items')
      .select('*, decomposition_stages!inner(section_id)')
      .eq('decomposition_stages.section_id', entityId);
  }

  if (entityType === 'decomposition_stage') {
    return await supabaseClient
      .from('decomposition_items')
      .select('*')
      .eq('decomposition_stage_id', entityId);
  }
}
```

**4.3. Интегрировать в sync-manager.js**
```javascript
// После Step 4 (decomposition stages):
logger.info('💰 Step 5/5: Syncing costs (work_logs)');
await syncCosts(this.stats, offset, limit, projectId);
```

### Фаза 5: Тестирование

**5.1. Создать тестовый проект в Worksection**
- Проект с тегом "eneca.work sync"
- 1 задача (Task)
  - 1 подзадача (Subtask)
    - 1 вложенная задача (Nested task)
- Добавить отчеты на всех трех уровнях

**5.2. Запустить синхронизацию**
```bash
curl -X POST http://localhost:3001/api/sync -H "Content-Type: application/json" -d '{"project_id":"TEST_PROJECT_ID"}'
```

**5.3. Проверить результаты**
- Проверить decomposition_stages (должна появиться nested task)
- Проверить decomposition_items (должны быть созданы для всех уровней)
- Проверить budgets (должны быть обновлены)
- Проверить work_logs (должны быть созданы все отчеты)

### Фаза 6: Мониторинг и статистика

**6.1. Расширить stats в sync-manager.js**
```javascript
this.stats = {
  // ... existing stats
  decomposition_stages: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
  decomposition_items: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
  work_logs: { created: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 },
  budgets: { updated: 0, insufficient: 0, errors: 0 }
};
```

**6.2. Добавить логирование**
- Количество обработанных costs
- Количество обновленных бюджетов
- Количество созданных work_logs
- Ошибки при поиске пользователей
- Ошибки при определении уровня задачи

## Порядок выполнения

1. **Миграция БД** (Фаза 1)
2. **Синхронизация decomposition_stages** (Фаза 2)
3. **Создание decomposition_items** (Фаза 3)
4. **Синхронизация costs** (Фаза 4)
5. **Тестирование** (Фаза 5)
6. **Мониторинг** (Фаза 6)

## Особенности реализации

### Обработка ошибок
- Если пользователь не найден → пропустить work_log, записать в stats.work_logs.errors
- Если task.id не найден в Supabase → пропустить, записать ошибку
- Если бюджет не может быть обновлен → записать в stats.budgets.errors

### Дубликаты
- work_logs проверяются по external_id перед созданием
- Если work_log уже существует → stats.work_logs.unchanged++

### Пагинация
- Costs синхронизируются для проектов из текущей страницы (offset/limit)
- Если указан projectId → синхронизируются costs только этого проекта

### Категория работы
- По умолчанию: work_category_id = '3934bf93-51c9-4a35-b2d1-0cceee743683' (Управление)
- В будущем можно добавить маппинг категорий из WS

### Ставка (hourly_rate)
- Берется из profiles.salary для user_id
- Если не указана → work_log_amount = cost.money (из WS)

## Риски и ограничения

1. **Большой объем данных**: Если costs очень много → синхронизация может быть долгой
   - Решение: Пагинация, батчинг

2. **Бюджеты**: Если пользователь вручную изменил бюджет в eneca.work → синхронизация может перезаписать
   - Решение: Только увеличивать бюджет, никогда не уменьшать

3. **Удаление**: Если cost удален в WS → он останется в work_logs
   - Решение: Добавить флаг is_deleted или периодическую очистку

4. **Производительность**: Много JOIN запросов для определения уровня задачи
   - Решение: Кэшировать маппинг external_id → entity_id

## Финальная структура файлов

```
D:\ws-to-work/
├── sync/
│   ├── sync-manager.js        # Оркестратор (добавить steps 4-5)
│   ├── project-sync.js        # ✅ Уже есть
│   ├── content-sync.js        # ✅ Уже есть (модифицировать)
│   ├── stage-sync.js          # 🆕 СОЗДАТЬ (decomposition_stages)
│   └── costs-sync.js          # 🆕 СОЗДАТЬ (work_logs)
├── services/
│   ├── worksection.js         # Добавить getCosts()
│   └── supabase.js            # Добавить методы для items/logs/budgets
├── migrations/
│   └── add_external_to_decomposition_items.sql  # 🆕 СОЗДАТЬ
└── SYNC_COSTS_PLAN.md         # Этот файл
```

## Выводы

1. **Стратегия бюджетов**: Предварительный подсчет (вариант Б) - оптимален
2. **Определение уровня**: Последовательный поиск в objects → sections → stages
3. **Создание decomposition_items**: Автоматически при синхронизации задач
4. **Порядок синхронизации**: Projects → Objects → Sections → Stages → Items → Costs
5. **Все изменения в проекте**: d:\ws-to-work

План готов к реализации! 🚀
