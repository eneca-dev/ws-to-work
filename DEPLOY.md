# 🚀 Деплой на VPS

Инструкция по развертыванию ws-to-work на VPS с использованием Docker.

---

## 📋 Требования

### На VPS сервере:

- **ОС**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+ (или любой Linux с Docker)
- **RAM**: минимум 512 MB (рекомендуется 1 GB+)
- **Disk**: минимум 2 GB свободного места
- **Docker**: версия 20.10+
- **Docker Compose**: версия 2.0+
- **Доступ**: SSH root или sudo доступ

---

## 🔧 Подготовка сервера

### 1. Подключение к VPS

```bash
ssh root@your-server-ip
# или
ssh username@your-server-ip
```

### 2. Обновление системы

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 3. Установка Docker

#### Ubuntu/Debian:

```bash
# Удаляем старые версии (если есть)
sudo apt remove docker docker-engine docker.io containerd runc

# Устанавливаем зависимости
sudo apt install -y ca-certificates curl gnupg lsb-release

# Добавляем GPG ключ Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Добавляем репозиторий Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Устанавливаем Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Проверяем установку
docker --version
docker compose version
```

#### CentOS/RHEL:

```bash
# Устанавливаем yum-utils
sudo yum install -y yum-utils

# Добавляем репозиторий Docker
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Устанавливаем Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Запускаем Docker
sudo systemctl start docker
sudo systemctl enable docker

# Проверяем установку
docker --version
docker compose version
```

### 4. Настройка прав Docker (опционально)

Чтобы запускать Docker без sudo:

```bash
sudo usermod -aG docker $USER
newgrp docker

# Проверка
docker ps
```

---

## 📦 Установка приложения

### 1. Клонирование репозитория

```bash
# Переходим в домашнюю директорию
cd ~

# Клонируем репозиторий
git clone https://github.com/your-username/ws-to-work.git

# Переходим в директорию проекта
cd ws-to-work
```

### 2. Создание .env файла

```bash
# Копируем пример
cp .env.example .env

# Редактируем .env
nano .env
```

**Обязательные переменные:**

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here

# Worksection
WORKSECTION_DOMAIN=your-company.worksection.com
WORKSECTION_HASH=your_api_key_here

# Server
PORT=3001

# Telegram (опционально, для уведомлений)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TELEGRAM_CHAT_ID_2=your_second_chat_id  # (опционально, для отправки в два чата)
```

Сохраните файл: `Ctrl+X`, затем `Y`, затем `Enter`

---

## 🐳 Запуск через Docker Compose

### 1. Сборка и запуск контейнера

```bash
# Сборка образа и запуск контейнера в фоновом режиме
docker compose up -d --build
```

### 2. Проверка статуса

```bash
# Проверяем запущенные контейнеры
docker compose ps

# Должен быть статус "running" и "healthy"
```

### 3. Просмотр логов

```bash
# Просмотр логов в реальном времени
docker compose logs -f

# Просмотр последних 100 строк
docker compose logs --tail=100

# Выход из логов: Ctrl+C
```

---

## 🔍 Проверка работы

### 1. Health check

```bash
curl http://localhost:3001/api/health
```

Ожидаемый ответ:
```json
{
  "status": "ok",
  "timestamp": "2025-01-30T10:00:00.000Z"
}
```

### 2. Проверка расписания

```bash
curl http://localhost:3001/api/schedule
```

Ожидаемый ответ:
```json
{
  "success": true,
  "schedule": {
    "enabled": true,
    "hours": [0, 3, 6, 9, 12, 15, 18, 21],
    "timezone": "Europe/Minsk",
    "schedule": "0:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00"
  }
}
```

### 3. Ручной запуск синхронизации

```bash
curl -X POST http://localhost:3001/api/sync
```

---

## 📅 Расписание автоматической синхронизации

**Встроенный планировщик (node-cron):**
- ✅ Запускается каждые 3 часа: 0:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00
- ✅ Timezone: Europe/Minsk
- ✅ Пропускает выходные (суббота и воскресенье)
- ✅ Полная синхронизация: offset=0, limit=999
- ✅ Отчеты за вчера: costsMode=daily
- ✅ Отправка уведомлений в Telegram
- ✅ Защита от наложения синхронизаций

**Важно:** В отличие от Heroku, синхронизация в Docker может работать **сколько угодно долго** без прерываний по SIGTERM.

---

## 🔄 Управление контейнером

### Остановка

```bash
docker compose stop
```

### Запуск

```bash
docker compose start
```

### Перезапуск

```bash
docker compose restart
```

### Полная остановка и удаление

```bash
docker compose down
```

### Пересборка после обновления кода

```bash
# Останавливаем контейнер
docker compose down

