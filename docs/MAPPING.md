# Маппинг параметров Worksection → eneca.work

## Общая схема синхронизации

**Источник**: Worksection API  
**Цель**: Supabase БД приложения eneca.work  
**Тип синхронизации**: Односторонняя (WS → eneca.work)  
**Фильтр**: Только проекты с меткой "eneca.work sync"

## Маппинг объектов

### 1. Проекты (Projects)

**WS → eneca.work**
- `Worksection Project` → `Manager/Project` (иерархия)

| Worksection | eneca.work | Тип | Примечание |
|-------------|------------|-----|------------|
| `id` | `external_id` | string | ID проекта в WS |
| `name` | `name` | string | Название проекта |
| `description` | `description` | text | Описание проекта |
| `status` | `status` | string | Статус проекта |
| `created_date` | `created_at` | timestamp | Дата создания |
| `updated_date` | `updated_at` | timestamp | Дата обновления |
| `company` | `department_id` | uuid | Привязка к отделу |
| `tags` | `metadata` | jsonb | Метки проекта |

### 2. Задачи (Tasks)

**WS → eneca.work**
- `Worksection Task` → `Stage/Object/Section` (иерархия)

| Worksection | eneca.work | Тип | Примечание |
|-------------|------------|-----|------------|
| `id` | `external_id` | string | ID задачи в WS |
| `name` | `name` | string | Название задачи |
| `text` | `description` | text | Описание задачи |
| `project_id` | `parent_id` | uuid | Связь с проектом |
| `status` | `status` | string | Статус задачи |
| `priority` | `priority` | integer | Приоритет (1-5) |
| `created_date` | `created_at` | timestamp | Дата создания |
| `updated_date` | `updated_at` | timestamp | Дата обновления |
| `user_to` | `responsible_id` | uuid | Ответственный |
| `budget` | `budget` | decimal | Бюджет задачи |

### 3. Пользователи (Users)

**WS → eneca.work**
- `Worksection User` → `Employee`

| Worksection | eneca.work | Тип | Примечание |
|-------------|------------|-----|------------|
| `id` | `external_id` | string | ID пользователя в WS |
| `name` | `name` | string | ФИО пользователя |
| `email` | `email` | string | Email пользователя |
| `avatar` | `avatar_url` | string | URL аватара |
| `status` | `status` | string | Активность |

## Правила синхронизации

### Фильтрация проектов
- ✅ Синхронизируются только проекты с меткой **"eneca.work sync"**
- ❌ Проекты без метки игнорируются
- 🔄 Обновление при изменении меток

### Иерархия данных
```
Manager (WS Company)
└── Project (WS Project)
    └── Stage (WS Task Level 1)
        └── Object (WS Task Level 2)
            └── Section (WS Task Level 3)
```

### Обработка конфликтов
- **Новые записи**: Создаются с `external_id` из WS
- **Существующие записи**: Обновляются по `external_id`
- **Удаленные в WS**: Помечаются как неактивные

### Статусы синхронизации
- `pending` - Ожидает синхронизации
- `in_progress` - В процессе синхронизации  
- `completed` - Синхронизация завершена
- `error` - Ошибка синхронизации

## API методы Worksection

### Основные endpoints
- `get_projects` - Получение всех проектов
- `get_tasks` - Получение задач проекта
- `get_users` - Получение пользователей
- `get_project_users` - Участники проекта

### Параметры фильтрации
```javascript
// Получение проектов с тегами
const projects = await makeWorksectionRequest('get_projects', {
    filter: 'all', // all, active, archived
    include_tags: true
});

// Получение задач проекта
const tasks = await makeWorksectionRequest('get_tasks', {
    project_id: projectId,
    filter: 'all',
    include_users: true
});
```

## Структура БД eneca.work

### Таблицы для синхронизации

```sql
-- Менеджеры (из Company WS)
CREATE TABLE managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    external_id VARCHAR UNIQUE, -- ID из WS
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Проекты (из Projects WS)  
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_id UUID REFERENCES managers(id),
    name VARCHAR NOT NULL,
    description TEXT,
    external_id VARCHAR UNIQUE, -- ID из WS
    status VARCHAR,
    metadata JSONB, -- теги и доп. данные
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Этапы (из Tasks WS Level 1)
CREATE TABLE stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    name VARCHAR NOT NULL,
    external_id VARCHAR UNIQUE, -- ID из WS
    status VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Лог синхронизации

### Отслеживание изменений
```javascript
const syncLog = {
    timestamp: new Date().toISOString(),
    type: 'project_sync', // project_sync, task_sync, user_sync
    source_id: 'ws_project_123',
    target_id: 'uuid-456',
    action: 'update', // create, update, delete
    status: 'success', // success, error
    changes: {
        name: { old: 'Старое название', new: 'Новое название' }
    },
    error_message: null
};
```

## Примеры использования

### Полная синхронизация
```javascript
const result = await syncProjectsToDatabase();
console.log(`Синхронизировано: ${result.synchronized}/${result.total}`);
```

### Получение sync проектов
```javascript
const projects = await getProjectsWithSyncTag();
projects.data.forEach(project => {
    console.log(`Проект: ${project.name} (${project.id})`);
});
``` 