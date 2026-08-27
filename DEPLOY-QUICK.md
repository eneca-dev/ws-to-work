# Быстрый деплой на прод ВПС

Короткая шпаргалка для этого конкретного сервера (`vps-21e1e1db`) — полная общая инструкция в [DEPLOY.md](DEPLOY.md).

## Где лежит приложение

Папка проекта на сервере принадлежит пользователю `ubuntu`, а не тому, под кем вы обычно логинитесь по SSH:

```
/home/ubuntu/ws-to-work
```

Если не знаете/забыли путь — можно найти через сам контейнер:

```bash
sudo docker inspect ws-to-work --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
```

## Шаги деплоя

```bash
# 1. Переключиться на владельца папки
sudo su - ubuntu
cd ~/ws-to-work

# 2. Обновить код
git checkout main
git pull

# 3. Пересобрать и перезапустить контейнер
docker compose up -d --build
```

## Проверка

```bash
docker compose ps                         # STATUS: healthy
curl http://localhost:3004/api/health
docker compose logs -f                    # Ctrl+C чтобы выйти
```

Ручной запуск синхронизации (не ждать шедулер каждые 3 часа):

```bash
curl -X POST http://localhost:3004/api/sync
```

## Откат при проблемах

```bash
docker compose down
git log --oneline -5      # найти предыдущий рабочий коммит
git checkout <commit> -- .
docker compose up -d --build
```
