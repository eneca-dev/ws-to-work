# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js/Express application that synchronizes data between Worksection (project management tool) and eneca.work (custom platform via Supabase). The sync is unidirectional: Worksection → Supabase.

## Common Commands

### Development
```bash
cd ws-to-work
npm install              # Install dependencies
npm start                # Start the server (production)
npm run dev              # Start with nodemon (development)
```

### Testing the Sync
```bash
# Start server
npm start

# Server runs on http://localhost:3001
# Use the web interface to trigger sync or call API endpoints:
curl -X POST http://localhost:3001/api/sync
curl -X POST "http://localhost:3001/api/sync?offset=0&limit=7"  # Paginated sync (default limit: 7)
curl http://localhost:3001/api/logs
curl http://localhost:3001/api/health

# Or use Telegram bot (if configured):
# Send /start_sync to @eneca_ws_to_work_bot
```

### Deployment
```bash
# Heroku deployment
heroku create your-app-name
heroku config:set SUPABASE_URL=your_url
heroku config:set SUPABASE_ANON_KEY=your_key
heroku config:set WORKSECTION_DOMAIN=your_domain.worksection.com
heroku config:set WORKSECTION_HASH=your_api_key

# Optional: Telegram notifications
heroku config:set TELEGRAM_BOT_TOKEN=your_bot_token
heroku config:set TELEGRAM_CHAT_ID=your_chat_id

git push heroku main
```

### Docker Deployment (Recommended for VPS)
```bash
# Full deployment guide in DEPLOY.md

# Quick start:
docker compose up -d --build

# Check status:
docker compose ps
docker compose logs -f

# Stop:
docker compose down

# Update after git pull:
git pull
docker compose up -d --build
```

## Automated Scheduling

### Built-in Scheduler (node-cron)

The application includes an automatic scheduler that runs sync every 3 hours.

**Location:** `services/scheduler.js`

**Schedule:**
- ⏰ Every 3 hours: 0:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00
- 🌍 Timezone: Europe/Minsk
- 📅 Skips weekends (Saturday and Sunday)
- 🔒 Protection against overlapping syncs
- 📊 Parameters: offset=0, limit=999, costsMode='daily'

**Initialization:**
Scheduler is automatically initialized on server start in `app.js`:
```javascript
scheduler.initScheduler();
```

**Check schedule via API:**
```bash
curl http://localhost:3001/api/schedule
```

