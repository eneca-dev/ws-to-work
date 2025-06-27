# Синхронизация разделов из подзадач Worksection

## Описание

Функциональность автоматической синхронизации разделов проектов из подзадач Worksection в базу данных Supabase.

## Принцип работы

1. **Источник данных**: Подзадачи (subtasks) задач в проектах Worksection с меткой "eneca.work sync"
2. **Целевая таблица**: `sections` в Supabase
3. **Логика синхронизации**: Односторонняя синхронизация Worksection → eneca.work

## Иерархия синхронизации

```
Worksection                     eneca.work
--------------------------------------------
Company         →               Manager
Project         →               Project  
Task Level 1    →               Stage
Task Level 2    →               Object
Subtask         →               Section   ← НОВОЕ
```

## Маппинг данных

| Worksection Subtask | Supabase Section | Описание |
|---------------------|------------------|----------|
| `id` | `external_id` | Уникальный ID подзадачи |
| `name` | `section_name` | Название подзадачи |
| `text` | `section_description` | Описание подзадачи |
| `user_to.email` | `section_responsible` | Поиск ответственного по email |
| `task_id` | `section_object_id` | Привязка к объекту по parent task |
| - | `section_project_id` | ID проекта из родительского объекта |
| `date_end` | `section_end_date` | Дата окончания |
| - | `external_source` | "worksection" |
| Время синхронизации | `external_updated_at` | Время последнего обновления |

## Условия синхронизации

- Проект должен иметь метку "eneca.work sync"
- Подзадача должна иметь статус "active"
- Подзадача не должна начинаться с символа "!"
- Родительская задача должна существовать как объект в Supabase
- Родительский объект должен иметь `external_id`

## Структура базы данных

```sql
-- Поля интеграции в таблице sections
ALTER TABLE sections 
ADD COLUMN external_id TEXT,
ADD COLUMN external_source TEXT DEFAULT 'worksection',
ADD COLUMN external_updated_at TIMESTAMPTZ;

-- Индекс для быстрого поиска
CREATE INDEX idx_sections_external_id ON sections(external_id);
```

## API Endpoints

### POST /api/sections/sync
Запускает синхронизацию разделов из подзадач Worksection.

**Ответ:**
```json
{
  "success": true,
  "summary": {
    "created": 12,
    "updated": 3,
    "unchanged": 25,
    "errors": 2
  },
  "data": {
    "created": [...],
    "updated": [...],
    "unchanged": [...],
    "errors": [...]
  }
}
```

## Алгоритм работы

### 1. Подготовка данных
```javascript
// Получение проектов с sync тегом
const wsProjects = await getProjectsWithSyncTag();

// Получение существующих данных из Supabase
const supabaseProjects = await getProjectsWithExternalId();
const existingObjects = await getAllObjects();
const existingSections = await getAllSections();
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
  
  // Обработка каждой задачи для получения подзадач
  for (const wsTask of tasks) {
    const subtasksResponse = await makeWorksectionRequest('get_subtasks', {
      id_task: wsTask.id
    });
    
    // Обработка каждой подзадачи
    for (const wsSubtask of subtasks) {
      await processSingleSubtask(wsSubtask, wsTask, wsProject, ...);
    }
  }
}
```

### 3. Обработка одной подзадачи
```javascript
async function processSingleSubtask(wsSubtask, wsTask, wsProject, ...) {
  // 1. Фильтры
  if (wsSubtask.status !== 'active') return;
  if (wsSubtask.name.startsWith('!')) return;
  
  // 2. Поиск родительского объекта
  const parentObject = existingObjects.find(
    obj => obj.external_id === wsTask.id.toString()
  );
  
  // 3. Поиск ответственного пользователя
  const responsible = await findUserByEmail(wsSubtask.user_to.email);
  
  // 4. Создание или обновление раздела
  const sectionData = {
    section_name: wsSubtask.name,
    section_description: wsSubtask.text,
    section_responsible: responsible?.user_id,
    section_object_id: parentObject.object_id,
    section_project_id: parentObject.object_project_id,
    section_end_date: wsSubtask.date_end,
    external_id: wsSubtask.id.toString(),
    external_source: 'worksection',
    external_updated_at: new Date()
  };
  
  if (existingSection) {
    await updateSection(existingSection.section_id, sectionData);
  } else {
    await createSection(sectionData);
  }
}
```

