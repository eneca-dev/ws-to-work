# 🚀 Краткая справка по синхронизации ws-to-work

## 📋 Быстрый доступ

| Кнопка | API Endpoint | Функция | Источник → Цель |
|--------|-------------|---------|-----------------|
| 🏢 Синхронизировать проекты | `POST /api/projects/sync` | `syncProjectsToSupabase()` | WS Projects → SB Managers/Projects |
| 🎯 Синхронизировать стадии | `POST /api/stages/sync` | `syncStagesFromWorksection()` | WS Tasks L1 → SB Stages |
| 📦 Синхронизировать объекты | `POST /api/objects/sync` | `syncObjectsFromWorksection()` | WS Tasks L2 → SB Objects |
| 📑 Синхронизировать разделы | `POST /api/sections/sync` | `syncSectionsFromWorksection()` | WS Tasks L3 → SB Sections |
| **🚀 Полная синхронизация** | `POST /api/sync/full` | `runFullSync()` | **Все данные в правильном порядке** |

## 🔄 Порядок синхронизации

### Ручная синхронизация
1. **🏢 Проекты** (обязательно первым)
2. **🎯 Стадии** (требует проекты)
3. **📦 Объекты** (требует стадии)
4. **📑 Разделы** (требует объекты)

### 🚀 Автоматическая полная синхронизация
- Выполняет все 4 этапа в правильном порядке
- Детальное логирование каждой операции
- Продолжает работу при ошибках
- Итоговая статистика по всем операциям

## 📊 Ключевые поля синхронизации

### Проекты
```javascript
project_name, project_description, project_status, project_manager
external_id, external_source, external_updated_at
```

### Стадии  
```javascript
stage_name, stage_description, stage_responsible, stage_project_id
stage_start_date, stage_end_date, external_id, external_source
```

### Объекты
```javascript
object_name, object_description, object_responsible, object_stage_id
object_project_id, object_start_date, object_end_date, external_id
```

### Разделы
```javascript
section_name, section_description, section_responsible, section_object_id
section_project_id, section_type, section_start_date, section_end_date, external_id
```

## 🎯 Фильтры синхронизации

| Критерий | Описание |
|----------|----------|
| ✅ Метка sync | Только проекты с "eneca.work sync" |
| ✅ Активные задачи | `status = 'active'` |
| ❌ Служебные задачи | Исключаются задачи с "!" в начале |
| ❌ Неактивные | Пропускаются завершенные/отмененные |

## 🚨 Частые проблемы и решения

| Проблема | Причина | Решение |
|----------|---------|---------|
| "Проекты не найдены" | Нет метки sync | Добавить метку "eneca.work sync" в WS |
| "Объект не найден" | Нет родительской стадии | Сначала синхронизировать стадии |
| "Пользователь не найден" | Email не совпадает | Проверить email в WS и Supabase |
| "Cannot read properties" | Ошибка структуры данных | Проверить версию кода |

## ⚙️ Переменные окружения

```bash
# Обязательные
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
WORKSECTION_DOMAIN=your-domain.worksection.com
WORKSECTION_HASH=your-api-hash

# Опциональные
PORT=3001
WORKSECTION_EMAIL=your-email@domain.com
WORKSECTION_PASSWORD=your-password
```

## 🔧 Команды запуска

```bash
# Разработка
npm run dev

# Продакшн
npm start

# Установка зависимостей
npm install
```

## 📈 Интерпретация логов

| Тип лога | Цвет | Значение |
|----------|------|----------|
| INFO | 🔵 Синий | Информационные сообщения |
| SUCCESS | 🟢 Зеленый | Успешные операции |
| WARNING | 🟡 Оранжевый | Предупреждения |
| ERROR | 🔴 Красный | Ошибки |

## 🎛️ Статистика результатов

- **Создано** - новые записи в БД
- **Обновлено** - измененные существующие записи  
- **Без изменений** - актуальные записи (пропущены)
- **Ошибки** - записи с проблемами обработки

---

💡 **Совет**: Всегда синхронизируйте в порядке: Проекты → Стадии → Объекты → Разделы 