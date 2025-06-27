# 🚀 Деплой ws-to-work-integration на Heroku

## 📋 Предварительные требования

1. **Heroku CLI** установлен
2. **Git** настроен
3. **Heroku аккаунт** создан
4. **Данные Worksection API** и **Supabase**

## 🏁 Пошаговая инструкция

### 1. Подготовка проекта

```bash
# Убедитесь что находитесь в папке ws-to-work-integration
cd ws-to-work-integration

# Проверьте наличие необходимых файлов
ls -la Procfile HEROKU_ENV.md
```

### 2. Инициализация Git (если не сделано)

```bash
# Инициализация репозитория
git init

# Добавление файлов
git add .

# Первый коммит
git commit -m "Initial commit for Heroku deployment"
```

### 3. Создание Heroku приложения

```bash
# Создание приложения с уникальным именем
heroku create your-ws-integration-app

# Или позволить Heroku сгенерировать имя
heroku create

# Проверка созданного приложения
heroku apps
```

### 4. Настройка переменных окружения

**Способ 1: Через CLI (рекомендуется)**

```bash
# Установка всех переменных одной командой
heroku config:set \
  HOST=0.0.0.0 \
  TZ=Europe/Minsk \
  NODE_ENV=production \
  WORKSECTION_DOMAIN=eneca.worksection.com \
  WORKSECTION_HASH=your_real_hash_here \
  SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_ANON_KEY=your_real_anon_key_here \
  SUPABASE_SERVICE_ROLE_KEY=your_real_service_key_here \
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

**Способ 2: Через Dashboard**

1. Откройте https://dashboard.heroku.com/apps/your-app-name
2. Settings → Config Vars
3. Добавьте переменные из файла `HEROKU_ENV.md`

### 5. Деплой приложения

```bash
# Деплой на Heroku
git push heroku main

# Если ваша основная ветка называется master
git push heroku master
```

### 6. Проверка статуса

```bash
# Проверка статуса приложения
heroku ps

# Просмотр логов
heroku logs --tail

# Открытие приложения в браузере
heroku open
```

## ✅ Проверка работоспособности

### Тестирование API endpoints:

```bash
# Замените your-app-name на реальное имя
export HEROKU_URL="https://your-app-name.herokuapp.com"

# Проверка health endpoint
curl $HEROKU_URL/api/health

# Проверка статистики
curl $HEROKU_URL/api/stats

# Проверка проектов (если есть доступ)
curl $HEROKU_URL/api/projects
```

### Ожидаемые ответы:

**Health Check:**
```json
{
  "status": "ok",
  "uptime": 12345,
  "memory": {...},
  "stats": {...}
}
```

## 🔧 Управление приложением

### Масштабирование

```bash
# Запуск на одном dyno (бесплатно)
heroku ps:scale web=1

# Остановка приложения
heroku ps:scale web=0
```

### Мониторинг логов

```bash
# Просмотр последних логов
heroku logs

# Просмотр логов в реальном времени
heroku logs --tail

# Логи с фильтрацией
heroku logs --source app
```

### Управление переменными

```bash
# Просмотр всех переменных
heroku config

# Изменение переменной
heroku config:set RATE_LIMIT_MAX_REQUESTS=200

# Удаление переменной
heroku config:unset VARIABLE_NAME
```

## 🚨 Устранение проблем

### Проблема: Приложение не запускается

```bash
# Проверка логов
heroku logs --tail

# Проверка переменных окружения
heroku config

# Проверка процессов
heroku ps
```

### Проблема: Timeout ошибки

```bash
# Увеличение таймаутов
heroku config:set API_REQUEST_TIMEOUT=60000
heroku config:set DB_TIMEOUT=20000
```

### Проблема: CORS ошибки

```bash
# Обновление разрешенных доменов
heroku config:set ALLOWED_ORIGINS=https://your-domain.com,https://another-domain.com
```

## 🔄 Обновление приложения

```bash
# После внесения изменений в код
git add .
git commit -m "Update: description of changes"
git push heroku main

# Перезапуск приложения (если нужно)
heroku restart
```

## 💰 Стоимость

- **Hobby Dyno**: $7/месяц (рекомендуется для продакшена)
- **Free Dyno**: Бесплатно (засыпает через 30 мин без активности)

## 📊 Мониторинг производительности

```bash
# Установка дополнений для мониторинга
heroku addons:create papertrail:choklad  # Логи
heroku addons:create newrelic:wayne      # Мониторинг производительности
```

## 🔗 Полезные ссылки

- [Heroku Dashboard](https://dashboard.heroku.com)
- [Heroku CLI Documentation](https://devcenter.heroku.com/articles/heroku-cli)
- [Node.js on Heroku](https://devcenter.heroku.com/articles/getting-started-with-nodejs)

## 📞 Контакты и поддержка

При возникновении проблем:

1. Проверьте логи: `heroku logs --tail`
2. Проверьте переменные: `heroku config`
3. Проверьте статус: `heroku ps`
4. Обратитесь к команде разработки eneca.work 