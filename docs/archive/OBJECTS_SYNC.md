# Синхронизация объектов из задач Worksection

## Описание

Функция `syncObjectsFromWorksection()` синхронизирует объекты (tasks) из Worksection в таблицу `objects` в Supabase. Каждая задача из Worksection становится объектом в системе eneca.work.

## Принцип работы

### 1. Источник данных
- **Worksection**: Задачи (tasks) из проектов с меткой "eneca.work sync"
- **API метод**: `get_tasks` с параметром `id_project`
- **Фильтры**: Только открытые задачи (`status = "active"`) и не начинающиеся с "!"

### 2. Целевая таблица
- **Supabase**: Таблица `objects`
- **Поля для интеграции**: `external_id`, `external_source`, `external_updated_at`

### 3. Маппинг данных

| Worksection Task | Supabase Object | Описание |
|------------------|-----------------|----------|
| `id` | `external_id` | Уникальный ID задачи |
| `name` | `object_name` | Название задачи |
| `text` | `object_description` | Описание задачи |
| `tags` | `object_stage_id` | Привязка к стадии по меткам |
| - | `object_project_id` | ID проекта в Supabase |
| - | `external_source` | "worksection" |
| - | `external_updated_at` | Время синхронизации |

### 4. Логика привязки к стадиям

1. **По меткам задачи**: Если у задачи есть метки, система ищет стадию в Supabase, где `external_id` совпадает с ID метки из Worksection
2. **Стадия с external_id**: Если стадия не найдена по меткам, используется первая стадия проекта с `external_id` (синхронизированная из Worksection)
3. **Любая доступная стадия**: Если стадий с `external_id` нет, используется первая доступная стадия проекта
4. **Пропуск**: Если в проекте нет стадий, задача пропускается

**Примечание**: Логика приоритизирует стадии, синхронизированные из Worksection (с `external_id`), что обеспечивает корректную привязку объектов к правильным стадиям.

## Структура базы данных

### Таблица objects
```sql
-- Основные поля
object_id UUID PRIMARY KEY
object_name TEXT NOT NULL
object_description TEXT
object_stage_id UUID (FK → stages.stage_id)
object_project_id UUID (FK → projects.project_id)
object_responsible UUID (FK → profiles.user_id)
object_start_date TIMESTAMPTZ
object_end_date TIMESTAMPTZ
object_created TIMESTAMPTZ DEFAULT now()
object_updated TIMESTAMPTZ DEFAULT now()

-- Поля интеграции (добавлены миграцией)
external_id TEXT
external_source TEXT DEFAULT 'worksection'
external_updated_at TIMESTAMPTZ
```

## API Endpoint

### POST /api/objects/sync

**Описание**: Запускает синхронизацию объектов из задач Worksection

**Ответ**:
```json
{
  "success": true,
  "data": {
    "created": [
      {
        "object": { /* объект из Supabase */ },
        "task": { /* задача из Worksection */ },
        "project": { /* проект из Worksection */ }
      }
    ],
    "updated": [ /* аналогично */ ],
    "unchanged": [ /* аналогично */ ],
    "errors": [
      {
        "task": { /* задача */ },
        "project": { /* проект */ },
        "error": "текст ошибки"
      }
    ]
  },
  "summary": {
    "created": 5,
    "updated": 2,
    "unchanged": 10,
    "deleted": 3,
    "errors": 0
  }
}
```

## Фильтры синхронизации

### 1. Фильтр по статусу задачи
- **Включаются**: Только открытые задачи (`status = "active"`)
- **Исключаются**: Закрытые задачи (`status = "done"`)
- **Действие**: Закрытые задачи пропускаются при создании, существующие объекты удаляются

### 2. Фильтр по названию задачи
- **Исключаются**: Задачи, начинающиеся с восклицательного знака "!"
- **Причина**: Такие задачи обычно являются служебными или шаблонными
- **Действие**: Задачи с "!" пропускаются при создании, существующие объекты удаляются

### 3. Автоматическая очистка
- **Удаление неактуальных объектов**: Система автоматически удаляет объекты, которые больше не соответствуют критериям фильтрации
- **Логирование**: Все операции удаления подробно логируются с указанием причины

