# 🚀 Полная настройка Git + Heroku CLI + Деплой

## 📋 Пошаговая инструкция

### ✅ Шаг 1: Установка Heroku CLI

**На macOS:**
```bash
# Через Homebrew (рекомендуется)
brew tap heroku/brew && brew install heroku

# Или скачать с официального сайта:
# https://devcenter.heroku.com/articles/heroku-cli#install-the-heroku-cli
```

**Проверка установки:**
```bash
heroku --version
# Должно показать: heroku/8.x.x
```

### ✅ Шаг 2: Авторизация в Heroku

```bash
# Вход в аккаунт Heroku (откроет браузер)
heroku login

# Проверка авторизации
heroku auth:whoami
```

### ✅ Шаг 3: Инициализация Git репозитория

**Убедитесь что находитесь в папке ws-to-work-integration:**
```bash
pwd
# Должно показать: .../eneca.work/ws-to-work-integration
```

**Создание README.md и инициализация Git:**
```bash
# Создаем README.md с описанием проекта
echo "# ws-to-work" >> README.md
echo "" >> README.md
echo "Интеграция между Worksection и eneca.work" >> README.md
echo "" >> README.md
echo "## Описание" >> README.md
echo "Микросервис для синхронизации данных из Worksection в Supabase для приложения eneca.work" >> README.md
echo "" >> README.md
echo "## Технологии" >> README.md
echo "- Node.js + Express" >> README.md
echo "- Supabase PostgreSQL" >> README.md
echo "- Worksection API" >> README.md
echo "- Heroku deployment" >> README.md

# Инициализация Git
git init

# Добавление всех файлов
git add .

# Первый коммит
git commit -m "Initial commit: Heroku-ready ws-to-work integration"

# Переименование ветки в main
git branch -M main

# Подключение к GitHub репозиторию
git remote add origin https://github.com/eneca-dev/ws-to-work.git

# Пуш в GitHub
git push -u origin main
```

### ✅ Шаг 4: Создание Heroku приложения

```bash
# Создание приложения с автоматическим именем
heroku create

# ИЛИ с указанным именем (имя должно быть уникальным)
heroku create eneca-ws-integration

# Проверка созданного приложения
heroku apps

# Проверка Git remote для Heroku (должен добавиться автоматически)
git remote -v
```

### ✅ Шаг 5: Настройка переменных окружения

**Установка базовых переменных:**
```bash
heroku config:set HOST=0.0.0.0
heroku config:set NODE_ENV=production
heroku config:set TZ=Europe/Minsk
```

**Установка API ключей (ЗАМЕНИТЕ НА РЕАЛЬНЫЕ):**
```bash
# Worksection настройки
heroku config:set WORKSECTION_DOMAIN=eneca.worksection.com
heroku config:set WORKSECTION_HASH=ВАШ_РЕАЛЬНЫЙ_HASH_ИЗ_WORKSECTION

# Supabase настройки  
heroku config:set SUPABASE_URL=https://ВАШ_ПРОЕКТ.supabase.co
heroku config:set SUPABASE_ANON_KEY=ВАШ_ANON_KEY
heroku config:set SUPABASE_SERVICE_ROLE_KEY=ВАШ_SERVICE_ROLE_KEY

# CORS настройки (замените на ваши домены)
heroku config:set ALLOWED_ORIGINS=https://ваш-eneca-app.vercel.app,https://ваш-домен.com
```

**Установка настроек производительности:**
```bash
heroku config:set \
  RATE_LIMIT_MAX_REQUESTS=100 \
  API_REQUEST_TIMEOUT=30000 \
  DB_TIMEOUT=10000 \
  SYNC_BATCH_SIZE=50 \
  SYNC_REQUEST_DELAY=1000 \
  SYNC_MAX_RETRIES=3 \
  DB_MAX_CONNECTIONS=10
```

**Включение функций:**
```bash
heroku config:set \
  ENABLE_ERROR_HANDLER=true \
  ENABLE_VALIDATION=true \
  ENABLE_CACHING=false \
  ENABLE_SECURITY=true \
  ENABLE_DETAILED_LOGGING=true
```

