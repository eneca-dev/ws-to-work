# WS-to-Work Integration

## 🎯 Назначение
Приложение для синхронизации данных между Worksection API и Supabase базой данных eneca.work.

## 🚀 Быстрый старт

### 1. Установка зависимостей
```bash
npm install
```

### 2. Конфигурация
Скопируйте `ws.env.example` в `ws.env` и заполните настройки:
```bash
cp ws.env.example ws.env
# Отредактируйте ws.env
```

### 3. Запуск
```bash
npm start
```

## 🛡️ Улучшения стабильности
Приложение включает систему безопасных улучшений:
- Retry механизм для API запросов
- Валидация входных данных  
- Кэширование для ускорения
- Rate limiting для защиты
- Структурированное логирование

Управление через переменные в `ws.env`:
```bash
ENABLE_ERROR_HANDLER=true
ENABLE_VALIDATION=true
ENABLE_CACHING=true
ENABLE_SECURITY=true
ENABLE_DETAILED_LOGGING=true
```

## 📊 Мониторинг
```bash
# Проверка здоровья
curl http://localhost:3001/api/health

# Статус улучшений
curl http://localhost:3001/api/improvements/status

# Полная синхронизация
curl -X POST http://localhost:3001/api/sync/full
```

## 📚 Документация
- `docs/SAFE_INTEGRATION.md` - подробное руководство по улучшениям
- `INTEGRATION_SUMMARY.md` - сводка интеграции
- `docs/MAPPING.md` - схема маппинга данных

## 🆘 Поддержка
При проблемах проверьте:
1. Логи: `tail -f logs/combined.log`
2. Статус: `curl http://localhost:3001/api/improvements/status`  
3. Конфигурацию в `ws.env`
