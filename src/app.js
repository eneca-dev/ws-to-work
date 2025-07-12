const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '../ws.env') });
const fs = require('fs');

// Импорт модулей синхронизации
const { 
    getProjectsWithSyncTag, 
    getProjectTags, 
    createSyncTag, 
    syncProjectsToDatabase,
    syncProjectsToSupabase,
    updateProjectsFromWorksection,
    syncStagesFromWorksection,
    syncObjectsFromWorksection,
    syncSectionsFromWorksection,
    validateHierarchyConsistency,
    generateSystemStatusReport,
    cleanupOrphanedRecords,
    checkSyncHealth
} = require('../functions/projects');

// Создаём папку для логов если не существует
const logsDir = path.join(__dirname, '..', 'logs');
const reportsDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

// Функция для записи логов в файл
const writeLogToFile = (logEntry, logType = 'sync') => {
    const date = new Date().toISOString().slice(0, 10);
    const logFileName = `${logType}_${date}.log`;
    const logPath = path.join(logsDir, logFileName);
    
    const timestamp = new Date().toISOString();
    const formattedEntry = `[${timestamp}] ${logEntry}\n`;
    
    try {
        fs.appendFileSync(logPath, formattedEntry);
    } catch (error) {
        console.error('Ошибка записи в лог файл:', error);
    }
};

// Функция для создания отчёта о синхронизации
const createSyncReport = (syncResult) => {
    const timestamp = new Date().toISOString();
    const date = timestamp.slice(0, 10);
    const reportFileName = `sync_report_${timestamp.replace(/[:.]/g, '-')}.json`;
    const reportPath = path.join(reportsDir, reportFileName);
    
    const report = {
        ...syncResult,
        report_metadata: {
            generated_at: timestamp,
            report_type: 'sync_report',
            version: '1.0.0'
        }
    };
    
    try {
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`📄 Отчёт создан: ${reportFileName}`);
        return reportFileName;
    } catch (error) {
        console.error('Ошибка создания отчёта:', error);
        return null;
    }
};

