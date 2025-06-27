# Документация модуля синхронизации ws-to-work

## 📋 Обзор

Модуль `ws-to-work-integration` обеспечивает одностороннюю синхронизацию данных из Worksection в eneca.work через Supabase PostgreSQL. Работает как отдельное Node.js приложение с веб-интерфейсом управления.

## 🏗️ Архитектура системы

### Основные компоненты:
- **Express.js сервер** - API endpoints для синхронизации
- **Веб-интерфейс** - управление и мониторинг синхронизации  
- **Функции синхронизации** - бизнес-логика обработки данных
- **Supabase клиент** - взаимодействие с базой данных

### Структура файлов:
```
ws-to-work-integration/
├── src/
│   └── app.js                 # Express сервер и API routes
├── functions/
│   ├── projects.js            # Основная логика синхронизации
│   └── supabase-client.js     # Клиент для работы с Supabase
├── public/
│   └── index.html             # Веб-интерфейс управления
├── docs/
│   ├── MAPPING.md             # Схема маппинга данных
│   ├── STAGES_SYNC.md         # Документация синхронизации стадий
│   ├── OBJECTS_SYNC.md        # Документация синхронизации объектов
│   └── SECTIONS_SYNC.md       # Документация синхронизации разделов
└── package.json               # Зависимости и скрипты
```

## 🔄 Типы синхронизации

### 1. 📁 Синхронизация проектов
**Источник**: Worksection Projects → **Цель**: Supabase Managers/Projects

**Кнопка**: `🏢 Синхронизировать проекты`  
**API**: `POST /api/projects/sync`  
**Функция**: `syncProjectsToSupabase()`

**Синхронизируемые поля**:
```javascript
{
    // Managers (компании)
    manager_name: project.company,
    manager_description: "Импортировано из Worksection",
    external_id: project.company_id,
    external_source: "worksection"
    
    // Projects
    project_name: project.name,
    project_description: project.description,
    project_status: mapWorksectionStatus(project.status),
    project_manager: user_id, // по email менеджера
    external_id: project.id,
    external_source: "worksection"
}
```

### 2. 🎯 Синхронизация стадий  
**Источник**: Worksection Tasks (level 1) → **Цель**: Supabase Stages

**Кнопка**: `🎯 Синхронизировать стадии`  
**API**: `POST /api/stages/sync`  
**Функция**: `syncStagesFromWorksection()`

**Фильтры**:
- Только задачи из проектов с меткой "eneca.work sync"
- Исключаются задачи, начинающиеся с "!"
- Только активные задачи (status = 'active')

**Синхронизируемые поля**:
```javascript
{
    stage_name: task.name,
    stage_description: task.text,
    stage_responsible: user_id, // по email ответственного
    stage_project_id: project_id,
    stage_start_date: task.date_start,
    stage_end_date: task.date_end,
    external_id: task.id,
    external_source: "worksection"
}
```

### 3. 📦 Синхронизация объектов
**Источник**: Worksection Tasks (level 2) → **Цель**: Supabase Objects

**Кнопка**: `📦 Синхронизировать объекты`  
**API**: `POST /api/objects/sync`  
**Функция**: `syncObjectsFromWorksection()`

**Логика**: Задачи второго уровня (подзадачи задач-стадий) становятся объектами

**Синхронизируемые поля**:
```javascript
{
    object_name: subtask.name,
    object_description: subtask.text,
    object_responsible: user_id,
    object_stage_id: stage_id, // родительская стадия
    object_project_id: project_id,
    object_start_date: subtask.date_start,
    object_end_date: subtask.date_end,
    external_id: subtask.id,
    external_source: "worksection"
}
```

### 4. 📑 Синхронизация разделов
**Источник**: Worksection Subtasks (level 3) → **Цель**: Supabase Sections

**Кнопка**: `📑 Синхронизировать разделы`  
**API**: `POST /api/sections/sync`  
**Функция**: `syncSectionsFromWorksection()`

**Логика**: Подзадачи объектов (третий уровень) становятся разделами

**Синхронизируемые поля**:
```javascript
{
    section_name: subtask.name,
    section_description: subtask.text,
    section_responsible: user_id,
    section_object_id: object_id, // родительский объект
    section_project_id: project_id,
    section_type: "work",
    section_start_date: subtask.date_start,
    section_end_date: subtask.date_end,
    external_id: subtask.id,
    external_source: "worksection"
}
```

## 🎛️ Веб-интерфейс управления

### Основные кнопки:
1. **🏢 Синхронизировать проекты** - синхронизация проектов и менеджеров
2. **🎯 Синхронизировать стадии** - синхронизация задач как стадий
3. **📦 Синхронизировать объекты** - синхронизация подзадач как объектов  
4. **📑 Синхронизировать разделы** - синхронизация подзадач объектов как разделов
5. **🔄 Обновить список** - обновление списка проектов Worksection
6. **📊 Показать проекты Supabase** - просмотр синхронизированных проектов

### Вкладки интерфейса:
- **📁 Проекты** - управление проектами и их синхронизацией
- **📊 Supabase** - просмотр данных в базе данных

### Система логирования:
- **INFO** (синий) - информационные сообщения
- **SUCCESS** (зеленый) - успешные операции  
- **WARNING** (оранжевый) - предупреждения
- **ERROR** (красный) - ошибки

## 🗄️ Структура базы данных

### Поля интеграции (добавляются ко всем таблицам):
```sql
external_id TEXT                    -- ID из Worksection
external_source TEXT DEFAULT 'worksection'  -- Источник данных
external_updated_at TIMESTAMPTZ     -- Время последней синхронизации
```

