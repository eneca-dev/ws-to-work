# 🚀 Переменные окружения для Heroku

## 📋 Обязательные переменные

Установите эти переменные в Heroku Dashboard (Settings → Config Vars) или через CLI:

### ⚡ Основные настройки

```bash
# Хост (обязательно для Heroku)
heroku config:set HOST=0.0.0.0

# Часовой пояс
heroku config:set TZ=Europe/Minsk

# Режим работы
heroku config:set NODE_ENV=production
```

### 🔗 Worksection API

```bash
# Домен вашего Worksection (без https://)
heroku config:set WORKSECTION_DOMAIN=your-company.worksection.com

# API ключ из настроек Worksection
heroku config:set WORKSECTION_HASH=your_worksection_api_hash_here
```

### 🗄️ Supabase Database

```bash
# URL проекта Supabase
heroku config:set SUPABASE_URL=https://your-project.supabase.co

# Публичный ключ
heroku config:set SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Service Role ключ
heroku config:set SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

### 🛡️ Безопасность и CORS

```bash
# Разрешенные домены (через запятую)
heroku config:set ALLOWED_ORIGINS=https://your-eneca-app.vercel.app,https://your-domain.com

# Лимит запросов в минуту
heroku config:set RATE_LIMIT_MAX_REQUESTS=100
```

### ⚙️ Производительность

```bash
# Таймауты
heroku config:set API_REQUEST_TIMEOUT=30000
heroku config:set DB_TIMEOUT=10000

# Синхронизация
heroku config:set SYNC_BATCH_SIZE=50
heroku config:set SYNC_REQUEST_DELAY=1000
heroku config:set SYNC_MAX_RETRIES=3

# База данных
heroku config:set DB_MAX_CONNECTIONS=10
```

### 🔧 Функции

```bash
# Включить улучшения
heroku config:set ENABLE_ERROR_HANDLER=true
heroku config:set ENABLE_VALIDATION=true
heroku config:set ENABLE_CACHING=false
heroku config:set ENABLE_SECURITY=true
heroku config:set ENABLE_DETAILED_LOGGING=true
```

## 🎯 Быстрая установка (одной командой)

```bash
heroku config:set \
  HOST=0.0.0.0 \
  TZ=Europe/Minsk \
  NODE_ENV=production \
  WORKSECTION_DOMAIN=your-company.worksection.com \
  WORKSECTION_HASH=your_hash_here \
  SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_ANON_KEY=your_anon_key_here \
  SUPABASE_SERVICE_ROLE_KEY=your_service_key_here \
  ALLOWED_ORIGINS=https://your-eneca-app.vercel.app \
  RATE_LIMIT_MAX_REQUESTS=100 \
  API_REQUEST_TIMEOUT=30000 \
  DB_TIMEOUT=10000 \
  SYNC_BATCH_SIZE=50 \
  SYNC_REQUEST_DELAY=1000 \
  SYNC_MAX_RETRIES=3 \
  DB_MAX_CONNECTIONS=10 \
  ENABLE_ERROR_HANDLER=true \
  ENABLE_VALIDATION=true \
  ENABLE_CACHING=false \
  ENABLE_SECURITY=true \
  ENABLE_DETAILED_LOGGING=true
```

## ✅ Проверка настроек

После установки проверьте переменные:

```bash
heroku config
```

## ⚠️ Важные примечания

1. **PORT** - НЕ устанавливайте вручную! Heroku автоматически назначает порт
2. **HOST** - обязательно `0.0.0.0` для Heroku
3. **Замените** `your-*` значения на реальные данные
4. **ALLOWED_ORIGINS** - укажите домены, с которых разрешены запросы к API

## 🔍 Мониторинг

После деплоя проверьте логи:

```bash
heroku logs --tail
```

## 🌐 URL приложения

После деплоя ваше приложение будет доступно по адресу:
```
https://your-app-name.herokuapp.com
``` 