**Проверка всех переменных:**
```bash
heroku config
```

### ✅ Шаг 6: Деплой на Heroku

```bash
# Деплой приложения
git push heroku main

# Проверка статуса
heroku ps

# Просмотр логов
heroku logs --tail
```

### ✅ Шаг 7: Проверка работоспособности

**Получение URL приложения:**
```bash
heroku info
# Или
heroku apps:info
```

**Тестирование API:**
```bash
# Замените YOUR_APP_NAME на реальное имя из heroku apps
export HEROKU_URL="https://YOUR_APP_NAME.herokuapp.com"

# Health check
curl $HEROKU_URL/api/health

# Статистика
curl $HEROKU_URL/api/stats

# Открытие в браузере
heroku open
```

**Ожидаемый ответ health check:**
```json
{
  "status": "ok",
  "uptime": 12345,
  "memory": {
    "rss": 67108864,
    "heapTotal": 29360128,
    "heapUsed": 20000000
  },
  "stats": {
    "totalRequests": 1,
    "successRequests": 1,
    "errorRequests": 0,
    "avgResponseTime": 10,
    "startTime": 1672531200000
  }
}
```

### ✅ Шаг 8: Мониторинг и обслуживание

**Просмотр логов в реальном времени:**
```bash
heroku logs --tail
```

**Перезапуск приложения:**
```bash
heroku restart
```

**Масштабирование (включение/выключение):**
```bash
heroku ps:scale web=1  # Включить
heroku ps:scale web=0  # Выключить
```

**Обновление кода:**
```bash
# После изменения кода
git add .
git commit -m "Описание изменений"
git push origin main      # В GitHub
git push heroku main      # На Heroku
```

## 🔧 Полезные команды

### Git команды:
```bash
git status                    # Статус изменений
git log --oneline            # История коммитов
git remote -v                # Список remote репозиториев
```

### Heroku команды:
```bash
heroku apps                  # Список приложений
heroku config               # Переменные окружения
heroku ps                   # Статус процессов
heroku logs                 # Последние логи
heroku releases             # История релизов
heroku rollback             # Откат к предыдущей версии
```

## 🚨 Устранение проблем

### Проблема: Не удается создать Heroku app
```bash
# Попробуйте другое имя
heroku create eneca-ws-integration-2024
```

### Проблема: Ошибки при push в GitHub
```bash
# Проверьте права доступа к репозиторию
git remote set-url origin https://github.com/eneca-dev/ws-to-work.git
git push -u origin main --force  # Осторожно! Перезапишет удаленную ветку
```

### Проблема: Heroku app не запускается
```bash
# Проверьте логи
heroku logs --tail

# Проверьте переменные окружения
heroku config

# Проверьте процессы
heroku ps
```

### Проблема: API возвращает ошибки
```bash
# Проверьте переменные окружения
heroku config:get WORKSECTION_HASH
heroku config:get SUPABASE_URL

# Проверьте логи
heroku logs --source app
```

## ✅ Финальная проверка

После выполнения всех шагов у вас должно быть:

1. ✅ Git репозиторий подключен к https://github.com/eneca-dev/ws-to-work.git
2. ✅ Heroku приложение создано и запущено
3. ✅ Все переменные окружения настроены
4. ✅ API отвечает на https://your-app-name.herokuapp.com/api/health
5. ✅ Веб-интерфейс доступен на https://your-app-name.herokuapp.com

## 🎯 Следующие шаги

1. **Обновите URL в основном приложении eneca.work:**
   ```javascript
   const WS_INTEGRATION_URL = 'https://your-app-name.herokuapp.com';
   ```

2. **Настройте автоматический деплой в GitHub:**
   - Зайдите в Heroku Dashboard
   - Deploy → GitHub → Connect to GitHub
   - Включите Automatic deploys

3. **Мониторинг:**
   ```bash
   # Добавьте мониторинг логов
   heroku addons:create papertrail:choklad
   ```

## 🎉 Готово!

Ваше приложение ws-to-work-integration развернуто на Heroku и готово к использованию! 