**Important:** In Docker, sync can run as long as needed without SIGTERM interruptions (unlike Heroku's 30-second timeout).

### Alternative: System Cron

**Location:** `scripts/scheduled-sync.js`

Can be used with system cron instead of built-in scheduler:
```bash
# Example crontab (every 3 hours)
0 */3 * * * cd /path/to/ws-to-work && node scripts/scheduled-sync.js >> /var/log/sync.log 2>&1
```

## Architecture

### Key Design Principles
- **File size limit**: All files kept under 300 lines for maintainability
- **Modular architecture**: Clear separation of concerns across services
- **Single direction sync**: Data flows only from Worksection to Supabase (no reverse sync)
- **Tag-based filtering**: Only projects with "eneca.work sync" or "eneca.work sync OS" tags are synced
- **Pagination support**: Sync can be run in batches using offset/limit parameters

### Core Components

**app.js** (131 lines)
- Express server setup
- API endpoints: POST /api/sync, GET /api/logs, GET /api/health
- CORS configuration for cross-origin requests
- Serves static web interface from public/

**sync/sync-manager.js** (132 lines)
- Orchestrates the 4-step sync process:
  1. Projects (filtered by tags "eneca.work sync" or "eneca.work sync OS")
  2. Stages (standard stages for each project)
  3. Objects (active tasks from Worksection → objects in Supabase)
  4. Sections (active subtasks → sections in Supabase)
- Collects detailed statistics on creates/updates/errors
- Tracks user assignment success rates

**sync/project-sync.js** (136 lines)
- Syncs projects and stages
- Projects starting with "!" are automatically skipped
- Determines sync type: 'standard' or 'os' based on tags
- Assigns project managers based on email matching
- Creates standard stages for each project

**sync/content-sync.js** (188 lines)
- Syncs objects (tasks) and sections (subtasks)
- Only syncs "active" status tasks/subtasks
- Updates existing records (titles, dates, assignees)
- Maps Worksection tasks to Supabase objects/sections
- Handles user assignment with fuzzy matching

**services/worksection.js** (62 lines)
- Worksection API v2 client
- MD5 hash-based authentication (query params + API key)
- Methods: getProjects(), getProjectTasks(), getProjectsWithSyncTags()
- Handles different tag formats (array, string, object)
- Two sync tag types: "eneca.work sync" and "eneca.work sync OS"

**services/supabase.js** (270 lines)
- Supabase client for eneca.work database
- CRUD operations for: projects, stages, objects, sections, users
- User search with multiple strategies: email exact match, email partial, name matching, fuzzy search
- Returns detailed statistics on all operations

**services/telegram.js** (~200 lines)
- Telegram Bot API client for notifications
- Generates CSV files with sync logs, statistics, and delta
- Sends reports to Telegram chat after each sync
- Supports sending to multiple chats (TELEGRAM_CHAT_ID and TELEGRAM_CHAT_ID_2)
- Formats start/completion/error notifications
- Optional feature (enabled when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set)

**services/telegram-bot.js** (~140 lines)
- Telegram bot command handler
- Webhook endpoint for receiving bot commands
- Processes /start_sync, /help, /start commands
- Security: validates chat_id before executing commands
- Auto-configures webhook on Heroku deployment

**utils/logger.js** (50 lines)
- In-memory logging system
- Log levels: info, warning, error, success
- Stores logs in memory for web interface display
- Auto-clears logs before each sync

**config/env.js** (38 lines)
- Loads and validates environment variables
- Validates required config on startup
- Configurable sync settings: batch size, delay, max retries

### Data Flow

```
Worksection API
    ↓ (filtered by sync tags)
sync-manager.js orchestrates:
    ↓
1. project-sync.js → Creates/updates projects & stages in Supabase
    ↓
2. content-sync.js → Creates/updates objects (tasks) in Supabase
    ↓
3. content-sync.js → Creates/updates sections (subtasks) in Supabase
```

### Key Sync Rules

1. **Project filtering**: Only projects with tags "eneca.work sync" or "eneca.work sync OS"
2. **Name-based skipping**: Projects starting with "!" are skipped
3. **Status filtering**: Only "active" tasks and subtasks are synced
4. **User assignment**: Uses email-based search with fallback to fuzzy matching
5. **Date sync**: start_date and end_date are synchronized
6. **Title updates**: Names/titles are updated on every sync

### User Assignment Logic

The system uses a sophisticated user search algorithm (services/supabase.js):
1. Exact email match
2. Email partial match (before @)
3. Full name match
4. Name parts match (first + last)
5. Fuzzy search (contains)

Statistics track successful vs failed assignments for monitoring.

## Environment Variables

Required:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `WORKSECTION_DOMAIN` - Worksection domain (e.g., company.worksection.com)
- `WORKSECTION_HASH` - Worksection API key (used to generate MD5 hash)

Optional:
- `PORT` - Server port (default: 3001)
- `SYNC_BATCH_SIZE` - Batch size for sync operations (default: 50)
- `SYNC_DELAY_MS` - Delay between requests in ms (default: 1000)
- `SYNC_MAX_RETRIES` - Max retry attempts (default: 3)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token for notifications (optional)
- `TELEGRAM_CHAT_ID` - Telegram chat ID to send reports (optional)
- `TELEGRAM_CHAT_ID_2` - Second Telegram chat ID for sending reports to multiple chats (optional)
- `HEROKU_APP_NAME` - Heroku app name for webhook auto-configuration (optional, Heroku only)

Create `.env` file in ws-to-work/ directory with these variables.

## Telegram Notifications

The system can automatically send sync reports as CSV files to Telegram after each synchronization.

### Setup Instructions

1. **Create Telegram Bot:**
   - Open Telegram and find @BotFather
   - Send `/newbot` command
   - Follow instructions to create bot

2. **Get Your Chat ID:**
   - Find @userinfobot in Telegram
   - Send `/start` command
   - Copy your user ID

3. **Set Environment Variables:**
   ```bash
   # Local development (.env file)
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_CHAT_ID=
   TELEGRAM_CHAT_ID_2=
   ```

4. **Start Bot Conversation:**
   - Find your bot in Telegram (e.g., @eneca_ws_to_work_bot)
   - Send `/start` command to activate it

5. **Set Heroku App Name (for webhook):**
   ```bash
   # On Heroku, set app name for webhook auto-configuration
   heroku config:set HEROKU_APP_NAME=your-app-name
   ```

### Bot Commands

- `/start_sync` - Запустить полную синхронизацию Worksection → eneca.work
- `/help` - Показать список доступных команд
- `/start` - Приветствие и справка

### Notification Flow

**1. Start Notification (sent once at beginning):**
```
🚀 Синхронизация запущена
⏰ Время: 2025-11-06 14:30:45
📊 Проектов в Worksection: 52
📊 Текущее состояние базы:
   📋 Проекты: 48
   🎯 Стадии: 52
   📦 Объекты: 179
   📑 Разделы: 1676
   🔢 Всего: 1955 записей
```

**2. Completion Notification (sent once at end):**
```
📊 Синхронизация завершена
⏱ Длительность: 81s
✅ Проекты: 3 создано, 2 обновлено
📦 Объекты: 15 создано, 8 обновлено
✨ Без ошибок

📈 Добавлено синхронизацией:
📋 Проекты: 4
🎯 Стадии: 12
📦 Объекты: 23
📑 Разделы: 45
🔢 Всего: 84 записей

+ CSV файл с детальными логами
```

**3. Error Notification (if sync fails):**
Sent immediately with error details and stack trace.

### CSV Report Format

Each sync generates a CSV file with:
- **SYNC SUMMARY**: Start time, finish time, duration
- **STATISTICS**: Counts of created/updated items (projects, stages, objects, sections)
- **DELTA (Added by Sync)**: What was actually added by this sync run
- **COUNT BEFORE/AFTER**: Database state before and after sync
- **DETAILED LOGS**: Timestamped log entries for all operations

Example filename: `sync_2025-11-06_14-30-45.csv`

This format allows you to see:
- How many records were in the database before sync
- How many records were added during sync
- The final count after sync
- Full operation logs for debugging

### Features

- Automatic CSV generation after each sync
- Emoji-enhanced summary message
- Error counts and warnings highlighted
- No manual intervention required
- Fails gracefully if Telegram is unavailable

### Troubleshooting

If notifications aren't working:
1. Verify bot token and chat ID are correct
2. Ensure you've sent `/start` to the bot
3. Check Heroku logs: `heroku logs --tail`
4. Test bot manually: send a message to it
5. Verify network access (Telegram API must be reachable)

Note: Telegram errors won't stop the sync process - they're logged as warnings.

## Working with the Codebase

### Adding New Sync Features
- Extend sync-manager.js to add new sync steps
- Create specialized sync functions in project-sync.js or content-sync.js
- Keep functions focused and under 50 lines where possible

### Modifying API Clients
- Worksection changes go in services/worksection.js
- Supabase changes go in services/supabase.js
- Always include error handling and logging

### Debugging
- All operations are logged through utils/logger.js
- Check /api/logs endpoint for real-time sync logs
- Stats object in sync-manager provides detailed metrics
- Look for "⚠️" warnings for skipped items in logs

### Code Style
- Files written in Russian comments (preserve this)
- Use logger for all output (never console.log)
- Return detailed stats from all sync functions
- Handle errors gracefully with try/catch