# Обновляем код из Git
git pull

# Пересобираем и запускаем
docker compose up -d --build
```

### Просмотр логов

```bash
# Все логи
docker compose logs

# Последние 50 строк
docker compose logs --tail=50

# В реальном времени
docker compose logs -f

# Логи за последний час
docker compose logs --since 1h
```

---

## 🌐 Настройка Nginx Reverse Proxy (опционально)

Если хотите проксировать через Nginx:

### 1. Установка Nginx

```bash
sudo apt install nginx -y
```

### 2. Создание конфигурации

```bash
sudo nano /etc/nginx/sites-available/ws-sync
```

Содержимое:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Замените на ваш домен или IP

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Активация конфигурации

```bash
# Создаем симлинк
sudo ln -s /etc/nginx/sites-available/ws-sync /etc/nginx/sites-enabled/

# Проверяем конфигурацию
sudo nginx -t

# Перезапускаем Nginx
sudo systemctl restart nginx
```

### 4. Настройка SSL (Let's Encrypt)

```bash
# Устанавливаем certbot
sudo apt install certbot python3-certbot-nginx -y

# Получаем сертификат
sudo certbot --nginx -d your-domain.com

# Автопродление будет настроено автоматически
```

---

## 🔧 Автозапуск при перезагрузке

Docker Compose с `restart: always` автоматически запустит контейнер при перезагрузке сервера.

Проверка:

```bash
# Перезагружаем сервер
sudo reboot

# После перезагрузки подключаемся и проверяем
ssh root@your-server-ip
docker compose ps

# Контейнер должен быть запущен
```

---

## 📊 Мониторинг

### Использование ресурсов

```bash
# Статистика контейнера
docker stats ws-to-work

# Информация о контейнере
docker inspect ws-to-work
```

### Healthcheck

Docker автоматически проверяет здоровье контейнера каждые 60 секунд.

Проверка статуса:

```bash
docker compose ps

# STATUS должен быть: Up X minutes (healthy)
```

---

## ❗ Troubleshooting

### Контейнер не запускается

```bash
# Проверяем логи
docker compose logs

# Проверяем .env файл
cat .env

# Проверяем права на файлы
ls -la

# Пересоздаем контейнер
docker compose down
docker compose up -d --build
```

### Синхронизация не работает

```bash
# Проверяем логи синхронизации
docker compose logs -f | grep "синхронизац"

# Проверяем планировщик
curl http://localhost:3001/api/schedule

# Запускаем вручную
curl -X POST http://localhost:3001/api/sync
```

### Нет доступа к API

```bash
# Проверяем порты
sudo netstat -tulpn | grep 3001

# Проверяем firewall (если есть)
sudo ufw status
sudo ufw allow 3001/tcp

# Проверяем что контейнер запущен
docker compose ps
```

### Проблемы с памятью

```bash
# Проверяем использование памяти
docker stats ws-to-work

# Увеличиваем лимит памяти в docker-compose.yml:
# deploy:
#   resources:
#     limits:
#       memory: 1G
```

---

## 🔐 Безопасность

### 1. Firewall

```bash
# Устанавливаем ufw
sudo apt install ufw -y

# Разрешаем SSH
sudo ufw allow 22/tcp

# Разрешаем HTTP/HTTPS (если используете Nginx)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Включаем firewall
sudo ufw enable
```

### 2. Автообновление системы (Ubuntu)

```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### 3. Регулярный backup .env

```bash
# Создаем backup .env
cp .env .env.backup.$(date +%Y%m%d)
```

---

## 📝 Дополнительные команды

### Очистка Docker

```bash
# Удалить неиспользуемые образы
docker image prune -a

# Удалить неиспользуемые тома
docker volume prune

# Полная очистка
docker system prune -a --volumes
```

### Экспорт логов

```bash
# Экспорт последних 1000 строк логов
docker compose logs --tail=1000 > sync-logs-$(date +%Y%m%d).log
```

---

## 🎯 Итоговый чеклист

- [ ] Docker и Docker Compose установлены
- [ ] Репозиторий склонирован
- [ ] .env файл создан и заполнен
- [ ] Контейнер запущен: `docker compose up -d`
- [ ] Healthcheck проходит: `curl http://localhost:3001/api/health`
- [ ] Планировщик активен: логи показывают "Планировщик инициализирован"
- [ ] Firewall настроен (если нужно)
- [ ] Nginx настроен (если нужно)
- [ ] Telegram уведомления работают (если настроены)

---

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи: `docker compose logs -f`
2. Проверьте .env переменные
3. Убедитесь что Supabase и Worksection доступны
4. Проверьте healthcheck

---

**Готово! Приложение работает в Docker и синхронизируется каждые 3 часа автоматически.** 🎉