// Функция для получения списка отчётов
const getReportsList = () => {
    try {
        const files = fs.readdirSync(reportsDir);
        return files
            .filter(file => file.startsWith('sync_report_') && file.endsWith('.json'))
            .map(file => {
                const stat = fs.statSync(path.join(reportsDir, file));
                return {
                    filename: file,
                    created_at: stat.birthtime,
                    size: stat.size,
                    path: `/api/reports/download/${file}`
                };
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
        console.error('Ошибка получения списка отчётов:', error);
        return [];
    }
};

class WSToWorkApp {
    constructor() {
        this.app = express();
        
        this.stats = {
            totalRequests: 0,
            successRequests: 0,
            errorRequests: 0,
            avgResponseTime: 0,
            lastSyncDate: null,
            projectsCount: 0,
            tasksCount: 0,
            startTime: Date.now()
        };
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        // CORS
        this.app.use(cors());
        
        // JSON парсинг
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Статические файлы
        this.app.use(express.static(path.join(__dirname, '../public')));
        
        // Middleware для логирования запросов
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            const logEntry = `${req.method} ${req.url} - ${req.ip}`;
            
            writeLogToFile(logEntry, 'access');
            console.log(`📝 ${logEntry}`);
            
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                const statusLogEntry = `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`;
                writeLogToFile(statusLogEntry, 'access');
                
                this.updateStats('request', duration, res.statusCode < 400);
            });
            
            next();
        });
    }

    setupRoutes() {
        // Главная страница
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        // API для проверки здоровья
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'ok',
                uptime: Date.now() - this.stats.startTime,
                memory: process.memoryUsage(),
                stats: this.stats
            });
        });

        // API для получения статуса сервера
        this.app.get('/api/status', (req, res) => {
            const uptime = Date.now() - this.stats.uptime;
            
            res.json({
                success: true,
                status: 'running',
                uptime: Math.floor(uptime / 1000),
                stats: this.stats,
                environment: {
                    platform: process.platform,
                    node_version: process.version,
                    working_directory: process.cwd(),
                    memory_usage: process.memoryUsage(),
                    cpu_usage: process.cpuUsage()
                },
                configuration: {
                    supabase_configured: !!process.env.SUPABASE_URL,
                    worksection_configured: !!process.env.WORKSECTION_HASH,
                    logs_enabled: true,
                    reports_enabled: true
                }
            });
        });

        // API для получения логов
        this.app.get('/api/logs/:type?', (req, res) => {
            const logType = req.params.type || 'sync';
            const date = req.query.date || new Date().toISOString().slice(0, 10);
            const logFileName = `${logType}_${date}.log`;
            const logPath = path.join(logsDir, logFileName);
            
            try {
                if (fs.existsSync(logPath)) {
                    const logContent = fs.readFileSync(logPath, 'utf8');
                    const lines = logContent.split('\n').filter(line => line.trim());
                    
                    res.json({
                        success: true,
                        date,
                        type: logType,
                        total_lines: lines.length,
                        logs: lines
                    });
                } else {
                    res.json({
                        success: true,
                        date,
                        type: logType,
                        total_lines: 0,
                        logs: []
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для получения списка отчётов
        this.app.get('/api/reports/list', (req, res) => {
            try {
                const reports = getReportsList();
                res.json({
                    success: true,
                    total: reports.length,
                    reports
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для скачивания отчёта
        this.app.get('/api/reports/download/:filename', (req, res) => {
            const filename = req.params.filename;
            const reportPath = path.join(reportsDir, filename);
            
            try {
                if (fs.existsSync(reportPath)) {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    res.sendFile(reportPath);
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Отчёт не найден'
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для синхронизации проектов
        this.app.post('/api/projects/sync', async (req, res) => {
            try {
                writeLogToFile('🏢 Запуск синхронизации проектов...', 'sync');
                console.log('🏢 Запуск синхронизации проектов...');
                
                const result = await syncProjectsToSupabase();
                
                writeLogToFile(`✅ Синхронизация проектов завершена: ${JSON.stringify(result.summary || result)}`, 'sync');
                res.json(result);

            } catch (error) {
                writeLogToFile(`❌ Ошибка синхронизации проектов: ${error.message}`, 'sync');
                console.error('❌ Ошибка синхронизации проектов:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Тестирование подключения удалено - используется только синхронизация

        // API для получения проектов
        this.app.get('/api/projects', async (req, res) => {
            try {
                console.log('📁 Получение списка проектов из Worksection...');

                const { makeWorksectionRequest } = require('../functions/worksection-api');
                const response = await makeWorksectionRequest('get_projects');
                
                if (response.statusCode === 200 && response.data.status === 'ok') {
                    const projects = response.data.data || [];
                    
                    console.log(`✅ Получено ${projects.length} проектов`);

                    res.json({
                        success: true,
                        projects: projects.slice(0, 10), // Первые 10 для примера
                        total: projects.length
                    });
                } else {
                    throw new Error(response.data.message || 'Неизвестная ошибка API');
                }

            } catch (error) {
                console.error('❌ Ошибка получения проектов:', error.message);

                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для получения статистики
        this.app.get('/api/stats', (req, res) => {
            res.json({
                success: true,
                stats: {
                    ...this.stats,
                    uptime: Date.now() - this.stats.startTime
                }
            });
        });

        // ======= НОВЫЕ API ДЛЯ РАБОТЫ С ПРОЕКТАМИ =======

        // API для получения проектов с меткой "eneca.work sync"
        this.app.get('/api/projects/with-sync-tag', async (req, res) => {
            try {
                console.log('🔍 Получение проектов с меткой sync...');
                
                const result = await getProjectsWithSyncTag();
                
                res.json(result);

            } catch (error) {
                console.error('❌ Ошибка получения sync проектов:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для получения всех тегов проектов
        this.app.get('/api/projects/tags', async (req, res) => {
            try {
                console.log('🏷️ Получение тегов проектов...');
                
                const result = await getProjectTags();
                
                res.json(result);

            } catch (error) {
                console.error('❌ Ошибка получения тегов:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для получения проектов из Supabase
        this.app.get('/api/supabase/projects', async (req, res) => {
            try {
                console.log('📊 Получение проектов из Supabase...');
                
                // Используем реальные запросы к Supabase API
                const { getAllProjects, getProjectsWithExternalId } = require('../functions/supabase-client');
                
                const allSupabaseProjects = await getAllProjects();
                const supabaseProjects = await getProjectsWithExternalId();
                
                console.log(`📊 Всего проектов в Supabase: ${allSupabaseProjects.length}`);
                console.log(`🔗 Проектов с external_id: ${supabaseProjects.length}`);
                
                res.json({
                    success: true,
                    projects_with_external_id: supabaseProjects,
                    total_projects: allSupabaseProjects.length,
                    external_projects: supabaseProjects.length,
                    local_projects: allSupabaseProjects.length - supabaseProjects.length,
                    message: `Найдено ${supabaseProjects.length} проектов с external_id из ${allSupabaseProjects.length} общих`
                });
                
            } catch (error) {
                console.error('❌ Ошибка получения проектов из Supabase:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для синхронизации проектов с автоматическим созданием новых
        this.app.post('/api/projects/sync-auto', async (req, res) => {
            try {
                console.log('🔄 Запуск автоматической синхронизации проектов...');
                
                const result = await syncProjectsToSupabase();
                
                res.json(result);

            } catch (error) {
                console.error('❌ Ошибка автоматической синхронизации:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для обновления проектов (название и менеджер)
        this.app.post('/api/projects/update', async (req, res) => {
            try {
                console.log('🔄 Запуск обновления проектов...');
                
                const result = await updateProjectsFromWorksection();
                
                res.json(result);

            } catch (error) {
                console.error('❌ Ошибка обновления проектов:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для синхронизации стадий из меток Worksection
        this.app.post('/api/stages/sync', async (req, res) => {
            try {
                writeLogToFile('🎯 Запуск синхронизации стадий...', 'sync');
                console.log('🎯 Запуск синхронизации стадий...');
                
                const result = await syncStagesFromWorksection();
                
                writeLogToFile(`✅ Синхронизация стадий завершена: ${JSON.stringify(result.summary || result)}`, 'sync');
                res.json(result);

            } catch (error) {
                writeLogToFile(`❌ Ошибка синхронизации стадий: ${error.message}`, 'sync');
                console.error('❌ Ошибка синхронизации стадий:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для синхронизации объектов из задач Worksection
        this.app.post('/api/objects/sync', async (req, res) => {
            try {
                writeLogToFile('📦 Запуск синхронизации объектов...', 'sync');
                console.log('📦 Запуск синхронизации объектов...');
                
                const result = await syncObjectsFromWorksection();
                
                writeLogToFile(`✅ Синхронизация объектов завершена: ${JSON.stringify(result.summary || result)}`, 'sync');
                res.json(result);

            } catch (error) {
                writeLogToFile(`❌ Ошибка синхронизации объектов: ${error.message}`, 'sync');
                console.error('❌ Ошибка синхронизации объектов:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для синхронизации разделов из подзадач Worksection
        this.app.post('/api/sections/sync', async (req, res) => {
            try {
                writeLogToFile('📑 Запуск синхронизации разделов...', 'sync');
                console.log('📑 Запуск синхронизации разделов...');
                
                const result = await syncSectionsFromWorksection();
                
                writeLogToFile(`✅ Синхронизация разделов завершена: ${JSON.stringify(result.summary || result)}`, 'sync');
                res.json(result);

            } catch (error) {
                writeLogToFile(`❌ Ошибка синхронизации разделов: ${error.message}`, 'sync');
                console.error('❌ Ошибка синхронизации разделов:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для полной синхронизации всех данных
        this.app.post('/api/sync/full', async (req, res) => {
            try {
                writeLogToFile('🚀 Запуск ПОЛНОЙ синхронизации всех данных...', 'sync');
                console.log('🚀 Запуск ПОЛНОЙ синхронизации всех данных...');
                
                const result = await this.runFullSync();
                
                // Создаём отчёт о синхронизации
                const reportFileName = createSyncReport(result);
                if (reportFileName) {
                    result.report_filename = reportFileName;
                }
                
                writeLogToFile(`✅ Полная синхронизация завершена: ${JSON.stringify(result.summary)}`, 'sync');
                this.stats.lastSyncDate = new Date().toISOString();
                
                res.json(result);

            } catch (error) {
                writeLogToFile(`❌ Ошибка полной синхронизации: ${error.message}`, 'sync');
                console.error('❌ Ошибка полной синхронизации:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    logs: [`❌ Критическая ошибка: ${error.message}`]
                });
            }
        });

        // API для проверки целостности данных
        this.app.get('/api/validate/hierarchy', async (req, res) => {
            try {
                writeLogToFile('🔍 Запуск проверки целостности иерархии...', 'validation');
                console.log('🔍 Запуск проверки целостности иерархии...');
                
                const result = await validateHierarchyConsistency();
                
                writeLogToFile(`✅ Проверка целостности завершена: ${JSON.stringify(result.summary || result)}`, 'validation');
                res.json(result);

            } catch (error) {
                writeLogToFile(`❌ Ошибка проверки целостности: ${error.message}`, 'validation');
                console.error('❌ Ошибка проверки целостности:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для получения детального отчёта о состоянии системы
        this.app.get('/api/report/system-status', async (req, res) => {
            try {
                writeLogToFile('📊 Генерация отчёта о состоянии системы...', 'report');
                console.log('📊 Генерация отчёта о состоянии системы...');
                
                const result = await generateSystemStatusReport();
                
                writeLogToFile(`✅ Отчёт о состоянии системы создан`, 'report');
                res.json(result);

            } catch (error) {
                writeLogToFile(`❌ Ошибка генерации отчёта: ${error.message}`, 'report');
                console.error('❌ Ошибка генерации отчёта:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для очистки orphaned записей
        this.app.post('/api/maintenance/cleanup-orphaned', async (req, res) => {
            try {
                writeLogToFile('🧹 Запуск очистки orphaned записей...', 'maintenance');
                console.log('🧹 Запуск очистки orphaned записей...');
                
                const result = await cleanupOrphanedRecords(req.body);
                
                writeLogToFile(`✅ Очистка orphaned записей завершена: ${JSON.stringify(result.summary || result)}`, 'maintenance');
                res.json(result);

            } catch (error) {
                writeLogToFile(`❌ Ошибка очистки orphaned записей: ${error.message}`, 'maintenance');
                console.error('❌ Ошибка очистки orphaned записей:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API для проверки здоровья синхронизации
        this.app.get('/api/health/sync-status', async (req, res) => {
            try {
                writeLogToFile('🏥 Проверка здоровья системы синхронизации...', 'health');
                console.log('🏥 Проверка здоровья системы синхронизации...');
                
                const result = await checkSyncHealth();
                
                writeLogToFile(`✅ Проверка здоровья завершена: ${JSON.stringify(result.summary || result)}`, 'health');
                res.json(result);

            } catch (error) {
                writeLogToFile(`❌ Ошибка проверки здоровья синхронизации: ${error.message}`, 'health');
                console.error('❌ Ошибка проверки здоровья синхронизации:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    async syncProjects(params = {}) {
        const { makeWorksectionRequest } = require('../functions/worksection-api');
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        console.log('📊 Получение проектов из Worksection...');
        
        await delay(1000);
        
        const projects = await makeWorksectionRequest('get_projects');
        if (projects.statusCode !== 200 || projects.data.status !== 'ok') {
            throw new Error('Не удалось получить проекты из Worksection');
        }
        
        const projectsData = projects.data.data || [];
        
        console.log(`🔄 Обработка ${projectsData.length} проектов...`);
        
        await delay(1500);
        
        // Симуляция обработки задач
        let totalTasks = 0;
        for (let i = 0; i < Math.min(5, projectsData.length); i++) {
            const project = projectsData[i];
            console.log(`📋 Обработка проекта: ${project.name}`);
            
            const tasks = await makeWorksectionRequest('get_tasks', { id_project: project.id });
            if (tasks.statusCode === 200 && tasks.data.status === 'ok') {
                const tasksCount = tasks.data.data?.length || 0;
                totalTasks += tasksCount;
                
                console.log(`   - Найдено ${tasksCount} задач`);
            }
            
            await delay(500);
        }
        
        console.log('💾 Запись данных в Supabase...');
        
        await delay(1000);
        
        const result = {
            projectsCount: projectsData.length,
            tasksCount: totalTasks,
            duration: '3.2s',
            timestamp: new Date().toISOString()
        };
        
        // Обновляем статистику
        this.stats.projectsCount = result.projectsCount;
        this.stats.tasksCount = result.tasksCount;
        this.stats.successRequests += 1;
        
        return result;
    }

    async runFullSync() {
        const startTime = Date.now();
        const logs = [];
        const detailedLogs = [];
        const results = {
            projects: null,
            stages: null,
            objects: null,
            sections: null
        };
        
        let totalCreated = 0;
        let totalUpdated = 0;
        let totalUnchanged = 0;
        let totalErrors = 0;
        let warnings = [];
        let criticalErrors = [];
        
        // Функция для добавления логов с временными метками
        const addLog = (message, level = 'info', details = null) => {
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ${message}`;
            
            logs.push(logEntry);
            
            if (details) {
                detailedLogs.push({
                    timestamp,
                    level,
                    message,
                    details
                });
            }
            
            console.log(logEntry);
        };
        
        // Функция для обработки ошибок с retry логикой
        const executeWithRetry = async (operation, operationName, maxRetries = 3, delay = 1000) => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    addLog(`🔄 ${operationName} - попытка ${attempt}/${maxRetries}`);
                    const result = await operation();
                    addLog(`✅ ${operationName} - успешно выполнено`);
                    return result;
                } catch (error) {
                    const errorMsg = `❌ ${operationName} - ошибка на попытке ${attempt}/${maxRetries}: ${error.message}`;
                    addLog(errorMsg, 'error', { attempt, maxRetries, error: error.message });
                    
                    if (attempt < maxRetries) {
                        addLog(`⏳ Ожидание ${delay}мс перед повторной попыткой...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2; // Экспоненциальный backoff
                    } else {
                        criticalErrors.push(`${operationName}: ${error.message}`);
                        throw error;
                    }
                }
            }
        };
        
        // Функция валидации результата синхронизации
        const validateSyncResult = (result, entityType) => {
            if (!result) {
                warnings.push(`${entityType}: результат синхронизации пустой`);
                return false;
            }
            
            if (typeof result.success !== 'boolean') {
                warnings.push(`${entityType}: отсутствует флаг success в результате`);
                return false;
            }
            
            if (!result.data && !result.summary) {
                warnings.push(`${entityType}: отсутствуют данные и сводка в результате`);
                return false;
            }
            
            return true;
        };
        
        // Функция для сбора статистики
        const collectStats = (result, entityType) => {
            if (!validateSyncResult(result, entityType)) {
                return { created: 0, updated: 0, unchanged: 0, errors: 1 };
            }
            
            const summary = result.summary || {};
            const data = result.data || {};
            
            return {
                created: summary.created || data.created?.length || 0,
                updated: summary.updated || data.updated?.length || 0,
                unchanged: summary.unchanged || data.unchanged?.length || 0,
                errors: summary.errors || data.errors?.length || 0
            };
        };
        
        // Функция для детального логирования результатов
        const logDetailedResults = (result, entityType, stats) => {
            if (!result || !result.success) return;
            
            const data = result.data || {};
            
            // Логируем созданные элементы
            if (data.created && data.created.length > 0) {
                addLog(`  📝 Созданные ${entityType.toLowerCase()}:`);
                data.created.slice(0, 10).forEach(item => { // Показываем только первые 10
                    const name = item[`${entityType.toLowerCase()}_name`] || 
                                item.project_name || 
                                item.section?.section_name || 
                                'Без названия';
                    const id = item[`${entityType.toLowerCase()}_id`] || 
                              item.project_id || 
                              item.section?.section_id || 
                              'N/A';
                    addLog(`    + ${name} (ID: ${id})`);
                });
                
                if (data.created.length > 10) {
                    addLog(`    ... и ещё ${data.created.length - 10} элементов`);
                }
            }
            
            // Логируем обновлённые элементы
            if (data.updated && data.updated.length > 0) {
                addLog(`  🔄 Обновлённые ${entityType.toLowerCase()}:`);
                data.updated.slice(0, 5).forEach(item => {
                    const name = item[`${entityType.toLowerCase()}_name`] || 
                                item.project_name || 
                                item.section?.section_name || 
                                'Без названия';
                    addLog(`    ↻ ${name}`);
                });
                
                if (data.updated.length > 5) {
                    addLog(`    ... и ещё ${data.updated.length - 5} элементов`);
                }
            }
            
            // Логируем ошибки
            if (data.errors && data.errors.length > 0) {
                addLog(`  ❌ Ошибки ${entityType.toLowerCase()}:`);
                data.errors.slice(0, 5).forEach(error => {
                    const errorMsg = typeof error === 'string' ? error : 
                                   error.error || error.message || JSON.stringify(error);
                    addLog(`    ⚠️ ${errorMsg}`);
                });
                
                if (data.errors.length > 5) {
                    addLog(`    ... и ещё ${data.errors.length - 5} ошибок`);
                }
            }
        };
        
        // Функция для проверки доступности API
        const checkAPIAvailability = async () => {
            try {
                addLog('🔌 Проверка доступности Supabase...');
                
                // Проверка Supabase
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(
                    process.env.SUPABASE_URL,
                    process.env.SUPABASE_ANON_KEY
                );
                
                const { data: healthCheck, error } = await supabase
                    .from('projects')
                    .select('project_id')
                    .limit(1);
                
                if (error) {
                    throw new Error(`Supabase недоступен: ${error.message}`);
                }
                
                addLog('✅ Supabase доступен');
                
                // Проверка Worksection API
                addLog('🔌 Проверка доступности Worksection API...');
                const { makeWorksectionRequest } = require('../functions/worksection-api');
                
                try {
                    await makeWorksectionRequest('get_projects', { page: 1 });
                    addLog('✅ Worksection API доступен');
                } catch (apiError) {
                    throw new Error(`Worksection API недоступен: ${apiError.message}`);
                }
                
                return true;
            } catch (error) {
                addLog(`❌ Ошибка проверки API: ${error.message}`, 'error');
                return false;
            }
        };
        
        // Функция для валидации конфигурации
        const validateConfiguration = () => {
            const configErrors = [];
            const configWarnings = [];
            
            // Проверка обязательных переменных
            if (!process.env.SUPABASE_URL) configErrors.push('SUPABASE_URL не задан');
            if (!process.env.SUPABASE_ANON_KEY) configErrors.push('SUPABASE_ANON_KEY не задан');
            if (!process.env.WORKSECTION_HASH) configErrors.push('WORKSECTION_HASH не задан');
            if (!process.env.WORKSECTION_DOMAIN) configErrors.push('WORKSECTION_DOMAIN не задан');
            
            // Проверка формата переменных
            if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.startsWith('https://')) {
                configWarnings.push('URL Supabase должен начинаться с https://');
            }
            
            if (process.env.WORKSECTION_DOMAIN && !process.env.WORKSECTION_DOMAIN.includes('.worksection.')) {
                configWarnings.push('Домен Worksection должен содержать .worksection.');
            }
            
            if (process.env.WORKSECTION_HASH && process.env.WORKSECTION_HASH.length !== 32) {
                configWarnings.push('API ключ Worksection должен содержать 32 символа');
            }
            
            // Проверка опциональных переменных производительности
            const optionalVars = {
                'SYNC_BATCH_SIZE': 'Размер батча для синхронизации',
                'SYNC_REQUEST_DELAY': 'Задержка между запросами',
                'SYNC_MAX_RETRIES': 'Максимальное количество повторных попыток'
            };
            
            Object.entries(optionalVars).forEach(([varName, description]) => {
                if (!process.env[varName]) {
                    configWarnings.push(`${varName} не задан - используется значение по умолчанию (${description})`);
                }
            });
            
            return { errors: configErrors, warnings: configWarnings };
        };
        
        try {
            addLog('🚀 === НАЧАЛО ПОЛНОЙ СИНХРОНИЗАЦИИ ===');
            addLog(`⏰ Время начала: ${new Date().toLocaleString('ru-RU')}`);
            addLog(`🖥️ Операционная система: ${process.platform}`);
            addLog(`📂 Рабочая директория: ${process.cwd()}`);
            addLog(`🔗 URL Supabase: ${process.env.SUPABASE_URL ? 'настроен' : 'НЕ НАСТРОЕН'}`);
            addLog(`🔑 API ключ Worksection: ${process.env.WORKSECTION_HASH ? 'настроен' : 'НЕ НАСТРОЕН'}`);
            addLog(`🌐 Домен Worksection: ${process.env.WORKSECTION_DOMAIN ? 'настроен' : 'НЕ НАСТРОЕН'}`);
            addLog('');
            
            // Расширенная проверка конфигурации
            addLog('🔍 Валидация конфигурации системы...');
            const configValidation = validateConfiguration();
            
            if (configValidation.errors.length > 0) {
                configValidation.errors.forEach(error => addLog(`❌ ${error}`, 'error'));
                throw new Error(`Критические ошибки конфигурации: ${configValidation.errors.join(', ')}`);
            }
            
            if (configValidation.warnings.length > 0) {
                addLog('⚠️ Предупреждения конфигурации:');
                configValidation.warnings.forEach(warning => {
                    addLog(`  ⚠️ ${warning}`);
                    warnings.push(warning);
                });
                addLog('');
            } else {
                addLog('✅ Конфигурация корректна');
            }
            
            // Проверка доступности API
            const apiAvailable = await checkAPIAvailability();
            if (!apiAvailable) {
                throw new Error('API недоступны - проверьте сетевое соединение и настройки');
            }
            
            addLog('');
            
            // 1. Синхронизация проектов (обязательно первая)
            addLog('🏢 ЭТАП 1/4: Синхронизация проектов...');
            try {
                results.projects = await executeWithRetry(
                    () => syncProjectsToSupabase(),
                    'Синхронизация проектов'
                );
                
                const projectStats = collectStats(results.projects, 'Project');
                totalCreated += projectStats.created;
                totalUpdated += projectStats.updated;
                totalUnchanged += projectStats.unchanged;
                totalErrors += projectStats.errors;
                
                addLog(`✅ Проекты: создано ${projectStats.created}, обновлено ${projectStats.updated}, без изменений ${projectStats.unchanged}, ошибок ${projectStats.errors}`);
                
                logDetailedResults(results.projects, 'Project', projectStats);
                
                if (projectStats.created === 0 && projectStats.updated === 0 && projectStats.unchanged === 0) {
                    warnings.push('Не найдено проектов для синхронизации - проверьте метку "eneca.work sync"');
                }
                
            } catch (error) {
                addLog(`❌ Критическая ошибка проектов: ${error.message}`, 'error');
                totalErrors++;
                criticalErrors.push(`Проекты: ${error.message}`);
                
                // Если проекты не синхронизировались, можем продолжить с существующими
                addLog('⚠️ Продолжаем с существующими проектами в БД...');
            }
            
            addLog('');
            
            // 2. Синхронизация стадий
            addLog('🎯 ЭТАП 2/4: Синхронизация стадий...');
            try {
                results.stages = await executeWithRetry(
                    () => syncStagesFromWorksection(),
                    'Синхронизация стадий'
                );
                
                const stageStats = collectStats(results.stages, 'Stage');
                totalCreated += stageStats.created;
                totalUpdated += stageStats.updated;
                totalUnchanged += stageStats.unchanged;
                totalErrors += stageStats.errors;
                
                addLog(`✅ Стадии: создано ${stageStats.created}, обновлено ${stageStats.updated}, без изменений ${stageStats.unchanged}, ошибок ${stageStats.errors}`);
                
                logDetailedResults(results.stages, 'Stage', stageStats);
                
                if (stageStats.created === 0 && stageStats.updated === 0 && stageStats.unchanged === 0) {
                    warnings.push('Не найдено стадий для синхронизации - проверьте метки проектов');
                }
                
            } catch (error) {
                addLog(`❌ Критическая ошибка стадий: ${error.message}`, 'error');
                totalErrors++;
                criticalErrors.push(`Стадии: ${error.message}`);
            }
            
            addLog('');
            
            // 3. Синхронизация объектов
            addLog('📦 ЭТАП 3/4: Синхронизация объектов...');
            try {
                results.objects = await executeWithRetry(
                    () => syncObjectsFromWorksection(),
                    'Синхронизация объектов'
                );
                
                const objectStats = collectStats(results.objects, 'Object');
                totalCreated += objectStats.created;
                totalUpdated += objectStats.updated;
                totalUnchanged += objectStats.unchanged;
                totalErrors += objectStats.errors;
                
                addLog(`✅ Объекты: создано ${objectStats.created}, обновлено ${objectStats.updated}, без изменений ${objectStats.unchanged}, ошибок ${objectStats.errors}`);
                
                logDetailedResults(results.objects, 'Object', objectStats);
                
                if (objectStats.created === 0 && objectStats.updated === 0 && objectStats.unchanged === 0) {
                    warnings.push('Не найдено объектов для синхронизации - проверьте задачи в проектах');
                }
                
            } catch (error) {
                addLog(`❌ Критическая ошибка объектов: ${error.message}`, 'error');
                totalErrors++;
            }
            
            addLog('');
            
            // 4. Синхронизация разделов
            addLog('📑 ЭТАП 4/4: Синхронизация разделов...');
            try {
                results.sections = await executeWithRetry(
                    () => syncSectionsFromWorksection(),
                    'Синхронизация разделов'
                );
                
                const sectionStats = collectStats(results.sections, 'Section');
                totalCreated += sectionStats.created;
                totalUpdated += sectionStats.updated;
                totalUnchanged += sectionStats.unchanged;
                totalErrors += sectionStats.errors;
                
                addLog(`✅ Разделы: создано ${sectionStats.created}, обновлено ${sectionStats.updated}, без изменений ${sectionStats.unchanged}, ошибок ${sectionStats.errors}`);
                
                logDetailedResults(results.sections, 'Section', sectionStats);
                
                if (sectionStats.created === 0 && sectionStats.updated === 0 && sectionStats.unchanged === 0) {
                    warnings.push('Не найдено разделов для синхронизации - проверьте подзадачи');
                }
                
            } catch (error) {
                addLog(`❌ Критическая ошибка разделов: ${error.message}`, 'error');
                totalErrors++;
            }
            
            // Итоговая статистика и анализ
            const duration = Date.now() - startTime;
            const durationSeconds = (duration / 1000).toFixed(1);
            const totalOperations = totalCreated + totalUpdated + totalUnchanged + totalErrors;
            
            addLog('');
            addLog('🏁 === ЗАВЕРШЕНИЕ ПОЛНОЙ СИНХРОНИЗАЦИИ ===');
            addLog(`⏱️ Общее время выполнения: ${durationSeconds} сек`);
            addLog(`📊 Всего операций: ${totalOperations}`);
            addLog(`🆕 Всего создано: ${totalCreated}`);
            addLog(`🔄 Всего обновлено: ${totalUpdated}`);
            addLog(`✅ Без изменений: ${totalUnchanged}`);
            addLog(`❌ Всего ошибок: ${totalErrors}`);
            
            // Анализ производительности
            if (totalOperations > 0) {
                const operationsPerSecond = (totalOperations / (duration / 1000)).toFixed(1);
                addLog(`⚡ Производительность: ${operationsPerSecond} операций/сек`);
                
                // Анализ производительности с рекомендациями
                if (operationsPerSecond < 5) {
                    warnings.push('Низкая производительность синхронизации - проверьте сетевое соединение');
                } else if (operationsPerSecond > 50) {
                    addLog('🚀 Отличная производительность синхронизации!');
                }
            }
            
            // Постпроверка целостности данных после синхронизации
            addLog('');
            addLog('🔍 ПОСТПРОВЕРКА ЦЕЛОСТНОСТИ ДАННЫХ...');
            try {
                // Подключаем функции диагностики
                const { validateHierarchyConsistency } = require('../functions/projects');
                
                const hierarchyCheck = await validateHierarchyConsistency();
                if (hierarchyCheck.success && hierarchyCheck.data) {
                    const data = hierarchyCheck.data;
                    const issues = (data.orphaned_stages?.length || 0) + 
                                   (data.orphaned_objects?.length || 0) + 
                                   (data.orphaned_sections?.length || 0) + 
                                   (data.duplicate_external_ids?.length || 0);
                    
                    if (issues === 0) {
                        addLog('✅ Целостность данных подтверждена - orphaned записей не найдено');
                    } else {
                        addLog(`⚠️ Обнаружено проблем целостности: ${issues}`);
                        if (data.orphaned_stages?.length > 0) {
                            addLog(`  📝 Orphaned стадий: ${data.orphaned_stages.length}`);
                        }
                        if (data.orphaned_objects?.length > 0) {
                            addLog(`  📦 Orphaned объектов: ${data.orphaned_objects.length}`);
                        }
                        if (data.orphaned_sections?.length > 0) {
                            addLog(`  📑 Orphaned разделов: ${data.orphaned_sections.length}`);
                        }
                        if (data.duplicate_external_ids?.length > 0) {
                            addLog(`  🔄 Дубликатов external_id: ${data.duplicate_external_ids.length}`);
                        }
                        warnings.push('Найдены проблемы целостности данных - рекомендуется очистка');
                    }
                } else {
                    addLog('⚠️ Ошибка проверки целостности данных');
                    warnings.push('Не удалось проверить целостность данных');
                }
            } catch (error) {
                addLog(`⚠️ Ошибка постпроверки: ${error.message}`);
                warnings.push('Не удалось выполнить постпроверку целостности');
            }
            
            // Генерация рекомендаций по улучшению
            addLog('');
            addLog('💡 РЕКОМЕНДАЦИИ ПО УЛУЧШЕНИЮ:');
            
            const recommendations = [];
            
            // Рекомендации по производительности
            if (totalOperations > 0 && (totalOperations / (duration / 1000)) < 10) {
                recommendations.push('Рассмотрите увеличение SYNC_BATCH_SIZE для улучшения производительности');
            }
            
            // Рекомендации по ошибкам
            if (totalErrors > 0) {
                recommendations.push('Проверьте логи ошибок и устраните проблемы перед следующей синхронизацией');
            }
            
            // Рекомендации по данным
            if (totalCreated === 0 && totalUpdated === 0) {
                recommendations.push('Убедитесь, что проекты в Worksection имеют метку "eneca.work sync"');
            }
            
            if (recommendations.length > 0) {
                recommendations.forEach((rec, index) => {
                    addLog(`  ${index + 1}. ${rec}`);
                });
            } else {
                addLog('  ✨ Система работает оптимально, рекомендаций нет');
            }
            
            // Вывод предупреждений
            if (warnings.length > 0) {
                addLog('');
                addLog('⚠️ ПРЕДУПРЕЖДЕНИЯ:');
                warnings.forEach((warning, index) => {
                    addLog(`  ${index + 1}. ${warning}`);
                });
            }
            
            // Вывод критических ошибок
            if (criticalErrors.length > 0) {
                addLog('');
                addLog('🚨 КРИТИЧЕСКИЕ ОШИБКИ:');
                criticalErrors.forEach((error, index) => {
                    addLog(`  ${index + 1}. ${error}`);
                });
            }
            
            addLog(`⏰ Время завершения: ${new Date().toLocaleString('ru-RU')}`);
            
            const success = totalErrors === 0 && criticalErrors.length === 0;
            const hasWarnings = warnings.length > 0;
            
            if (success && !hasWarnings) {
                addLog('🎉 ПОЛНАЯ СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА УСПЕШНО!');
            } else if (success && hasWarnings) {
                addLog('✅ ПОЛНАЯ СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА УСПЕШНО С ПРЕДУПРЕЖДЕНИЯМИ');
            } else {
                addLog('⚠️ ПОЛНАЯ СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА С ОШИБКАМИ');
            }
            
            // Создание структурированного отчёта
            const report = {
                success,
                duration: durationSeconds,
                summary: {
                    total_operations: totalOperations,
                    created: totalCreated,
                    updated: totalUpdated,
                    unchanged: totalUnchanged,
                    errors: totalErrors,
                    warnings: warnings.length,
                    critical_errors: criticalErrors.length,
                    performance: totalOperations > 0 ? 
                        parseFloat((totalOperations / (duration / 1000)).toFixed(1)) : 0
                },
                details: {
                    projects: results.projects,
                    stages: results.stages,
                    objects: results.objects,
                    sections: results.sections
                },
                issues: {
                    warnings,
                    critical_errors: criticalErrors
                },
                logs,
                detailed_logs: detailedLogs,
                metadata: {
                    timestamp: new Date().toISOString(),
                    duration_ms: duration,
                    environment: {
                        platform: process.platform,
                        node_version: process.version,
                        working_directory: process.cwd()
                    },
                    configuration: {
                        supabase_configured: !!process.env.SUPABASE_URL,
                        worksection_configured: !!process.env.WORKSECTION_HASH,
                        retry_attempts: 3
                    }
                }
            };
            
            return report;
            
        } catch (error) {
            const duration = Date.now() - startTime;
            const durationSeconds = (duration / 1000).toFixed(1);
            
            addLog(`❌ КРИТИЧЕСКАЯ ОШИБКА ПОЛНОЙ СИНХРОНИЗАЦИИ: ${error.message}`, 'error');
            criticalErrors.push(`Общая ошибка: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                duration: durationSeconds,
                summary: {
                    total_operations: totalCreated + totalUpdated + totalUnchanged + totalErrors + 1,
                    created: totalCreated,
                    updated: totalUpdated,
                    unchanged: totalUnchanged,
                    errors: totalErrors + 1,
                    warnings: warnings.length,
                    critical_errors: criticalErrors.length,
                    performance: 0
                },
                details: results,
                issues: {
                    warnings,
                    critical_errors: criticalErrors
                },
                logs,
                detailed_logs: detailedLogs,
                metadata: {
                    timestamp: new Date().toISOString(),
                    duration_ms: duration,
                    environment: {
                        platform: process.platform,
                        node_version: process.version,
                        working_directory: process.cwd()
                    },
                    configuration: {
                        supabase_configured: !!process.env.SUPABASE_URL,
                        worksection_configured: !!process.env.WORKSECTION_HASH,
                        retry_attempts: 3
                    }
                }
            };
        }
    }

    updateStats(type, duration, success) {
        this.stats.totalRequests += 1;
        
        if (success) {
            this.stats.successRequests += 1;
        } else {
            this.stats.errorRequests += 1;
        }
        
        // Обновляем среднее время ответа
        if (this.stats.avgResponseTime === 0) {
            this.stats.avgResponseTime = duration;
        } else {
            this.stats.avgResponseTime = Math.round(
                (this.stats.avgResponseTime + duration) / 2
            );
        }
    }

    setupErrorHandling() {
        // Обработка 404
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint не найден'
            });
        });

        // Глобальная обработка ошибок
        this.app.use((err, req, res, next) => {
            console.error('💥 Глобальная ошибка:', err);
            
            res.status(500).json({
                success: false,
                error: err.message
            });
        });
    }

    start() {
        const port = process.env.PORT || 3001;
        const host = process.env.HOST || 'localhost';
        
        this.app.listen(port, host, () => {
            console.log(`🚀 WS-to-Work сервер запущен на http://${host}:${port}`);
            console.log(`📊 Веб-интерфейс доступен на http://${host}:${port}`);
            console.log(`🔌 API готов для подключений`);
        });
    }
}

// Запуск приложения
if (require.main === module) {
    const app = new WSToWorkApp();
    app.start();
}

module.exports = WSToWorkApp; 