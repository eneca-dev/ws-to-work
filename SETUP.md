# Быстрый запуск

## 1. Установка зависимостей
```bash
cd ws-to-work_v2
npm install
```

## 2. Настройка окружения
```bash
cp config.env.example .env
```

Отредактируйте `.env` файл:
```env
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
WORKSECTION_DOMAIN=your_domain.worksection.com
WORKSECTION_HASH=your_api_hash
```

## 3. Запуск
```bash
npm start
```

## 4. Использование
1. Откройте http://localhost:3001
2. Нажмите кнопку "Start Full Sync"
3. Наблюдайте за процессом синхронизации в реальном времени

## API
- `POST /api/sync` - Полная синхронизация
- `GET /api/logs` - Текущие логи
- `GET /api/health` - Проверка состояния

## Деплой на Heroku
```bash
heroku create your-app-name
heroku config:set SUPABASE_URL=your_url
heroku config:set SUPABASE_ANON_KEY=your_key
heroku config:set WORKSECTION_DOMAIN=your_domain
heroku config:set WORKSECTION_HASH=your_hash
git push heroku main
``` 