### Таблицы синхронизации:
1. **managers** - компании из Worksection
2. **projects** - проекты  
3. **stages** - задачи первого уровня
4. **objects** - задачи второго уровня (подзадачи стадий)
5. **sections** - задачи третьего уровня (подзадачи объектов)

## 🔧 API Endpoints

### Синхронизация:
- `POST /api/projects/sync` - синхронизация проектов
- `POST /api/stages/sync` - синхронизация стадий  
- `POST /api/objects/sync` - синхронизация объектов
- `POST /api/sections/sync` - синхронизация разделов

### Получение данных:
- `GET /api/projects/worksection` - проекты из Worksection
- `GET /api/projects/supabase` - проекты из Supabase
- `GET /api/projects/tags` - метки проектов
- `POST /api/projects/tags/create` - создание метки sync

### Формат ответа API:
```javascript
{
    success: boolean,
    data: {
        created: [...],    // Созданные записи
        updated: [...],    // Обновленные записи  
        unchanged: [...],  // Неизмененные записи
        deleted: [...],    // Удаленные записи
        errors: [...]      // Ошибки
    },
    summary: {
        created: number,
        updated: number,
        unchanged: number,
        deleted: number,
        errors: number
    }
}
```

## 🔍 Алгоритм синхронизации

### Общий принцип:
1. **Фильтрация** - отбор данных по критериям
2. **Маппинг** - преобразование структуры данных
3. **Сравнение** - проверка изменений с существующими данными
4. **Операции** - создание/обновление/пропуск записей
5. **Логирование** - запись результатов операций

### Фильтры синхронизации:
- ✅ Только проекты с меткой "eneca.work sync"
- ✅ Только активные задачи (status = 'active')  
- ❌ Исключение служебных задач (начинающихся с "!")
- ❌ Исключение неактивных/завершенных задач

### Обработка конфликтов:
- **Приоритет Worksection** - данные из WS перезаписывают локальные
- **Проверка изменений** - обновление только при реальных изменениях
- **Сохранение связей** - поддержание иерархии Manager→Project→Stage→Object→Section

## 📈 Мониторинг и отладка

### Логи синхронизации:
```javascript
// Примеры логов
"🚀 Начало синхронизации проектов..."
"✅ Найден проект с sync тегом: Название проекта"  
"🆕 Создан новый проект: Название"
"🔄 Обновлен проект: Название"
"✅ Проект актуален: Название"
"❌ Ошибка создания проекта: детали ошибки"
"📊 Статистика: создано X, обновлено Y, без изменений Z"
```

### Статистика операций:
- **Создано** - новые записи
- **Обновлено** - измененные записи
- **Без изменений** - актуальные записи  
- **Ошибки** - проблемные записи

## ⚙️ Конфигурация

### Переменные окружения (.env):
```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Worksection  
WORKSECTION_DOMAIN=your-domain.worksection.com
WORKSECTION_EMAIL=your-email@domain.com
WORKSECTION_PASSWORD=your-password
WORKSECTION_HASH=your-api-hash

# Сервер
PORT=3001
```

### Запуск приложения:
```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Запуск в продакшн режиме  
npm start
```

## 🚨 Ограничения и особенности

### Текущие ограничения:
1. **Односторонняя синхронизация** - только Worksection → eneca.work
2. **Ручной запуск** - автоматическая синхронизация не реализована
3. **Зависимость от меток** - только проекты с "eneca.work sync"
4. **Жесткая иерархия** - строгое соответствие уровней задач

### Особенности работы:
- **Идемпотентность** - повторный запуск безопасен
- **Инкременталь** - обновляются только измененные данные
- **Сохранение связей** - поддержание FK между таблицами
- **Обработка ошибок** - продолжение работы при локальных сбоях

## 🔮 Планы развития

### Возможные улучшения:
1. **Автоматическая синхронизация** - по расписанию или webhooks
2. **Двусторонняя синхронизация** - eneca.work → Worksection  
3. **Гибкие фильтры** - настраиваемые критерии синхронизации
4. **Batch операции** - массовая обработка данных
5. **Уведомления** - email/Slack о результатах синхронизации
6. **Резервное копирование** - сохранение состояния перед синхронизацией

## 📊 Диаграммы архитектуры

### 1. Общая архитектура системы
Показывает взаимодействие между Worksection, модулем интеграции и Supabase, включая маппинг иерархии данных.

### 2. Последовательность синхронизации разделов  
Детальный процесс синхронизации от клика пользователя до сохранения данных в базе, включая все этапы обработки.

### 3. Процесс маппинга данных
Демонстрирует преобразование структуры данных из Worksection в формат Supabase с сохранением связей.

### 4. Алгоритм синхронизации (flowchart)
Блок-схема полного алгоритма синхронизации с условиями, циклами и точками принятия решений.

### 5. Схема управления через веб-интерфейс
Связи между кнопками интерфейса, API endpoints, функциями и результатами отображения.

## 🔧 Технические детали

### Используемые технологии:
- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla HTML/CSS/JavaScript  
- **Database**: Supabase PostgreSQL
- **API**: Worksection REST API
- **Deployment**: Локальный сервер (порт 3001)

### Безопасность:
- Переменные окружения для API ключей
- Валидация входных данных
- Обработка ошибок API
- Логирование операций

### Производительность:
- Batch обработка данных
- Кэширование существующих записей
- Инкрементальные обновления
- Оптимизированные SQL запросы

---

*Документация актуальна на момент создания. При изменении функциональности требует обновления.* 