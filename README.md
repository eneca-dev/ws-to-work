
# Worksection to eneca.work Sync v2

Упрощенное приложение для синхронизации данных между Worksection и eneca.work.

## Особенности

- ✅ Полная синхронизация в один клик
- ✅ Простой веб-интерфейс
- ✅ Детальное логирование
- ✅ Правильное назначение ответственных
- ✅ Обновление дат и названий
- ✅ Минимальный код (<300 строк на файл)

## Быстрый старт

### Локальная разработка

1. Установите зависимости:
```bash
npm install
```

2. Настройте переменные окружения:
```bash
cp config.env.example .env
```

3. Отредактируйте `.env` файл с вашими данными

4. Запустите приложение:
```bash
npm start
```

5. Откройте http://localhost:3001

### Развертывание на Heroku

1. Создайте приложение на Heroku:
```bash
heroku create your-app-name
```

2. Настройте переменные окружения:
```bash
heroku config:set SUPABASE_URL=your_url
heroku config:set SUPABASE_ANON_KEY=your_key
heroku config:set WORKSECTION_DOMAIN=your_domain.worksection.com
heroku config:set WORKSECTION_HASH=your_hash
```

3. Разверните приложение:
```bash
git push heroku main
```

## API Endpoints

- `POST /api/sync` - Запуск полной синхронизации
- `GET /api/logs` - Получение текущих логов
- `GET /api/health` - Проверка состояния

## Структура проекта

```
ws-to-work_v2/
├── config/           # Конфигурация
│   └── env.js
├── services/         # Сервисы API
│   ├── worksection.js
│   └── supabase.js
├── sync/             # Логика синхронизации
│   └── sync-manager.js
├── utils/            # Утилиты
│   └── logger.js
├── public/           # Веб-интерфейс
│   └── index.html
├── app.js            # Основное приложение
└── package.json
```

## Переменные окружения

| Переменная | Обязательна | Описание |
|------------|-------------|----------|
| `PORT` | Нет | Порт сервера (по умолчанию 3001) |
| `SUPABASE_URL` | Да | URL Supabase проекта |
| `SUPABASE_ANON_KEY` | Да | Анонимный ключ Supabase |
| `WORKSECTION_DOMAIN` | Да | Домен Worksection |
| `WORKSECTION_HASH` | Да | API ключ Worksection |
| `SYNC_BATCH_SIZE` | Нет | Размер батча (по умолчанию 50) |
| `SYNC_DELAY_MS` | Нет | Задержка между запросами (по умолчанию 1000) |
| `SYNC_MAX_RETRIES` | Нет | Количество повторных попыток (по умолчанию 3) |

## Как работает синхронизация

1. **Проекты**: Синхронизирует проекты с тегом "eneca.work sync"
2. **Стадии**: Создает стандартные стадии для каждого проекта
3. **Объекты**: Синхронизирует активные задачи как объекты
4. **Разделы**: Синхронизирует активные подзадачи как разделы

## Назначение ответственных

- Поиск по email из Worksection
- Автоматическое назначение найденных пользователей
- Подробная статистика успешности назначений 