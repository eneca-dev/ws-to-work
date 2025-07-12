# 🚀 Инструкция по деплою обновлений на Heroku

## 🎯 Проблема

В основном приложении eneca.work вкладка "Отчёты синхронизации" показывает ошибку 404, потому что новые API endpoints ещё не задеплоены на Heroku.

## ✅ Решение

Нужно задеплоить обновлённый код `ws-to-work-integration` на Heroku.

## 📋 Пошаговая инструкция

### 1. Подготовка (если ещё не настроено)

**Проверьте подключение к Heroku:**
```bash
heroku --version
heroku auth:whoami
```

**Если Heroku CLI не установлен:**
```bash
# macOS
brew tap heroku/brew && brew install heroku

# Windows
# Скачайте с https://cli.heroku.com/
```

### 2. Настройка Git репозитория

**Перейдите в папку интеграции:**
```bash
cd path/to/ws-to-work-integration
```

**Подключите Heroku remote (если ещё не подключен):**
```bash
heroku git:remote -a ws-to-work-integration-eneca
```

**Проверьте настройки:**
```bash
git remote -v
# Должно показать:
# heroku  https://git.heroku.com/ws-to-work-integration-eneca.git (fetch)
# heroku  https://git.heroku.com/ws-to-work-integration-eneca.git (push)
```

### 3. Деплой изменений

**Добавьте все изменения в Git:**
```bash
git add .
git status  # Проверьте что все нужные файлы добавлены
```

**Сделайте коммит:**
```bash
git commit -m "Add enhanced sync system with detailed logging and reports

- Add file logging for all operations (sync, access, validation, etc.)
- Add automatic JSON report generation for each sync
- Add API endpoints for reports: /api/reports/list, /api/reports/download/:filename
- Add API for logs: /api/logs/:type?date=YYYY-MM-DD
- Enhanced error handling with retry logic
- Improved performance metrics and recommendations
- Better status monitoring and diagnostics"
```

**Задеплойте на Heroku:**
```bash
git push heroku main
```

### 4. Проверка деплоя

**Посмотрите логи деплоя:**
```bash
heroku logs --tail --app ws-to-work-integration-eneca
```

**Проверьте что сервер запустился:**
```bash
curl -I https://ws-to-work-integration-eneca-7cab192e5438.herokuapp.com/
# Должно вернуть: HTTP/1.1 200 OK
```

**Проверьте новые API endpoints:**
```bash
# Проверка списка отчётов
curl https://ws-to-work-integration-eneca-7cab192e5438.herokuapp.com/api/reports/list

# Проверка статуса сервера
curl https://ws-to-work-integration-eneca-7cab192e5438.herokuapp.com/api/status

# Проверка логов синхронизации
curl "https://ws-to-work-integration-eneca-7cab192e5438.herokuapp.com/api/logs/sync?date=2024-01-15"
```

### 5. Проверка в основном приложении

После успешного деплоя:

1. Откройте eneca.work
2. Перейдите в модуль "Проекты" 
3. Переключитесь на вкладку "Отчёты синхронизации"
4. Вместо ошибки 404 должно появиться сообщение "Отчёты о синхронизации не найдены" (если отчётов ещё нет)

### 6. Тестирование полной функциональности

**Запустите полную синхронизацию:**
```bash
curl -X POST https://ws-to-work-integration-eneca-7cab192e5438.herokuapp.com/api/sync/full
```

**Или через веб-интерфейс:**
1. Откройте https://ws-to-work-integration-eneca-7cab192e5438.herokuapp.com/
2. Нажмите "🚀 Полная синхронизация"
3. Дождитесь завершения

**Проверьте что отчёт создался:**
```bash
curl https://ws-to-work-integration-eneca-7cab192e5438.herokuapp.com/api/reports/list
```

## 🔧 Диагностика проблем

### Если деплой не прошёл

**Проверьте ошибки:**
```bash
heroku logs --tail --app ws-to-work-integration-eneca
```

**Проверьте переменные окружения:**
```bash
heroku config --app ws-to-work-integration-eneca
```

**Проверьте что все нужные переменные установлены:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` 
- `WORKSECTION_HASH`
- `WORKSECTION_DOMAIN`

### Если API всё ещё недоступно

**Проверьте статус приложения:**
```bash
heroku ps --app ws-to-work-integration-eneca
```

**Перезапустите приложение:**
```bash
heroku restart --app ws-to-work-integration-eneca
```

**Проверьте логи запуска:**
```bash
heroku logs --tail --app ws-to-work-integration-eneca | grep "WS-to-Work сервер"
```

## ✨ Результат после деплоя

После успешного деплоя будут доступны:

### 📊 В основном приложении eneca.work:
- ✅ Вкладка "Отчёты синхронизации" работает
- ✅ Модальное окно с детальным отчётом после синхронизации  
- ✅ История всех синхронизаций
- ✅ Скачивание отчётов в JSON формате

### 🔧 На сервере интеграции:
- ✅ Детальное логирование в файлы `/logs/`
- ✅ Автоматические JSON отчёты в `/reports/`
- ✅ API для получения отчётов и логов
- ✅ Расширенная диагностика системы

### 🎯 Новые возможности:
- 🔍 Прозрачность процесса синхронизации
- 📈 Метрики производительности  
- 🛡️ Автоматическая диагностика проблем
- 💡 Рекомендации по улучшению
- 📋 История операций для анализа

## 🆘 Если проблемы остались

1. **Проверьте переменную окружения в eneca.work:**
   ```bash
   # В файле .env.local должно быть:
   NEXT_PUBLIC_WS_INTEGRATION_URL='https://ws-to-work-integration-eneca-7cab192e5438.herokuapp.com'
   ```

2. **Перезапустите основное приложение:**
   ```bash
   # В папке eneca.work
   npm run dev
   ```

3. **Очистите кэш браузера** или откройте в приватном режиме

4. **Проверьте консоль браузера** (F12) на наличие ошибок

## 📞 Поддержка

Если после выполнения всех шагов проблема остаётся:

1. Соберите логи:
   ```bash
   heroku logs --app ws-to-work-integration-eneca > heroku-logs.txt
   ```

2. Проверьте консоль браузера (F12) в eneca.work

3. Обратитесь к разработчикам с собранными логами

---

**📅 Время выполнения:** ~5-10 минут  
**🔄 Частота:** Однократно для решения проблемы  
**⚠️ Важно:** Обязательно проверьте работу после деплоя! 