## Алгоритм работы

### 1. Подготовка данных
```javascript
// Получение проектов с sync тегом
const wsProjects = await getProjectsWithSyncTag();

// Получение существующих данных из Supabase
const supabaseProjects = await getProjectsWithExternalId();
const existingStages = await getAllStages();
const existingObjects = await getAllObjects();
```

### 2. Обработка каждого проекта
```javascript
for (const wsProject of wsProjects) {
  // Поиск проекта в Supabase
  const supabaseProject = supabaseProjects.find(
    p => p.external_id === wsProject.id.toString()
  );
  
  // Получение всех задач проекта
  const tasksResponse = await makeWorksectionRequest('get_tasks', {
    id_project: wsProject.id
  });
  
  // Фильтрация задач
  const wsTasks = allTasks.filter(task => {
    const isActive = task.status === 'active';
    const notExclamation = !task.name.startsWith('!');
    return isActive && notExclamation;
  });
  
  // Очистка неактуальных объектов
  await cleanupInvalidObjects(projectObjects, allTasks);
}
```

### 3. Обработка каждой задачи
```javascript
for (const wsTask of wsTasks) {
  // Поиск существующего объекта
  const existingObject = await findObjectByExternalId(wsTask.id.toString());
  
  // Определение стадии
  let targetStageId = findStageByTags(wsTask.tags) || getFirstProjectStage();
  
  // Создание или обновление
  if (existingObject) {
    await updateObject(existingObject.object_id, updateData);
  } else {
    await createObject(objectData);
  }
}
```

## Особенности реализации

### 1. Определение стадии объекта
- Приоритет: метки задачи с текстом "стадия"
- Fallback: первая доступная стадия проекта
- Требование: наличие хотя бы одной стадии в проекте

### 2. Обновление существующих объектов
Объект обновляется если изменились:
- Название (`object_name`)
- Описание (`object_description`) 
- Привязка к стадии (`object_stage_id`)

### 3. Обработка ошибок
- Ошибки на уровне проекта (недоступность API)
- Ошибки на уровне задачи (отсутствие стадий, проблемы создания)
- Детальное логирование всех операций

## Веб-интерфейс

### Кнопка синхронизации
- **Расположение**: Вкладка "Проекты" → "📦 Синхронизировать объекты"
- **Цвет**: Оранжевый (warning)
- **Состояния**: Обычное / Загрузка / Отключено

### Отображение результатов
- Общая статистика синхронизации
- Список созданных объектов
- Список обновленных объектов  
- Список объектов без изменений
- Детали ошибок с указанием задачи и проекта

## Зависимости

### Функции Supabase
- `getAllObjects()` - получение всех объектов
- `createObject()` - создание нового объекта
- `updateObject()` - обновление объекта
- `deleteObject()` - удаление объекта
- `findObjectByExternalId()` - поиск по external_id

### Функции Worksection
- `getProjectsWithSyncTag()` - проекты с меткой sync
- `makeWorksectionRequest('get_tasks')` - получение задач проекта

### Связанные функции
- `getAllStages()` - для определения стадий
- `getProjectsWithExternalId()` - для поиска проектов

## Примеры использования

### 1. Через веб-интерфейс
1. Открыть http://localhost:3001
2. Перейти на вкладку "Проекты"
3. Нажать "📦 Синхронизировать объекты"
4. Наблюдать результаты в логах

### 2. Через API
```bash
curl -X POST http://localhost:3001/api/objects/sync
```

### 3. Программно
```javascript
const { syncObjectsFromWorksection } = require('./functions/projects');

const result = await syncObjectsFromWorksection();
console.log(result.summary); // { created: 5, updated: 2, unchanged: 10, errors: 0 }
```

## Рекомендации

### 1. Порядок синхронизации
1. Сначала синхронизировать проекты
2. Затем синхронизировать стадии  
3. В конце синхронизировать объекты

### 2. Мониторинг
- Следить за логами на предмет ошибок
- Проверять корректность привязки к стадиям
- Контролировать количество созданных объектов

### 3. Обслуживание
- Периодически проверять актуальность external_id
- Очищать объекты удаленных из Worksection задач
- Обновлять маппинг при изменении структуры меток 