## Веб-интерфейс

### Кнопка синхронизации
- **Расположение**: Вкладка "Проекты" → "📑 Синхронизировать разделы"
- **Цвет**: Синий (info)
- **Состояния**: Обычное / Загрузка / Отключено

### Отображение результатов
- Общая статистика синхронизации
- Список созданных разделов
- Список обновленных разделов  
- Список разделов без изменений
- Детали ошибок с указанием подзадачи, задачи и проекта

## Функции

### `syncSectionsFromWorksection()`
Основная функция синхронизации разделов.

**Возвращает:**
- `success`: boolean - статус выполнения
- `summary`: объект со статистикой
- `data`: детальная информация по операциям

### Вспомогательные функции
- `getAllSections()` - получение всех разделов из БД
- `createSection(sectionData)` - создание нового раздела
- `updateSection(sectionId, updateData)` - обновление раздела
- `findSectionByExternalId(externalId)` - поиск раздела по external_id
- `deleteSection(sectionId)` - удаление раздела
- `processSingleSubtask()` - обработка одной подзадачи
- `hasChanges()` - проверка изменений в данных раздела

## Зависимости

### Функции Supabase
- `getAllSections()` - получение всех разделов
- `createSection()` - создание нового раздела
- `updateSection()` - обновление раздела
- `deleteSection()` - удаление раздела
- `findSectionByExternalId()` - поиск по external_id
- `findUserByEmail()` - поиск пользователя по email

### Функции Worksection
- `getProjectsWithSyncTag()` - проекты с меткой sync
- `makeWorksectionRequest('get_tasks')` - получение задач проекта
- `makeWorksectionRequest('get_subtasks')` - получение подзадач задачи

### Связанные функции
- `getAllObjects()` - для поиска родительских объектов
- `getProjectsWithExternalId()` - для поиска проектов

## Логирование

Все операции логируются с детальной информацией:
- 🔍 Обработка проектов
- 📋 Получение задач и подзадач
- 📑 Найденные подзадачи
- 🆕 Создание новых разделов
- 🔄 Обновление существующих
- ✅ Разделы без изменений
- ❌ Ошибки с указанием причин

## Примеры использования

### 1. Через веб-интерфейс
1. Открыть http://localhost:3001
2. Перейти на вкладку "Проекты"
3. Нажать "📑 Синхронизировать разделы"
4. Наблюдать результаты в логах

### 2. Через API
```bash
curl -X POST http://localhost:3001/api/sections/sync
```

### 3. Программно
```javascript
const { syncSectionsFromWorksection } = require('./functions/projects');

const result = await syncSectionsFromWorksection();
console.log(result.summary); // { created: 12, updated: 3, unchanged: 25, errors: 2 }
```

## Рекомендации

### 1. Порядок синхронизации
1. Сначала синхронизировать проекты
2. Затем синхронизировать стадии из меток
3. Потом синхронизировать объекты из задач
4. **В конце синхронизировать разделы из подзадач** ← НОВОЕ

### 2. Мониторинг
- Следить за логами на предмет ошибок
- Проверять корректность привязки к объектам
- Контролировать корректность поиска ответственных пользователей

### 3. Обработка ошибок
- Подзадачи без родительских объектов пропускаются
- Ошибки поиска пользователей логируются, но не блокируют создание раздела
- Служебные подзадачи (начинающиеся с "!") игнорируются

## Тестирование

Функциональность протестирована на реальных данных:
- Создание новых разделов из подзадач
- Обнаружение существующих разделов
- Корректная обработка проектов без подзадач
- Правильное логирование всех операций
- Корректная привязка к родительским объектам
- Поиск пользователей по email

## Ограничения

1. **Зависимость от объектов**: Разделы создаются только если родительская задача уже синхронизирована как объект
2. **Поиск пользователей**: Пользователи ищутся только по email, должны существовать в Supabase
3. **Фильтры**: Неактивные и служебные подзадачи игнорируются
4. **Односторонняя синхронизация**: Изменения в eneca.work не передаются обратно в Worksection 