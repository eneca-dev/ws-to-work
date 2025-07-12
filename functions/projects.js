const { makeWorksectionRequest } = require('./worksection-api');
const { getAllProjects, getProjectsWithExternalId, createProject, updateProject, findUserByName, findUserByEmail, getAllStages, createStage, updateStage, findStageByExternalId, getAllObjects, createObject, updateObject, findObjectByExternalId, deleteObject, getAllSections, createSection, updateSection, findSectionByExternalId, deleteSection } = require('./supabase-client');

/**
 * УТИЛИТЫ ДЛЯ ОБРАБОТКИ ПОГРАНИЧНЫХ СЛУЧАЕВ И ВАЛИДАЦИИ
 */

/**
 * Безопасная валидация данных проекта
 */
function validateProjectData(project) {
    const errors = [];
    const warnings = [];
    
    if (!project) {
        errors.push('Проект не определён');
        return { isValid: false, errors, warnings };
    }
    
    // Обязательные поля
    if (!project.id) errors.push('Отсутствует ID проекта');
    if (!project.name || project.name.trim() === '') errors.push('Отсутствует название проекта');
    
    // Проверки на разумные ограничения
    if (project.name && project.name.length > 255) {
        warnings.push('Название проекта слишком длинное, будет обрезано до 255 символов');
    }
    
    // Проверка статуса
    if (project.status && !['active', 'done', 'freeze'].includes(project.status)) {
        warnings.push(`Неизвестный статус проекта: ${project.status}`);
    }
    
    // Проверка менеджера
    if (!project.manager_name && !project.user_to?.name) {
        warnings.push('Не найден менеджер проекта');
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Безопасная валидация данных стадии
 */
function validateStageData(stage, project) {
    const errors = [];
    const warnings = [];
    
    if (!stage) {
        errors.push('Стадия не определена');
        return { isValid: false, errors, warnings };
    }
    
    if (!stage.name || stage.name.trim() === '') errors.push('Отсутствует название стадии');
    if (!project) errors.push('Не указан родительский проект для стадии');
    
    if (stage.name && stage.name.length > 255) {
        warnings.push('Название стадии слишком длинное, будет обрезано');
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Безопасная валидация данных объекта
 */
function validateObjectData(object, stage) {
    const errors = [];
    const warnings = [];
    
    if (!object) {
        errors.push('Объект не определён');
        return { isValid: false, errors, warnings };
    }
    
    if (!object.name || object.name.trim() === '') errors.push('Отсутствует название объекта');
    if (!stage) errors.push('Не указана родительская стадия для объекта');
    
    if (object.name && object.name.length > 255) {
        warnings.push('Название объекта слишком длинное, будет обрезано');
    }
    
    // Проверка статуса
    if (object.status && !['active', 'done', 'freeze'].includes(object.status)) {
        warnings.push(`Неизвестный статус объекта: ${object.status}`);
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Безопасная валидация данных раздела
 */
function validateSectionData(section, object) {
    const errors = [];
    const warnings = [];
    
    if (!section) {
        errors.push('Раздел не определён');
        return { isValid: false, errors, warnings };
    }
    
    if (!section.name || section.name.trim() === '') errors.push('Отсутствует название раздела');
    if (!object) errors.push('Не указан родительский объект для раздела');
    
    if (section.name && section.name.length > 255) {
        warnings.push('Название раздела слишком длинное, будет обрезано');
    }
    
    // Проверка дат
    if (section.date_start && section.date_end) {
        const startDate = new Date(section.date_start);
        const endDate = new Date(section.date_end);
        
        if (startDate > endDate) {
            warnings.push('Дата начала позже даты окончания');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Безопасная обработка асинхронных операций с retry логикой
 */
async function safeExecute(operation, operationName, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await operation();
            return {
                success: true,
                data: result,
                attempt
            };
        } catch (error) {
            console.log(`❌ ${operationName} - попытка ${attempt}/${maxRetries} не удалась: ${error.message}`);
            
            if (attempt < maxRetries) {
                console.log(`⏳ Ожидание ${delay}мс перед повторной попыткой...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 1.5; // Увеличиваем задержку
            } else {
                return {
                    success: false,
                    error: error.message,
                    attempts: maxRetries
                };
            }
        }
    }
}

/**
 * Улучшенное логирование с контекстом
 */
function createLogger(context) {
    return {
        info: (message, details = null) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${context}] ℹ️ ${message}`);
            if (details) console.log('   📝 Детали:', details);
        },
        warning: (message, details = null) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${context}] ⚠️ ${message}`);
            if (details) console.log('   📝 Детали:', details);
        },
        error: (message, error = null) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${context}] ❌ ${message}`);
            if (error) {
                console.log('   🔍 Ошибка:', error.message || error);
                if (error.stack) console.log('   📚 Stack:', error.stack);
            }
        },
        success: (message, details = null) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${context}] ✅ ${message}`);
            if (details) console.log('   📊 Результат:', details);
        }
    };
}

/**
 * Проверка целостности связей в иерархии
 */
async function validateHierarchyConsistency() {
    const logger = createLogger('Валидация иерархии');
    const issues = [];
    
    try {
        logger.info('Начинаем проверку целостности иерархии...');
        
        // Проверяем проекты
        const projects = await getAllProjects();
        logger.info(`Найдено проектов: ${projects.length}`);
        
        // Проверяем стадии
        const stages = await getAllStages();
        logger.info(`Найдено стадий: ${stages.length}`);
        
        // Проверяем orphaned стадии (стадии без проектов)
        const orphanedStages = stages.filter(stage => 
            !projects.some(project => project.project_id === stage.stage_project_id)
        );
        
        if (orphanedStages.length > 0) {
            issues.push(`Найдено ${orphanedStages.length} стадий без родительских проектов`);
            logger.warning(`Orphaned стадии:`, orphanedStages.map(s => s.stage_name));
        }
        
        // Проверяем объекты
        const objects = await getAllObjects();
        logger.info(`Найдено объектов: ${objects.length}`);
        
        // Проверяем orphaned объекты
        const orphanedObjects = objects.filter(object => 
            !stages.some(stage => stage.stage_id === object.object_stage_id)
        );
        
        if (orphanedObjects.length > 0) {
            issues.push(`Найдено ${orphanedObjects.length} объектов без родительских стадий`);
            logger.warning(`Orphaned объекты:`, orphanedObjects.map(o => o.object_name));
        }
        
        // Проверяем разделы
        const sections = await getAllSections();
        logger.info(`Найдено разделов: ${sections.length}`);
        
        // Проверяем orphaned разделы
        const orphanedSections = sections.filter(section => 
            !objects.some(object => object.object_id === section.section_object_id)
        );
        
        if (orphanedSections.length > 0) {
            issues.push(`Найдено ${orphanedSections.length} разделов без родительских объектов`);
            logger.warning(`Orphaned разделы:`, orphanedSections.map(s => s.section_name));
        }
        
        // Проверяем дубликаты external_id
        const duplicateExternalIds = {};
        
        [...projects, ...stages, ...objects, ...sections].forEach(item => {
            if (item.external_id) {
                const key = `${item.external_source || 'unknown'}_${item.external_id}`;
                if (!duplicateExternalIds[key]) {
                    duplicateExternalIds[key] = [];
                }
                duplicateExternalIds[key].push(item);
            }
        });
        
        const duplicates = Object.entries(duplicateExternalIds).filter(([key, items]) => items.length > 1);
        if (duplicates.length > 0) {
            issues.push(`Найдено ${duplicates.length} дублирующихся external_id`);
            logger.warning('Дубликаты external_id:', duplicates);
        }
        
        logger.success(`Проверка завершена. Найдено проблем: ${issues.length}`);
        
        return {
            success: true,
            issues,
            statistics: {
                projects: projects.length,
                stages: stages.length,
                objects: objects.length,
                sections: sections.length,
                orphaned_stages: orphanedStages.length,
                orphaned_objects: orphanedObjects.length,
                orphaned_sections: orphanedSections.length,
                duplicate_external_ids: duplicates.length
            }
        };
        
    } catch (error) {
        logger.error('Ошибка при проверке целостности', error);
        return {
            success: false,
            error: error.message,
            issues
        };
    }
}

/**
 * Получает все проекты из Worksection с меткой "eneca.work sync"
 */
async function getProjectsWithSyncTag() {
    try {
        console.log('🔍 Получение проектов с меткой "eneca.work sync"...');
        
        // Сначала получаем все проекты с тегами и пользователями
        const allProjects = await makeWorksectionRequest('get_projects', {
            extra: 'tags,users'  // Включаем теги и пользователей в ответ
        });
        
        console.log('🔍 Полный ответ от API:', JSON.stringify(allProjects, null, 2));
        
        // Проверяем структуру ответа
        let projectsData = null;
        if (allProjects.data && allProjects.data.data && Array.isArray(allProjects.data.data)) {
            projectsData = allProjects.data.data;
        } else if (allProjects.data && Array.isArray(allProjects.data)) {
            projectsData = allProjects.data;
        } else {
            throw new Error('Не удалось получить список проектов или неправильная структура данных');
        }

        console.log(`📊 Найдено проектов всего: ${projectsData.length}`);

        // Фильтруем проекты с нужной меткой
        const syncProjects = [];
        
        for (const project of projectsData) {
            console.log(`🔍 Проект: ${project.name}, теги:`, JSON.stringify(project.tags, null, 2));
            
            // Проверяем наличие меток у проекта
            let hasSyncTag = false;
            
            if (project.tags) {
                // Если теги в виде массива объектов
                if (Array.isArray(project.tags)) {
                    hasSyncTag = project.tags.some(tag => 
                        (tag.title && tag.title.includes('eneca.work sync')) ||
                        (tag.name && tag.name.includes('eneca.work sync')) ||
                        (tag.id && tag.id === '230964') ||
                        (typeof tag === 'string' && tag.includes('eneca.work sync'))
                    );
                }
                // Если теги в виде объекта id: name (как в документации)
                else if (typeof project.tags === 'object') {
                    hasSyncTag = Object.values(project.tags).some(tagName => 
                        tagName && tagName.includes('eneca.work sync')
                    ) || Object.keys(project.tags).includes('230964');
                }
                // Если теги в виде строки
                else if (typeof project.tags === 'string') {
                    hasSyncTag = project.tags.includes('eneca.work sync');
                }
            }
            
            if (hasSyncTag) {
                console.log(`✅ Найден проект с sync тегом: ${project.name}`);
                
                // Добавляем информацию о менеджере проекта
                let managerName = null;
                let managerEmail = null;
                
                // ИСПРАВЛЕНО: Используем поле user_to для определения менеджера проекта
                // Проверяем что есть реальный менеджер (не "Без руководителя")
                if (project.user_to && project.user_to.name && 
                    project.user_to.id !== "0" && 
                    project.user_to.name !== "Без руководителя" &&
                    project.user_to.email !== "NOONE") {
                    managerName = project.user_to.name;
                    managerEmail = project.user_to.email;
                    console.log(`👤 Менеджер проекта (user_to): ${managerName} (${managerEmail})`);
                } else {
                    // Fallback: ищем среди пользователей проекта
                    if (project.users && Array.isArray(project.users)) {
                        // Ищем администратора проекта (обычно это менеджер)
                        const manager = project.users.find(user => 
                            user.role === 'admin' || user.role === 'manager' || user.is_admin
                        );
                        if (manager) {
                            managerName = manager.name || `${manager.first_name || ''} ${manager.last_name || ''}`.trim();
                            managerEmail = manager.email;
                        }
                        // Если не нашли админа, берем первого пользователя
                        if (!managerName && project.users.length > 0) {
                            const firstUser = project.users[0];
                            managerName = firstUser.name || `${firstUser.first_name || ''} ${firstUser.last_name || ''}`.trim();
                            managerEmail = firstUser.email;
                        }
                    }
                    console.log(`👤 Менеджер проекта (fallback): ${managerName} (${managerEmail})`);
                }
                
                // Добавляем проект с информацией о менеджере и компании
                syncProjects.push({
                    ...project,
                    manager_name: managerName,
                    manager_email: managerEmail,
                    company: project.company || project.name, // Используем company или название проекта как fallback
                    company_id: project.company_id || project.id // Используем company_id или id проекта как fallback
                });
                
                if (managerName) {
                    console.log(`👤 Менеджер проекта: ${managerName}`);
                } else {
                    console.log(`⚠️ Менеджер проекта не найден`);
                }
            }
        }

        console.log(`✅ Найдено ${syncProjects.length} проектов с меткой "eneca.work sync"`);

        return {
            success: true,
            data: syncProjects,
            filtered_from: projectsData.length,
            message: `Найдено ${syncProjects.length} проектов с меткой из ${projectsData.length} общих`
        };

    } catch (error) {
        console.error('❌ Ошибка получения проектов с sync тегом:', error.message);
        return {
            success: false,
            error: error.message,
            data: []
        };
    }
}

/**
 * Получает все доступные теги проектов через API
 */
async function getProjectTags() {
    try {
        console.log('🏷️ Получение тегов проектов через API...');
        
        // Используем специальный API метод для получения тегов проектов
        const tagsResponse = await makeWorksectionRequest('get_project_tags', {});
        
        console.log('🔍 Полный ответ API тегов:', JSON.stringify(tagsResponse, null, 2));
        
        // Проверяем структуру ответа для тегов
        let tagsData = null;
        if (tagsResponse.data && tagsResponse.data.data && Array.isArray(tagsResponse.data.data)) {
            tagsData = tagsResponse.data.data;
        } else if (tagsResponse.data && Array.isArray(tagsResponse.data)) {
            tagsData = tagsResponse.data;
        } else {
            throw new Error('Не удалось получить теги проектов или неправильная структура данных');
        }

        console.log(`✅ Найдено ${tagsData.length} тегов проектов`);

        return {
            success: true,
            data: tagsData,
            message: `Найдено ${tagsData.length} тегов проектов`
        };

    } catch (error) {
        console.error('❌ Ошибка получения тегов:', error.message);
        return {
            success: false,
            error: error.message,
            data: []
        };
    }
}

/**
 * Создает тег "eneca.work sync" в Worksection через API
 */
async function createSyncTag() {
    try {
        console.log('🔧 Создание тега "eneca.work sync"...');
        
        // Сначала проверяем, есть ли уже такой тег
        const existingTags = await getProjectTags();
        
        if (existingTags.success && existingTags.data) {
            const syncTagExists = existingTags.data.some(tag => 
                tag.title === 'eneca.work sync'
            );
            
            if (syncTagExists) {
                console.log('✅ Тег "eneca.work sync" уже существует');
                return { 
                    success: true, 
                    message: 'Тег "eneca.work sync" уже существует',
                    exists: true
                };
            }
        }

        // Получаем группы тегов для создания в подходящей группе
        const tagGroups = await makeWorksectionRequest('get_project_tag_groups', {});
        
        let groupId = 'Синхронизация'; // Название группы по умолчанию
        
        // Проверяем структуру ответа групп тегов
        let groupsData = null;
        if (tagGroups.data && tagGroups.data.data && Array.isArray(tagGroups.data.data)) {
            groupsData = tagGroups.data.data;
        } else if (tagGroups.data && Array.isArray(tagGroups.data)) {
            groupsData = tagGroups.data;
        }

        // Ищем подходящую группу или используем первую доступную
        if (groupsData && groupsData.length > 0) {
            const syncGroup = groupsData.find(group => 
                group.title.includes('sync') || 
                group.title.includes('Синхронизация') ||
                group.type === 'label'
            );
            
            if (syncGroup) {
                groupId = syncGroup.id;
            } else {
                // Используем первую группу типа label
                const labelGroup = groupsData.find(group => group.type === 'label');
                if (labelGroup) {
                    groupId = labelGroup.id;
                }
            }
        }

        // Создаем тег через API
        console.log(`📝 Создание тега в группе: ${groupId}`);
        const createResponse = await makeWorksectionRequest('add_project_tags', {
            title: 'eneca.work sync',
            group: groupId
        });
        
        if (createResponse.status === 'ok' && createResponse.data) {
            console.log('✅ Тег "eneca.work sync" создан успешно');
            return {
                success: true,
                data: createResponse.data,
                message: 'Тег "eneca.work sync" создан успешно'
            };
        } else {
            throw new Error('Не удалось создать тег');
        }

    } catch (error) {
        console.error('❌ Ошибка создания тега:', error.message);
        
        // Если API не поддерживает создание тегов, предлагаем создать вручную
        if (error.message.includes('Unknown action') || error.message.includes('not found')) {
            return {
                success: false,
                error: 'API не поддерживает создание тегов. Создайте тег "eneca.work sync" вручную через веб-интерфейс Worksection',
                message: 'Создайте тег вручную в веб-интерфейсе'
            };
        }
        
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Получает детальную информацию о проекте
 */
async function getProjectDetails(projectId) {
    try {
        console.log(`🔍 Получение деталей проекта ${projectId}...`);
        
        const response = await makeWorksectionRequest('get_project', {
            project: projectId
        });
        
        if (!response.data) {
            throw new Error('Проект не найден');
        }

        return {
            success: true,
            data: response.data
        };

    } catch (error) {
        console.error('❌ Ошибка при получении деталей проекта:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Синхронизирует проекты с меткой в базу данных eneca.work
 */
async function syncProjectsToDatabase() {
    try {
        console.log('🔄 Начало синхронизации проектов в БД...');
        
        // Получаем проекты с меткой sync
        const projectsResult = await getProjectsWithSyncTag();
        
        if (!projectsResult.success || projectsResult.data.length === 0) {
            return {
                success: false,
                error: 'Нет проектов с меткой "eneca.work sync" для синхронизации',
                synchronized: 0
            };
        }

        const projects = projectsResult.data;
        console.log(`📝 Начинаем синхронизацию ${projects.length} проектов...`);

        // TODO: Добавить реальную логику записи в Supabase БД
        // Здесь будет код для маппинга и записи данных
        
        let synchronized = 0;
        
        for (const project of projects) {
            try {
                // Симуляция обработки проекта
                console.log(`⚙️ Обрабатываем проект: ${project.name} (ID: ${project.id})`);
                
                // TODO: Маппинг данных согласно MAPPING.md
                // TODO: Запись в таблицы managers/projects через Supabase
                
                synchronized++;
                
            } catch (projectError) {
                console.error(`❌ Ошибка обработки проекта ${project.id}:`, projectError.message);
            }
        }

        console.log(`✅ Синхронизация завершена. Обработано: ${synchronized}/${projects.length}`);

        return {
            success: true,
            synchronized: synchronized,
            total: projects.length,
            message: `Синхронизировано ${synchronized} из ${projects.length} проектов`
        };

    } catch (error) {
        console.error('❌ Ошибка синхронизации в БД:', error.message);
        return {
            success: false,
            error: error.message,
            synchronized: 0
        };
    }
}

/**
 * Синхронизирует проекты Worksection с Supabase
 * Создает новые проекты для тех, которых нет в Supabase
 */
async function syncProjectsToSupabase() {
    try {
        console.log('🔄 Начинаем синхронизацию проектов...');
        
        // 1. Получаем проекты с sync тегом из Worksection
        const wsProjectsResponse = await getProjectsWithSyncTag();
        if (!wsProjectsResponse.success) {
            throw new Error('Не удалось получить проекты из Worksection');
        }
        
        const wsProjects = wsProjectsResponse.data;
        console.log(`📋 Найдено ${wsProjects.length} проектов в Worksection с sync тегом`);
        
        // 2. Получаем проекты из Supabase с external_id
        const supabaseProjects = await getSupabaseProjectsWithExternalId();
        console.log(`🗄️ Найдено ${supabaseProjects.length} проектов в Supabase с external_id`);
        
        const results = {
            found: [],      // Найденные существующие
            created: [],    // Созданные новые
            errors: []      // Ошибки
        };
        
        // 3. Обрабатываем каждый проект из Worksection
        for (const wsProject of wsProjects) {
            try {
                console.log(`🔍 Обрабатываем проект: ${wsProject.name} (ID: ${wsProject.id})`);
                
                // Ищем проект по external_id
                const existingProject = supabaseProjects.find(
                    p => p.external_id === wsProject.id.toString()
                );
                
                if (existingProject) {
                    // Проект уже существует
                    console.log(`✅ Проект найден в Supabase: ${existingProject.project_name}`);
                    results.found.push({
                        wsProject,
                        supabaseProject: existingProject,
                        status: 'found'
                    });
                } else {
                    // Проект не найден - создаем новый
                    console.log(`➕ Создаем новый проект в Supabase...`);
                    const newProject = await createProjectInSupabase(wsProject);
                    console.log(`✅ Проект создан: ${newProject.project_name}`);
                    results.created.push({
                        wsProject,
                        supabaseProject: newProject,
                        status: 'created'
                    });
                }
            } catch (error) {
                console.error(`❌ Ошибка обработки проекта ${wsProject.name}:`, error.message);
                results.errors.push({
                    wsProject,
                    error: error.message
                });
            }
        }
        
        console.log('🎉 Синхронизация завершена!');
        console.log(`📊 Результаты: найдено ${results.found.length}, создано ${results.created.length}, ошибок ${results.errors.length}`);
        
        return {
            success: true,
            data: results,
            summary: {
                total: wsProjects.length,
                found: results.found.length,
                created: results.created.length,
                errors: results.errors.length
            }
        };
        
    } catch (error) {
        console.error('❌ Ошибка синхронизации проектов:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Получает проекты из Supabase с external_id
 */
async function getSupabaseProjectsWithExternalId() {
    try {
        // Используем реальный запрос к Supabase API
        const supabaseProjects = await getProjectsWithExternalId();
        return supabaseProjects;
        
    } catch (error) {
        console.error('❌ Ошибка получения проектов из Supabase:', error.message);
        throw error;
    }
}

/**
 * Создает новый проект в Supabase на основе данных из Worksection
 * Согласно маппингу: Worksection Project → Manager + Project
 */
async function createProjectInSupabase(wsProject) {
    console.log(`\n📝 === СОЗДАНИЕ ПРОЕКТА В SUPABASE ===`);
    console.log(`📋 Проект: "${wsProject.name}" (ID: ${wsProject.id})`);
    
    // Статистика назначений для этого проекта
    const assignmentStats = {
        project_name: wsProject.name,
        project_id: wsProject.id,
        manager_assignment: {
            attempted: false,
            success: false,
            manager_data: null,
            found_user: null,
            error: null
        }
    };
    
    // Создаем проект напрямую без Manager'ов (так как их нет в БД)
    const projectData = {
        project_name: wsProject.name,
        project_description: `Импортировано из Worksection. ${wsProject.description || ''}`.trim(),
        external_id: wsProject.id.toString(),
        external_source: 'worksection',
        external_updated_at: new Date().toISOString(),
        project_status: mapWorksectionStatus(wsProject.status),
    };
    
    // Ищем и назначаем ответственного за проект (project_manager)
    if (wsProject.manager_name) {
        assignmentStats.manager_assignment.attempted = true;
        assignmentStats.manager_assignment.manager_data = {
            name: wsProject.manager_name,
            email: wsProject.manager_email
        };
        
        console.log(`\n👤 === НАЗНАЧЕНИЕ ОТВЕТСТВЕННОГО ЗА ПРОЕКТ ===`);
        console.log(`📋 Проект: "${wsProject.name}"`);
        console.log(`👤 Ищем ответственного: "${wsProject.manager_name}"`);
        console.log(`📧 Email: ${wsProject.manager_email || 'не указан'}`);
        
        try {
            const foundUser = await findUserByName(wsProject.manager_name, wsProject.manager_email);
            if (foundUser) {
                projectData.project_manager = foundUser.user_id;
                assignmentStats.manager_assignment.success = true;
                assignmentStats.manager_assignment.found_user = {
                    user_id: foundUser.user_id,
                    full_name: foundUser.full_name,
                    email: foundUser.email
                };
                
                console.log(`✅ УСПЕХ: Назначен ответственный за проект`);
                console.log(`   👤 Пользователь: ${foundUser.full_name}`);
                console.log(`   📧 Email: ${foundUser.email}`);
                console.log(`   🆔 ID: ${foundUser.user_id}`);
                
            } else {
                assignmentStats.manager_assignment.success = false;
                assignmentStats.manager_assignment.error = 'Пользователь не найден в базе';
                
                console.log(`❌ НЕУДАЧА: Ответственный не найден в базе`);
                console.log(`   👤 Искали: "${wsProject.manager_name}"`);
                console.log(`   📧 Email: ${wsProject.manager_email || 'не указан'}`);
                console.log(`   ⚠️ Проект будет создан без ответственного`);
            }
        } catch (error) {
            assignmentStats.manager_assignment.success = false;
            assignmentStats.manager_assignment.error = error.message;
            
            console.log(`❌ ОШИБКА: Ошибка при поиске ответственного`);
            console.log(`   👤 Искали: "${wsProject.manager_name}"`);
            console.log(`   📧 Email: ${wsProject.manager_email || 'не указан'}`);
            console.log(`   ❌ Ошибка: ${error.message}`);
        }
        
        console.log(`=== КОНЕЦ НАЗНАЧЕНИЯ ОТВЕТСТВЕННОГО ===\n`);
    } else {
        console.log(`⚠️ Менеджер не указан в данных Worksection для проекта "${wsProject.name}"`);
    }
    
    // Создаем проект в Supabase
    console.log(`💾 Создание записи проекта в БД...`);
    const newProject = await createProject(projectData);
    
    // Итоговая статистика
    console.log(`\n📊 === ИТОГОВАЯ СТАТИСТИКА СОЗДАНИЯ ПРОЕКТА ===`);
    console.log(`📋 Проект: "${newProject.project_name}" (ID: ${newProject.project_id})`);
    console.log(`👤 Назначение ответственного:`);
    if (assignmentStats.manager_assignment.attempted) {
        if (assignmentStats.manager_assignment.success) {
            console.log(`   ✅ УСПЕХ: ${assignmentStats.manager_assignment.found_user.full_name}`);
        } else {
            console.log(`   ❌ НЕУДАЧА: ${assignmentStats.manager_assignment.error}`);
        }
    } else {
        console.log(`   ⚠️ НЕ ВЫПОЛНЯЛОСЬ: Менеджер не указан в Worksection`);
    }
    console.log(`=== КОНЕЦ СОЗДАНИЯ ПРОЕКТА ===\n`);
    
    return newProject;
}

/**
 * Маппинг статусов Worksection в статусы eneca.work
 */
function mapWorksectionStatus(wsStatus) {
    const statusMap = {
        'active': 'active',
        'completed': 'archive',
        'paused': 'paused',
        'cancelled': 'canceled'
    };
    
    return statusMap[wsStatus] || 'active';
}

/**
 * Обновляет проекты в Supabase на основе данных из Worksection
 * Обновляет название проекта и ответственного менеджера
 */
async function updateProjectsFromWorksection() {
    try {
        console.log(`\n🔄 === ОБНОВЛЕНИЕ ПРОЕКТОВ ИЗ WORKSECTION ===`);
        console.log('🔄 Начинаем обновление проектов...');
        
        // Статистика назначений для всех проектов
        const globalAssignmentStats = {
            total_projects: 0,
            manager_assignments: {
                attempted: 0,
                successful: 0,
                failed: 0,
                skipped: 0,
                details: []
            }
        };
        
        // 1. Получаем проекты с sync тегом из Worksection
        const wsProjectsResponse = await getProjectsWithSyncTag();
        if (!wsProjectsResponse.success) {
            throw new Error('Не удалось получить проекты из Worksection');
        }
        
        const wsProjects = wsProjectsResponse.data;
        globalAssignmentStats.total_projects = wsProjects.length;
        console.log(`📋 Найдено ${wsProjects.length} проектов в Worksection с sync тегом`);
        
        // 2. Получаем проекты из Supabase с external_id
        const supabaseProjects = await getSupabaseProjectsWithExternalId();
        console.log(`🗄️ Найдено ${supabaseProjects.length} проектов в Supabase с external_id`);
        
        const results = {
            updated: [],    // Обновленные проекты
            notFound: [],   // Проекты не найдены в Supabase
            errors: []      // Ошибки
        };
        
        // 3. Обрабатываем каждый проект из Worksection
        for (const wsProject of wsProjects) {
            try {
                console.log(`\n🔍 === ОБРАБОТКА ПРОЕКТА ===`);
                console.log(`📋 Проект: "${wsProject.name}" (ID: ${wsProject.id})`);
                
                // Ищем проект по external_id
                const existingProject = supabaseProjects.find(
                    p => p.external_id === wsProject.id.toString()
                );
                
                if (!existingProject) {
                    console.log(`❌ Проект не найден в Supabase: ${wsProject.name}`);
                    results.notFound.push({
                        wsProject,
                        reason: 'Проект не найден в Supabase'
                    });
                    continue;
                }
                
                // Подготавливаем данные для обновления
                const updateData = {
                    external_updated_at: new Date().toISOString()
                };
                
                let hasChanges = false;
                
                // Создаем детальный лог изменений для этого проекта
                const projectChanges = [];
                
                // Статистика назначений для этого проекта
                const projectAssignmentStats = {
                    project_name: wsProject.name,
                    project_id: wsProject.id,
                    manager_assignment: {
                        attempted: false,
                        success: false,
                        old_manager: null,
                        new_manager: null,
                        error: null
                    }
                };
                
                // Проверяем изменение названия
                if (existingProject.project_name !== wsProject.name) {
                    const nameChange = {
                        field: 'Название проекта',
                        old_value: existingProject.project_name,
                        new_value: wsProject.name
                    };
                    projectChanges.push(nameChange);
                    console.log(`📝 Обновляем название: "${existingProject.project_name}" → "${wsProject.name}"`);
                    updateData.project_name = wsProject.name;
                    hasChanges = true;
                }
                
                // Ищем менеджера проекта по имени и email (если есть в данных Worksection)
                if (wsProject.manager_name) {
                    projectAssignmentStats.manager_assignment.attempted = true;
                    globalAssignmentStats.manager_assignments.attempted++;
                    
                    console.log(`\n👤 === НАЗНАЧЕНИЕ МЕНЕДЖЕРА ПРОЕКТА ===`);
                    console.log(`📋 Проект: "${wsProject.name}"`);
                    console.log(`👤 Ищем менеджера: "${wsProject.manager_name}"`);
                    console.log(`📧 Email: ${wsProject.manager_email || 'не указан'}`);
                    
                    try {
                        const foundManager = await findUserByName(wsProject.manager_name, wsProject.manager_email);
                        
                        if (foundManager) {
                            if (existingProject.project_manager !== foundManager.user_id) {
                                // Получаем текущего менеджера для детального лога
                                let currentManagerName = 'Не назначен';
                                if (existingProject.project_manager) {
                                    try {
                                        const { getAllUsers } = require('./supabase-client');
                                        const allUsers = await getAllUsers();
                                        const currentManager = allUsers.find(u => u.user_id === existingProject.project_manager);
                                        if (currentManager) {
                                            currentManagerName = `${currentManager.first_name} ${currentManager.last_name}`.trim();
                                        }
                                    } catch (err) {
                                        console.log(`⚠️ Не удалось получить имя текущего менеджера`);
                                    }
                                }
                                
                                const managerChange = {
                                    field: 'Менеджер проекта',
                                    old_value: currentManagerName,
                                    new_value: foundManager.full_name
                                };
                                projectChanges.push(managerChange);
                                
                                projectAssignmentStats.manager_assignment.success = true;
                                projectAssignmentStats.manager_assignment.old_manager = currentManagerName;
                                projectAssignmentStats.manager_assignment.new_manager = foundManager.full_name;
                                globalAssignmentStats.manager_assignments.successful++;
                                
                                console.log(`✅ УСПЕХ: Обновляем менеджера проекта`);
                                console.log(`   👤 Старый: "${currentManagerName}"`);
                                console.log(`   👤 Новый: "${foundManager.full_name}" (ID: ${foundManager.user_id})`);
                                console.log(`   📧 Email: ${foundManager.email}`);
                                
                                updateData.project_manager = foundManager.user_id;
                                hasChanges = true;
                            } else {
                                projectAssignmentStats.manager_assignment.success = true;
                                projectAssignmentStats.manager_assignment.old_manager = foundManager.full_name;
                                projectAssignmentStats.manager_assignment.new_manager = foundManager.full_name;
                                globalAssignmentStats.manager_assignments.successful++;
                                
                                console.log(`✅ УСПЕХ: Менеджер не изменился: ${foundManager.full_name}`);
                            }
                        } else {
                            projectAssignmentStats.manager_assignment.success = false;
                            projectAssignmentStats.manager_assignment.error = 'Менеджер не найден в Supabase';
                            globalAssignmentStats.manager_assignments.failed++;
                            
                            console.log(`❌ НЕУДАЧА: Менеджер не найден в Supabase`);
                            console.log(`   👤 Искали: "${wsProject.manager_name}"`);
                            console.log(`   📧 Email: ${wsProject.manager_email || 'не указан'}`);
                        }
                    } catch (error) {
                        projectAssignmentStats.manager_assignment.success = false;
                        projectAssignmentStats.manager_assignment.error = error.message;
                        globalAssignmentStats.manager_assignments.failed++;
                        
                        console.log(`❌ ОШИБКА: Ошибка при поиске менеджера`);
                        console.log(`   👤 Искали: "${wsProject.manager_name}"`);
                        console.log(`   📧 Email: ${wsProject.manager_email || 'не указан'}`);
                        console.log(`   ❌ Ошибка: ${error.message}`);
                    }
                    
                    console.log(`=== КОНЕЦ НАЗНАЧЕНИЯ МЕНЕДЖЕРА ===\n`);
                    
                } else {
                    globalAssignmentStats.manager_assignments.skipped++;
                    console.log(`⚠️ Менеджер не указан в Worksection для проекта "${wsProject.name}"`);
                }
                
                // Сохраняем статистику назначений для этого проекта
                globalAssignmentStats.manager_assignments.details.push(projectAssignmentStats);
                
                // Если есть изменения, обновляем проект
                if (hasChanges) {
                    console.log(`💾 Обновляем проект в БД...`);
                    const updatedProject = await updateProject(existingProject.project_id, updateData);
                    
                    if (updatedProject) {
                        results.updated.push({
                            project: updatedProject,
                            wsProject,
                            changes: projectChanges
                        });
                        console.log(`✅ Проект обновлен: "${wsProject.name}"`);
                    } else {
                        throw new Error(`Не удалось обновить проект "${wsProject.name}"`);
                    }
                } else {
                    console.log(`ℹ️ Проект актуален, изменений нет: "${wsProject.name}"`);
                }
                
            } catch (error) {
                console.error(`❌ Ошибка обработки проекта ${wsProject.name}:`, error.message);
                results.errors.push({
                    wsProject,
                    error: error.message
                });
            }
        }
        
        // Итоговая статистика
        console.log(`\n📊 === ИТОГОВАЯ СТАТИСТИКА ОБНОВЛЕНИЯ ПРОЕКТОВ ===`);
        console.log(`📋 Всего проектов обработано: ${globalAssignmentStats.total_projects}`);
        console.log(`✅ Обновлено проектов: ${results.updated.length}`);
        console.log(`❌ Ошибок: ${results.errors.length}`);
        console.log(`⚠️ Не найдено в Supabase: ${results.notFound.length}`);
        
        console.log(`\n👤 === СТАТИСТИКА НАЗНАЧЕНИЙ МЕНЕДЖЕРОВ ===`);
        console.log(`🎯 Попыток назначения: ${globalAssignmentStats.manager_assignments.attempted}`);
        console.log(`✅ Успешных назначений: ${globalAssignmentStats.manager_assignments.successful}`);
        console.log(`❌ Неудачных назначений: ${globalAssignmentStats.manager_assignments.failed}`);
        console.log(`⚠️ Пропущено (нет менеджера): ${globalAssignmentStats.manager_assignments.skipped}`);
        
        if (globalAssignmentStats.manager_assignments.attempted > 0) {
            const successRate = (globalAssignmentStats.manager_assignments.successful / globalAssignmentStats.manager_assignments.attempted * 100).toFixed(1);
            console.log(`📊 Процент успешных назначений: ${successRate}%`);
        }
        
        // Показываем детали неудачных назначений
        const failedAssignments = globalAssignmentStats.manager_assignments.details.filter(
            detail => detail.manager_assignment.attempted && !detail.manager_assignment.success
        );
        
        if (failedAssignments.length > 0) {
            console.log(`\n⚠️ === ДЕТАЛИ НЕУДАЧНЫХ НАЗНАЧЕНИЙ ===`);
            failedAssignments.forEach((detail, index) => {
                console.log(`${index + 1}. 📋 Проект: "${detail.project_name}"`);
                console.log(`   👤 Искали: "${detail.manager_assignment.old_manager || 'не указан'}"`);
                console.log(`   ❌ Причина: ${detail.manager_assignment.error}`);
            });
        }
        
        console.log(`=== КОНЕЦ ОБНОВЛЕНИЯ ПРОЕКТОВ ===\n`);
        
        return {
            success: true,
            summary: {
                total: globalAssignmentStats.total_projects,
                updated: results.updated.length,
                notFound: results.notFound.length,
                errors: results.errors.length
            },
            assignment_stats: globalAssignmentStats.manager_assignments,
            updated: results.updated,
            notFound: results.notFound,
            errors: results.errors
        };
        
    } catch (error) {
        console.error('❌ Ошибка обновления проектов:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Синхронизирует стадии проектов из меток Worksection в Supabase
 */
async function syncStagesFromWorksection() {
    try {
        console.log('🏷️ Начинаем синхронизацию стадий из меток Worksection...');
        
        // Получаем проекты с sync тегом
        const wsProjectsResult = await getProjectsWithSyncTag();
        if (!wsProjectsResult.success) {
            throw new Error(`Ошибка получения проектов: ${wsProjectsResult.error}`);
        }
        
        const wsProjects = wsProjectsResult.data;
        console.log(`📊 Найдено ${wsProjects.length} проектов для синхронизации стадий`);
        
        // Получаем существующие проекты из Supabase
        const supabaseProjects = await getProjectsWithExternalId();
        console.log(`📊 Найдено ${supabaseProjects.length} проектов в Supabase`);
        
        // Получаем существующие стадии из Supabase
        const existingStages = await getAllStages();
        console.log(`📊 Найдено ${existingStages.length} существующих стадий в Supabase`);
        
        const results = {
            created: [],
            updated: [],
            unchanged: [],
            errors: []
        };
        
        // Обрабатываем каждый проект
        for (const wsProject of wsProjects) {
            try {
                console.log(`\n🔍 [${wsProject.name}] Обрабатываем метки проекта...`);
                
                // Находим соответствующий проект в Supabase
                const supabaseProject = supabaseProjects.find(
                    p => p.external_id === wsProject.id.toString()
                );
                
                if (!supabaseProject) {
                    console.log(`⚠️ [${wsProject.name}] Проект не найден в Supabase, пропускаем`);
                    continue;
                }
                
                // Извлекаем метки проекта
                if (!wsProject.tags || typeof wsProject.tags !== 'object') {
                    console.log(`⚠️ [${wsProject.name}] У проекта нет меток`);
                    continue;
                }
                
                // Обрабатываем каждую метку
                for (const [tagId, tagName] of Object.entries(wsProject.tags)) {
                    // Проверяем, является ли метка стадией (начинается с "Стадия")
                    if (tagName && tagName.toLowerCase().includes('стадия')) {
                        console.log(`🏷️ [${wsProject.name}] Найдена метка стадии: "${tagName}" (ID: ${tagId})`);
                        
                        // Ищем существующую стадию по external_id в рамках конкретного проекта
                        let existingStage = await findStageByExternalId(tagId, supabaseProject.project_id);
                        
                        if (existingStage) {
                            // Проверяем, нужно ли обновить название стадии
                            if (existingStage.stage_name !== tagName) {
                                console.log(`🔄 [${wsProject.name}] Обновляем стадию: "${existingStage.stage_name}" → "${tagName}"`);
                                
                                const updateData = {
                                    stage_name: tagName,
                                    external_updated_at: new Date().toISOString()
                                };
                                
                                const updatedStage = await updateStage(existingStage.stage_id, updateData);
                                
                                if (updatedStage) {
                                    results.updated.push({
                                        stage: updatedStage,
                                        project: wsProject,
                                        changes: {
                                            old_name: existingStage.stage_name,
                                            new_name: tagName
                                        }
                                    });
                                    console.log(`✅ [${wsProject.name}] Стадия обновлена: "${tagName}"`);
                                } else {
                                    throw new Error(`Не удалось обновить стадию "${tagName}"`);
                                }
                            } else {
                                console.log(`✅ [${wsProject.name}] Стадия актуальна: "${tagName}"`);
                                results.unchanged.push({
                                    stage: existingStage,
                                    project: wsProject
                                });
                            }
                        } else {
                            // Создаем новую стадию
                            console.log(`🆕 [${wsProject.name}] Создаем новую стадию: "${tagName}"`);
                            
                            const stageData = {
                                stage_name: tagName,
                                stage_description: `Стадия проекта, синхронизированная из Worksection (метка: ${tagName})`,
                                stage_project_id: supabaseProject.project_id,
                                external_id: tagId,
                                external_source: 'worksection',
                                external_updated_at: new Date().toISOString()
                            };
                            
                            const newStage = await createStage(stageData);
                            
                            if (newStage) {
                                results.created.push({
                                    stage: newStage,
                                    project: wsProject,
                                    tag_id: tagId
                                });
                                console.log(`✅ [${wsProject.name}] Стадия создана: "${tagName}" (ID: ${newStage.stage_id})`);
                            } else {
                                throw new Error(`Не удалось создать стадию "${tagName}"`);
                            }
                        }
                    }
                }
                
            } catch (error) {
                console.error(`❌ [${wsProject.name}] Ошибка обработки стадий:`, error.message);
                results.errors.push({
                    project: wsProject,
                    error: error.message
                });
            }
        }
        
        console.log('\n🎉 Синхронизация стадий завершена!');
        
        // Подробная статистика
        console.log(`📊 Статистика синхронизации стадий:`);
        console.log(`   🆕 Создано стадий: ${results.created.length}`);
        console.log(`   🔄 Обновлено стадий: ${results.updated.length}`);
        console.log(`   ✅ Стадий без изменений: ${results.unchanged.length}`);
        console.log(`   ❌ Ошибок: ${results.errors.length}`);
        
        // Показываем детали созданных стадий
        if (results.created.length > 0) {
            console.log(`\n🆕 Созданные стадии:`);
            results.created.forEach(item => {
                console.log(`   📋 "${item.stage.stage_name}" в проекте "${item.project.name}"`);
            });
        }
        
        // Показываем детали обновленных стадий
        if (results.updated.length > 0) {
            console.log(`\n🔄 Обновленные стадии:`);
            results.updated.forEach(item => {
                console.log(`   📋 "${item.changes.old_name}" → "${item.changes.new_name}" в проекте "${item.project.name}"`);
            });
        }
        
        // Показываем ошибки
        if (results.errors.length > 0) {
            console.log(`\n❌ Ошибки:`);
            results.errors.forEach(item => {
                console.log(`   📋 Проект "${item.project.name}": ${item.error}`);
            });
        }
        
        return {
            success: true,
            data: results,
            summary: {
                created: results.created.length,
                updated: results.updated.length,
                unchanged: results.unchanged.length,
                errors: results.errors.length
            }
        };
        
    } catch (error) {
        console.error('❌ Ошибка синхронизации стадий:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Синхронизирует объекты (задачи) из Worksection в Supabase
 */
async function syncObjectsFromWorksection() {
    try {
        console.log('📦 Начинаем синхронизацию объектов из задач Worksection...');
        
        // Получаем проекты с sync тегом
        const wsProjectsResult = await getProjectsWithSyncTag();
        if (!wsProjectsResult.success) {
            throw new Error(`Ошибка получения проектов: ${wsProjectsResult.error}`);
        }
        
        const wsProjects = wsProjectsResult.data;
        console.log(`📊 Найдено ${wsProjects.length} проектов для синхронизации объектов`);
        
        // Получаем существующие проекты из Supabase
        const supabaseProjects = await getProjectsWithExternalId();
        console.log(`📊 Найдено ${supabaseProjects.length} проектов в Supabase`);
        
        // Получаем существующие стадии из Supabase
        const existingStages = await getAllStages();
        console.log(`📊 Найдено ${existingStages.length} существующих стадий в Supabase`);
        
        // Получаем существующие объекты из Supabase
        const existingObjects = await getAllObjects();
        console.log(`📊 Найдено ${existingObjects.length} существующих объектов в Supabase`);
        
        const results = {
            created: [],
            updated: [],
            unchanged: [],
            errors: []
        };
        
        // Обрабатываем каждый проект
        for (const wsProject of wsProjects) {
            try {
                console.log(`\n🔍 [${wsProject.name}] Получаем задачи проекта...`);
                
                // Находим соответствующий проект в Supabase
                const supabaseProject = supabaseProjects.find(
                    p => p.external_id === wsProject.id.toString()
                );
                
                if (!supabaseProject) {
                    console.log(`⚠️ [${wsProject.name}] Проект не найден в Supabase, пропускаем`);
                    continue;
                }
                
                // Получаем задачи проекта из Worksection
                const tasksResponse = await makeWorksectionRequest('get_tasks', {
                    id_project: wsProject.id
                });
                
                if (tasksResponse.statusCode !== 200 || tasksResponse.data.status !== 'ok') {
                    throw new Error(`Ошибка получения задач: ${tasksResponse.data.message || 'Неизвестная ошибка'}`);
                }
                
                const allTasks = tasksResponse.data.data || [];
                console.log(`📋 [${wsProject.name}] Найдено ${allTasks.length} задач всего`);
                
                // Фильтруем задачи: только открытые (active) и не начинающиеся с "!"
                const wsTasks = allTasks.filter(task => {
                    const isActive = task.status === 'active';
                    const notExclamation = !task.name.startsWith('!');
                    
                    if (!isActive) {
                        console.log(`⏭️ [${wsProject.name}] Пропускаем закрытую задачу: "${task.name}" (статус: ${task.status})`);
                        return false;
                    }
                    
                    if (!notExclamation) {
                        console.log(`⏭️ [${wsProject.name}] Пропускаем задачу с "!": "${task.name}"`);
                        return false;
                    }
                    
                    return true;
                });
                
                console.log(`✅ [${wsProject.name}] Отфильтровано ${wsTasks.length} открытых задач для синхронизации`);
                
                // Проверяем существующие объекты проекта на соответствие новым критериям
                const projectObjects = existingObjects.filter(obj => 
                    obj.object_project_id === supabaseProject.project_id && 
                    obj.external_id !== null
                );
                
                for (const existingObject of projectObjects) {
                    const correspondingTask = allTasks.find(task => task.id.toString() === existingObject.external_id);
                    
                    if (!correspondingTask) {
                        console.log(`🗑️ [${wsProject.name}] Задача не найдена для объекта "${existingObject.object_name}", оставляем объект`);
                        continue;
                    }
                    
                    const shouldKeep = correspondingTask.status === 'active' && !correspondingTask.name.startsWith('!');
                    
                    if (!shouldKeep) {
                        console.log(`🗑️ [${wsProject.name}] Удаляем объект "${existingObject.object_name}" (задача: "${correspondingTask.name}", статус: ${correspondingTask.status})`);
                        
                        try {
                            await deleteObject(existingObject.object_id);
                            results.deleted = results.deleted || [];
                            results.deleted.push({
                                object: existingObject,
                                task: correspondingTask,
                                project: wsProject,
                                reason: correspondingTask.status !== 'active' ? 'закрыта' : 'начинается с !'
                            });
                            console.log(`✅ [${wsProject.name}] Объект "${existingObject.object_name}" удален`);
                        } catch (error) {
                            console.error(`❌ [${wsProject.name}] Ошибка удаления объекта "${existingObject.object_name}":`, error.message);
                            results.errors.push({
                                object: existingObject,
                                task: correspondingTask,
                                project: wsProject,
                                error: `Ошибка удаления: ${error.message}`
                            });
                        }
                    }
                }
                
                // Обрабатываем каждую отфильтрованную задачу
                for (const wsTask of wsTasks) {
                    try {
                        console.log(`\n📝 [${wsProject.name}] Обрабатываем задачу: "${wsTask.name}" (ID: ${wsTask.id})`);
                        
                        // Ищем существующий объект по external_id в рамках конкретного проекта
                        let existingObject = await findObjectByExternalId(wsTask.id.toString(), supabaseProject.project_id);
                        
                        // Определяем стадию для объекта (упрощенная логика)
                        let targetStageId = null;
                        
                        // 1. Ищем стадию по метке задачи (приоритет)
                        if (wsTask.tags && typeof wsTask.tags === 'object') {
                            for (const [tagId, tagName] of Object.entries(wsTask.tags)) {
                                const matchingStage = existingStages.find(
                                    stage => stage.external_id === tagId && 
                                            stage.stage_project_id === supabaseProject.project_id
                                );
                                if (matchingStage) {
                                    targetStageId = matchingStage.stage_id;
                                    console.log(`🏷️ [${wsProject.name}] Найдена стадия по метке "${tagName}": "${matchingStage.stage_name}"`);
                                    break;
                                }
                            }
                        }
                        
                        // 2. Если не найдена по меткам, используем любую стадию проекта
                        if (!targetStageId) {
                            const projectStages = existingStages.filter(
                                stage => stage.stage_project_id === supabaseProject.project_id
                            );
                            if (projectStages.length > 0) {
                                // Приоритет: стадии с external_id, потом любые
                                const stageWithExternal = projectStages.find(s => s.external_id !== null);
                                targetStageId = (stageWithExternal || projectStages[0]).stage_id;
                                console.log(`📋 [${wsProject.name}] Используем стадию: "${(stageWithExternal || projectStages[0]).stage_name}"`);
                            } else {
                                console.log(`⚠️ [${wsProject.name}] Не найдено стадий для проекта, пропускаем задачу`);
                                continue;
                            }
                        }
                        
                        if (existingObject) {
                            // Проверяем, нужно ли обновить объект
                            const needsUpdate = 
                                existingObject.object_name !== wsTask.name ||
                                existingObject.object_description !== (wsTask.text || '') ||
                                existingObject.object_stage_id !== targetStageId;
                            
                            if (needsUpdate) {
                                console.log(`🔄 [${wsProject.name}] Обновляем объект: "${wsTask.name}"`);
                                
                                const updateData = {
                                    object_name: wsTask.name,
                                    object_description: wsTask.text || '',
                                    object_stage_id: targetStageId,
                                    external_updated_at: new Date().toISOString()
                                };
                                
                                const updatedObject = await updateObject(existingObject.object_id, updateData);
                                
                                if (updatedObject) {
                                    results.updated.push({
                                        object: updatedObject,
                                        task: wsTask,
                                        project: wsProject
                                    });
                                    console.log(`✅ [${wsProject.name}] Объект обновлен: "${wsTask.name}"`);
                                } else {
                                    throw new Error(`Не удалось обновить объект "${wsTask.name}"`);
                                }
                            } else {
                                console.log(`✅ [${wsProject.name}] Объект актуален: "${wsTask.name}"`);
                                results.unchanged.push({
                                    object: existingObject,
                                    task: wsTask,
                                    project: wsProject
                                });
                            }
                        } else {
                            // Создаем новый объект
                            console.log(`🆕 [${wsProject.name}] Создаем новый объект: "${wsTask.name}"`);
                            
                            // Проверяем согласованность project_id между стадией и объектом
                            const targetStage = existingStages.find(s => s.stage_id === targetStageId);
                            if (targetStage && targetStage.stage_project_id !== supabaseProject.project_id) {
                                console.log(`⚠️ [${wsProject.name}] ПРЕДУПРЕЖДЕНИЕ: Несогласованность project_id: стадия ${targetStage.stage_project_id} vs проект ${supabaseProject.project_id}`);
                            }

                            const objectData = {
                                object_name: wsTask.name,
                                object_description: wsTask.text || '',
                                object_stage_id: targetStageId,
                                object_project_id: supabaseProject.project_id, // Согласованность с БД
                                external_id: wsTask.id.toString(),
                                external_source: 'worksection',
                                external_updated_at: new Date().toISOString()
                            };
                            
                            const newObject = await createObject(objectData);
                            
                            if (newObject) {
                                results.created.push({
                                    object: newObject,
                                    task: wsTask,
                                    project: wsProject
                                });
                                console.log(`✅ [${wsProject.name}] Объект создан: "${wsTask.name}" (ID: ${newObject.object_id})`);
                            } else {
                                throw new Error(`Не удалось создать объект "${wsTask.name}"`);
                            }
                        }
                        
                    } catch (error) {
                        console.error(`❌ [${wsProject.name}] Ошибка обработки задачи "${wsTask.name}":`, error.message);
                        results.errors.push({
                            task: wsTask,
                            project: wsProject,
                            error: error.message
                        });
                    }
                }
                
            } catch (error) {
                console.error(`❌ [${wsProject.name}] Ошибка обработки проекта:`, error.message);
                results.errors.push({
                    project: wsProject,
                    error: error.message
                });
            }
        }
        
        console.log('\n🎉 Синхронизация объектов завершена!');
        
        // Подробная статистика
        console.log(`📊 Статистика синхронизации объектов:`);
        console.log(`   🆕 Создано объектов: ${results.created.length}`);
        console.log(`   🔄 Обновлено объектов: ${results.updated.length}`);
        console.log(`   ✅ Объектов без изменений: ${results.unchanged.length}`);
        console.log(`   🗑️ Удалено объектов: ${(results.deleted || []).length}`);
        console.log(`   ❌ Ошибок: ${results.errors.length}`);
        
        // Показываем детали созданных объектов
        if (results.created.length > 0) {
            console.log(`\n🆕 Созданные объекты:`);
            results.created.forEach(item => {
                console.log(`   📦 "${item.object.object_name}" в проекте "${item.project.name}"`);
            });
        }
        
        // Показываем детали обновленных объектов
        if (results.updated.length > 0) {
            console.log(`\n🔄 Обновленные объекты:`);
            results.updated.forEach(item => {
                console.log(`   📦 "${item.object.object_name}" в проекте "${item.project.name}"`);
            });
        }
        
        // Показываем детали удаленных объектов
        if (results.deleted && results.deleted.length > 0) {
            console.log(`\n🗑️ Удаленные объекты:`);
            results.deleted.forEach(item => {
                console.log(`   📦 "${item.object.object_name}" в проекте "${item.project.name}" (причина: ${item.reason})`);
            });
        }
        
        // Показываем ошибки
        if (results.errors.length > 0) {
            console.log(`\n❌ Ошибки:`);
            results.errors.forEach(item => {
                if (item.task) {
                    console.log(`   📦 Задача "${item.task.name}" в проекте "${item.project.name}": ${item.error}`);
                } else {
                    console.log(`   📦 Проект "${item.project.name}": ${item.error}`);
                }
            });
        }
        
        return {
            success: true,
            data: results,
            summary: {
                created: results.created.length,
                updated: results.updated.length,
                unchanged: results.unchanged.length,
                deleted: (results.deleted || []).length,
                errors: results.errors.length
            }
        };
        
    } catch (error) {
        console.error('❌ Ошибка синхронизации объектов:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Синхронизирует разделы (sections) из подзадач Worksection
 * С УЛУЧШЕННОЙ СТАТИСТИКОЙ назначений ответственных
 */
async function syncSectionsFromWorksection() {
    try {
        console.log(`\n📑 === СИНХРОНИЗАЦИЯ РАЗДЕЛОВ ИЗ WORKSECTION ===`);
        console.log('📑 Начинаем синхронизацию разделов из подзадач Worksection...');
        
        // Глобальная статистика назначений ответственных
        const globalAssignmentStats = {
            total_sections: 0,
            responsible_assignments: {
                attempted: 0,
                successful: 0,
                failed: 0,
                skipped: 0,
                details: []
            }
        };
        
        // Результаты синхронизации
        const results = {
            created: [],
            updated: [],
            unchanged: [],
            skipped: [],
            errors: []
        };
        
        // 1. Получаем проекты с sync тегом
        const wsProjectsResult = await getProjectsWithSyncTag();
        if (!wsProjectsResult.success) {
            throw new Error(`Ошибка получения проектов: ${wsProjectsResult.error}`);
        }
        
        const wsProjects = wsProjectsResult.data;
        console.log(`📊 Найдено ${wsProjects.length} проектов для синхронизации разделов`);
        
        // 2. Получаем существующие данные из Supabase
        const supabaseProjects = await getProjectsWithExternalId();
        const existingObjects = await getAllObjects();
        const existingSections = await getAllSections();
        
        console.log(`📊 Найдено ${supabaseProjects.length} проектов в Supabase`);
        console.log(`📊 Найдено ${existingObjects.length} объектов в Supabase`);
        console.log(`📊 Найдено ${existingSections.length} разделов в Supabase`);
        
        // 3. Обрабатываем каждый проект с sync тегом
        for (const wsProject of wsProjects) {
            console.log(`\n🔍 === ОБРАБОТКА ПРОЕКТА ДЛЯ РАЗДЕЛОВ ===`);
            console.log(`📋 Проект: "${wsProject.name}"`);
            
            try {
                // Получаем задачи проекта с подзадачами
                console.log(`📋 Получение задач проекта с подзадачами...`);
                const tasksResponse = await makeWorksectionRequest('get_tasks', {
                    id_project: wsProject.id,
                    extra: 'subtasks'  // ИСПРАВЛЕНИЕ: используем extra=subtasks
                });
                
                if (tasksResponse.data.status !== 'ok') {
                    console.log(`❌ Ошибка получения задач: ${tasksResponse.data.message}`);
                    results.errors.push({
                        project: wsProject.name,
                        error: `Ошибка получения задач: ${tasksResponse.data.message}`
                    });
                    continue;
                }
                
                const allTasks = tasksResponse.data.data || [];
                console.log(`📋 Найдено задач: ${allTasks.length}`);
                
                // 4. Обрабатываем подзадачи каждой задачи
                let taskCount = 0;
                let subtaskCount = 0;
                
                for (const wsTask of allTasks) {
                    taskCount++;
                    
                    // Пропускаем неактивные задачи
                    if (wsTask.status !== 'active') {
                        console.log(`⏭️ Пропуск неактивной задачи: "${wsTask.name}"`);
                        continue;
                    }
                    
                    // Проверяем есть ли родительский объект для этой задачи
                    const parentObject = existingObjects.find(obj => 
                        obj.external_id && obj.external_id.toString() === wsTask.id.toString()
                    );
                    
                    if (!parentObject) {
                        console.log(`⚠️ Родительский объект не найден для задачи "${wsTask.name}" (ID: ${wsTask.id})`);
                        continue;
                    }
                    
                    console.log(`✅ Найден родительский объект для задачи "${wsTask.name}": "${parentObject.object_name}"`);
                    
                    // Обрабатываем подзадачи (теперь они в поле child)
                    const subtasks = wsTask.child || [];
                    console.log(`📑 Найдено подзадач в задаче "${wsTask.name}": ${subtasks.length}`);
                    
                    if (subtasks.length > 0) {
                        for (const wsSubtask of subtasks) {
                            subtaskCount++;
                            globalAssignmentStats.total_sections++;
                            
                            try {
                                // Обрабатываем подзадачу с детальным логированием
                                const result = await processSingleSubtask(wsSubtask, parentObject, wsProject, existingSections);
                                
                                // Собираем статистику назначений
                                if (result.assignment_stats) {
                                    const assignmentStats = result.assignment_stats.responsible_assignment;
                                    
                                    if (assignmentStats.attempted) {
                                        globalAssignmentStats.responsible_assignments.attempted++;
                                        
                                        if (assignmentStats.success) {
                                            globalAssignmentStats.responsible_assignments.successful++;
                                        } else {
                                            globalAssignmentStats.responsible_assignments.failed++;
                                        }
                                    } else {
                                        globalAssignmentStats.responsible_assignments.skipped++;
                                    }
                                    
                                    // Сохраняем детали для отчета
                                    globalAssignmentStats.responsible_assignments.details.push(result.assignment_stats);
                                }
                                
                                // Сохраняем результат по типу действия
                                if (result.action === 'created') {
                                    results.created.push(result);
                                } else if (result.action === 'updated') {
                                    results.updated.push(result);
                                } else if (result.action === 'unchanged') {
                                    results.unchanged.push(result);
                                } else if (result.action === 'skipped') {
                                    results.skipped.push(result);
                                }
                                
                            } catch (error) {
                                console.log(`❌ Ошибка обработки подзадачи "${wsSubtask.name}": ${error.message}`);
                                results.errors.push({
                                    project: wsProject.name,
                                    task: wsTask.name,
                                    subtask: wsSubtask.name,
                                    error: error.message
                                });
                            }
                        }
                    }
                }
                
                console.log(`📊 Статистика по проекту "${wsProject.name}":`);
                console.log(`   📋 Задач обработано: ${taskCount}`);
                console.log(`   📑 Подзадач обработано: ${subtaskCount}`);
                
            } catch (error) {
                console.log(`❌ Ошибка обработки проекта "${wsProject.name}": ${error.message}`);
                results.errors.push({
                    project: wsProject.name,
                    error: error.message
                });
            }
        }
        
        // Итоговая статистика
        console.log(`\n📊 === ИТОГОВАЯ СТАТИСТИКА СИНХРОНИЗАЦИИ РАЗДЕЛОВ ===`);
        console.log(`📋 Всего разделов обработано: ${globalAssignmentStats.total_sections}`);
        console.log(`🆕 Создано разделов: ${results.created.length}`);
        console.log(`🔄 Обновлено разделов: ${results.updated.length}`);
        console.log(`✅ Разделов без изменений: ${results.unchanged.length}`);
        console.log(`⏭️ Пропущено разделов: ${results.skipped.length}`);
        console.log(`❌ Ошибок: ${results.errors.length}`);
        
        console.log(`\n👤 === СТАТИСТИКА НАЗНАЧЕНИЙ ОТВЕТСТВЕННЫХ ===`);
        console.log(`🎯 Попыток назначения: ${globalAssignmentStats.responsible_assignments.attempted}`);
        console.log(`✅ Успешных назначений: ${globalAssignmentStats.responsible_assignments.successful}`);
        console.log(`❌ Неудачных назначений: ${globalAssignmentStats.responsible_assignments.failed}`);
        console.log(`⚠️ Пропущено (нет ответственного): ${globalAssignmentStats.responsible_assignments.skipped}`);
        
        if (globalAssignmentStats.responsible_assignments.attempted > 0) {
            const successRate = (globalAssignmentStats.responsible_assignments.successful / globalAssignmentStats.responsible_assignments.attempted * 100).toFixed(1);
            console.log(`📊 Процент успешных назначений: ${successRate}%`);
        }
        
        // Показываем детали неудачных назначений
        const failedAssignments = globalAssignmentStats.responsible_assignments.details.filter(
            detail => detail.responsible_assignment.attempted && !detail.responsible_assignment.success
        );
        
        if (failedAssignments.length > 0) {
            console.log(`\n⚠️ === ДЕТАЛИ НЕУДАЧНЫХ НАЗНАЧЕНИЙ ===`);
            failedAssignments.slice(0, 10).forEach((detail, index) => {
                console.log(`${index + 1}. 📋 Проект: "${detail.project_name}"`);
                console.log(`   📑 Раздел: "${detail.subtask_name}"`);
                console.log(`   👤 Искали: ${detail.responsible_assignment.responsible_data?.name || 'не указан'}`);
                console.log(`   📧 Email: ${detail.responsible_assignment.responsible_data?.email || 'не указан'}`);
                console.log(`   ❌ Причина: ${detail.responsible_assignment.error}`);
            });
            
            if (failedAssignments.length > 10) {
                console.log(`   ... и ещё ${failedAssignments.length - 10} неудачных назначений`);
            }
        }
        
        // Показываем примеры успешных назначений
        const successfulAssignments = globalAssignmentStats.responsible_assignments.details.filter(
            detail => detail.responsible_assignment.attempted && detail.responsible_assignment.success
        );
        
        if (successfulAssignments.length > 0) {
            console.log(`\n✅ === ПРИМЕРЫ УСПЕШНЫХ НАЗНАЧЕНИЙ ===`);
            successfulAssignments.slice(0, 5).forEach((detail, index) => {
                console.log(`${index + 1}. 📋 Проект: "${detail.project_name}"`);
                console.log(`   📑 Раздел: "${detail.subtask_name}"`);
                console.log(`   👤 Назначен: ${detail.responsible_assignment.found_user.first_name} ${detail.responsible_assignment.found_user.last_name}`);
                console.log(`   📧 Email: ${detail.responsible_assignment.found_user.email}`);
            });
            
            if (successfulAssignments.length > 5) {
                console.log(`   ... и ещё ${successfulAssignments.length - 5} успешных назначений`);
            }
        }
        
        console.log(`=== КОНЕЦ СИНХРОНИЗАЦИИ РАЗДЕЛОВ ===\n`);
        
        return {
            success: true,
            summary: {
                created: results.created.length,
                updated: results.updated.length,
                unchanged: results.unchanged.length,
                skipped: results.skipped.length,
                errors: results.errors.length,
                total: globalAssignmentStats.total_sections
            },
            assignment_stats: globalAssignmentStats.responsible_assignments,
            created: results.created,
            updated: results.updated,
            unchanged: results.unchanged,
            skipped: results.skipped,
            errors: results.errors
        };
        
    } catch (error) {
        console.error('❌ Ошибка синхронизации разделов:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Обрабатывает одну подзадачу для синхронизации
 * С УЛУЧШЕННЫМ ЛОГИРОВАНИЕМ назначений ответственных
 */
async function processSingleSubtask(wsSubtask, parentObject, wsProject, existingSections) {
    console.log(`\n📑 === ОБРАБОТКА ПОДЗАДАЧИ ===`);
    console.log(`📋 Проект: "${wsProject.name}"`);
    console.log(`📑 Подзадача: "${wsSubtask.name}" (ID: ${wsSubtask.id})`);
    
    // Статистика назначений для этой подзадачи
    const assignmentStats = {
        project_name: wsProject.name,
        subtask_name: wsSubtask.name,
        subtask_id: wsSubtask.id,
        responsible_assignment: {
            attempted: false,
            success: false,
            responsible_data: null,
            found_user: null,
            error: null
        }
    };
    
    // 1. Фильтры подзадач
    console.log(`\n🔍 Проверка фильтров подзадачи...`);
    if (wsSubtask.status !== 'active') {
        console.log(`⏭️ ПРОПУСК: Подзадача неактивна (статус: ${wsSubtask.status})`);
        console.log(`=== КОНЕЦ ОБРАБОТКИ ПОДЗАДАЧИ ===\n`);
        return { action: 'skipped', reason: 'inactive' };
    }
    
    if (wsSubtask.name.startsWith('!')) {
        console.log(`⏭️ ПРОПУСК: Служебная подзадача (начинается с "!")`);
        console.log(`=== КОНЕЦ ОБРАБОТКИ ПОДЗАДАЧИ ===\n`);
        return { action: 'skipped', reason: 'service_task' };
    }
    
    console.log(`✅ Подзадача прошла фильтры`);
    
    // 2. Поиск ответственного пользователя
    let responsibleId = null;
    
    console.log(`\n👤 === НАЗНАЧЕНИЕ ОТВЕТСТВЕННОГО ЗА РАЗДЕЛ ===`);
    console.log(`📋 Проект: "${wsProject.name}"`);
    console.log(`📑 Раздел: "${wsSubtask.name}"`);
    
    if (wsSubtask.user_to && wsSubtask.user_to.email) {
        assignmentStats.responsible_assignment.attempted = true;
        assignmentStats.responsible_assignment.responsible_data = {
            name: wsSubtask.user_to.name || wsSubtask.user_to.email,
            email: wsSubtask.user_to.email,
            id: wsSubtask.user_to.id
        };
        
        console.log(`👤 Ищем ответственного:`);
        console.log(`   📧 Email: ${wsSubtask.user_to.email}`);
        console.log(`   👤 Имя: ${wsSubtask.user_to.name || 'не указано'}`);
        console.log(`   🆔 ID в Worksection: ${wsSubtask.user_to.id || 'не указан'}`);
        
        try {
            const responsible = await findUserByEmail(wsSubtask.user_to.email);
            if (responsible) {
                responsibleId = responsible.user_id;
                assignmentStats.responsible_assignment.success = true;
                assignmentStats.responsible_assignment.found_user = {
                    user_id: responsible.user_id,
                    first_name: responsible.first_name,
                    last_name: responsible.last_name,
                    email: responsible.email
                };
                
                console.log(`✅ УСПЕХ: Найден ответственный за раздел`);
                console.log(`   👤 Пользователь: ${responsible.first_name} ${responsible.last_name}`);
                console.log(`   📧 Email: ${responsible.email}`);
                console.log(`   🆔 ID: ${responsible.user_id}`);
            } else {
                assignmentStats.responsible_assignment.success = false;
                assignmentStats.responsible_assignment.error = 'Пользователь не найден в базе';
                
                console.log(`❌ НЕУДАЧА: Ответственный не найден в базе`);
                console.log(`   📧 Искали email: ${wsSubtask.user_to.email}`);
                console.log(`   👤 Имя в WS: ${wsSubtask.user_to.name || 'не указано'}`);
                console.log(`   ⚠️ Раздел будет создан без ответственного`);
            }
        } catch (error) {
            assignmentStats.responsible_assignment.success = false;
            assignmentStats.responsible_assignment.error = error.message;
            
            console.log(`❌ ОШИБКА: Ошибка при поиске ответственного`);
            console.log(`   📧 Email: ${wsSubtask.user_to.email}`);
            console.log(`   👤 Имя: ${wsSubtask.user_to.name || 'не указано'}`);
            console.log(`   ❌ Ошибка: ${error.message}`);
        }
    } else {
        console.log(`⚠️ Ответственный не указан в подзадаче`);
        console.log(`   📧 Email: ${wsSubtask.user_to?.email || 'не указан'}`);
        console.log(`   👤 Имя: ${wsSubtask.user_to?.name || 'не указано'}`);
        console.log(`   ⚠️ Раздел будет создан без ответственного`);
    }
    
    console.log(`=== КОНЕЦ НАЗНАЧЕНИЯ ОТВЕТСТВЕННОГО ===\n`);
    
    // 3. Подготовка данных раздела
    console.log(`📝 Подготовка данных раздела...`);
    const sectionData = {
        section_name: wsSubtask.name.substring(0, 255), // Обрезаем до 255 символов
        section_description: wsSubtask.text || null,
        section_responsible: responsibleId,
        section_object_id: parentObject.object_id,
        section_project_id: parentObject.object_project_id,
        section_type: 'work', // По умолчанию тип "work"
        section_start_date: wsSubtask.date_start || null,
        section_end_date: wsSubtask.date_end || null,
        external_id: wsSubtask.id.toString(),
        external_source: 'worksection',
        external_updated_at: new Date().toISOString()
    };
    
    console.log(`📋 Данные раздела подготовлены:`);
    console.log(`   📑 Название: "${sectionData.section_name}"`);
    console.log(`   👤 Ответственный: ${responsibleId ? `назначен (ID: ${responsibleId})` : 'не назначен'}`);
    console.log(`   🔗 Объект: ${parentObject.object_name} (ID: ${parentObject.object_id})`);
    console.log(`   📅 Даты: ${sectionData.section_start_date || 'не указана'} - ${sectionData.section_end_date || 'не указана'}`);
    
    // 4. Проверка существующего раздела в рамках проекта
    console.log(`\n🔍 Проверка существующего раздела...`);
    const existingSection = existingSections.find(
        s => s.external_id && 
             s.external_id.toString() === wsSubtask.id.toString() &&
             s.section_project_id === parentObject.object_project_id
    );
    
    if (existingSection) {
        console.log(`📋 Найден существующий раздел: "${existingSection.section_name}"`);
        console.log(`   🆔 ID раздела: ${existingSection.section_id}`);
        console.log(`   👤 Текущий ответственный: ${existingSection.section_responsible || 'не назначен'}`);
    } else {
        console.log(`📋 Раздел не найден, будет создан новый`);
    }
    
    // 5. Проверка согласованности связей (если раздел найден)
    if (existingSection) {
        console.log(`\n🔍 Проверка согласованности связей...`);
        
        // Проверяем согласованность project_id
        if (existingSection.section_project_id !== parentObject.object_project_id) {
            console.log(`⚠️ ПРЕДУПРЕЖДЕНИЕ: Несогласованность project_id`);
            console.log(`   📋 Раздел: "${existingSection.section_name}"`);
            console.log(`   🔗 Раздел project_id: ${existingSection.section_project_id}`);
            console.log(`   🔗 Объект project_id: ${parentObject.object_project_id}`);
            
            assignmentStats.responsible_assignment.error = 'Несогласованность project_id';
            throw new Error(`Несогласованность project_id для раздела "${existingSection.section_name}"`);
        }
        
        // Проверяем согласованность object_id  
        if (existingSection.section_object_id !== parentObject.object_id) {
            console.log(`🔄 Изменение привязки раздела к новому объекту:`);
            console.log(`   📋 Раздел: "${existingSection.section_name}"`);
            console.log(`   🔗 Старый объект ID: ${existingSection.section_object_id}`);
            console.log(`   🔗 Новый объект ID: ${parentObject.object_id}`);
            // Обновляем section_object_id в данных для обновления
            sectionData.section_object_id = parentObject.object_id;
        }
        
        // Проверяем, нужно ли обновление
        const needsUpdate = hasChanges(existingSection, sectionData, [
            'section_name', 'section_description', 'section_responsible',
            'section_object_id', 'section_start_date', 'section_end_date'
        ]);
        
        if (needsUpdate) {
            console.log(`💾 Обновление существующего раздела...`);
            
            // Показываем изменения
            const changes = [];
            if (existingSection.section_name !== sectionData.section_name) {
                changes.push(`название: "${existingSection.section_name}" → "${sectionData.section_name}"`);
            }
            if (existingSection.section_responsible !== sectionData.section_responsible) {
                changes.push(`ответственный: ${existingSection.section_responsible || 'не назначен'} → ${sectionData.section_responsible || 'не назначен'}`);
            }
            if (existingSection.section_object_id !== sectionData.section_object_id) {
                changes.push(`объект: ${existingSection.section_object_id} → ${sectionData.section_object_id}`);
            }
            
            if (changes.length > 0) {
                console.log(`🔄 Изменения:`);
                changes.forEach(change => console.log(`   • ${change}`));
            }
            
            const updatedSection = await updateSection(existingSection.section_id, sectionData);
            
            if (updatedSection) {
                console.log(`✅ Раздел обновлен: "${wsSubtask.name}"`);
                
                // Итоговая статистика
                console.log(`\n📊 === ИТОГОВАЯ СТАТИСТИКА ОБРАБОТКИ ПОДЗАДАЧИ ===`);
                console.log(`📋 Проект: "${wsProject.name}"`);
                console.log(`📑 Раздел: "${wsSubtask.name}" - ОБНОВЛЕН`);
                console.log(`👤 Назначение ответственного:`);
                if (assignmentStats.responsible_assignment.attempted) {
                    if (assignmentStats.responsible_assignment.success) {
                        console.log(`   ✅ УСПЕХ: ${assignmentStats.responsible_assignment.found_user.first_name} ${assignmentStats.responsible_assignment.found_user.last_name}`);
                    } else {
                        console.log(`   ❌ НЕУДАЧА: ${assignmentStats.responsible_assignment.error}`);
                    }
                } else {
                    console.log(`   ⚠️ НЕ ВЫПОЛНЯЛОСЬ: Ответственный не указан в подзадаче`);
                }
                console.log(`🔄 Изменений: ${changes.length}`);
                console.log(`=== КОНЕЦ ОБРАБОТКИ ПОДЗАДАЧИ ===\n`);
                
                return {
                    action: 'updated',
                    section: updatedSection,
                    subtask: wsSubtask,
                    assignment_stats: assignmentStats,
                    changes: changes.length
                };
            } else {
                throw new Error(`Не удалось обновить раздел "${wsSubtask.name}"`);
            }
        } else {
            console.log(`✅ Раздел актуален, изменений не требуется`);
            
            // Итоговая статистика
            console.log(`\n📊 === ИТОГОВАЯ СТАТИСТИКА ОБРАБОТКИ ПОДЗАДАЧИ ===`);
            console.log(`📋 Проект: "${wsProject.name}"`);
            console.log(`📑 Раздел: "${wsSubtask.name}" - БЕЗ ИЗМЕНЕНИЙ`);
            console.log(`👤 Назначение ответственного:`);
            if (assignmentStats.responsible_assignment.attempted) {
                if (assignmentStats.responsible_assignment.success) {
                    console.log(`   ✅ УСПЕХ: ${assignmentStats.responsible_assignment.found_user.first_name} ${assignmentStats.responsible_assignment.found_user.last_name}`);
                } else {
                    console.log(`   ❌ НЕУДАЧА: ${assignmentStats.responsible_assignment.error}`);
                }
            } else {
                console.log(`   ⚠️ НЕ ВЫПОЛНЯЛОСЬ: Ответственный не указан в подзадаче`);
            }
            console.log(`=== КОНЕЦ ОБРАБОТКИ ПОДЗАДАЧИ ===\n`);
            
            return {
                action: 'unchanged',
                section: existingSection,
                subtask: wsSubtask,
                assignment_stats: assignmentStats,
                changes: 0
            };
        }
    } else {
        // Создаем новый раздел
        console.log(`🆕 Создание нового раздела...`);
        
        // Проверяем согласованность project_id между стадией и объектом
        if (parentObject.object_stage_id) {
            console.log(`✅ Объект привязан к стадии ID: ${parentObject.object_stage_id}`);
        } else {
            console.log(`⚠️ ПРЕДУПРЕЖДЕНИЕ: Объект не привязан к стадии`);
        }
        
        const newSection = await createSection(sectionData);
        
        if (newSection) {
            console.log(`✅ Новый раздел создан: "${wsSubtask.name}"`);
            console.log(`   🆔 ID раздела: ${newSection.section_id}`);
            console.log(`   👤 Ответственный: ${responsibleId ? 'назначен' : 'не назначен'}`);
            
            // Итоговая статистика
            console.log(`\n📊 === ИТОГОВАЯ СТАТИСТИКА ОБРАБОТКИ ПОДЗАДАЧИ ===`);
            console.log(`📋 Проект: "${wsProject.name}"`);
            console.log(`📑 Раздел: "${wsSubtask.name}" - СОЗДАН`);
            console.log(`👤 Назначение ответственного:`);
            if (assignmentStats.responsible_assignment.attempted) {
                if (assignmentStats.responsible_assignment.success) {
                    console.log(`   ✅ УСПЕХ: ${assignmentStats.responsible_assignment.found_user.first_name} ${assignmentStats.responsible_assignment.found_user.last_name}`);
                } else {
                    console.log(`   ❌ НЕУДАЧА: ${assignmentStats.responsible_assignment.error}`);
                }
            } else {
                console.log(`   ⚠️ НЕ ВЫПОЛНЯЛОСЬ: Ответственный не указан в подзадаче`);
            }
            console.log(`=== КОНЕЦ ОБРАБОТКИ ПОДЗАДАЧИ ===\n`);
            
            return {
                action: 'created',
                section: newSection,
                subtask: wsSubtask,
                assignment_stats: assignmentStats,
                changes: 1
            };
        } else {
            throw new Error(`Не удалось создать раздел "${wsSubtask.name}"`);
        }
    }
}

/**
 * Проверяет, есть ли изменения в данных раздела
 */
function hasChanges(existingSection, newSectionData, fieldsToCheck = null) {
    // Если не указаны поля для проверки, проверяем основные поля
    const fields = fieldsToCheck || [
        'section_name', 'section_description', 'section_responsible', 
        'section_object_id', 'section_start_date', 'section_end_date'
    ];
    
    for (const field of fields) {
        const existingValue = existingSection[field];
        const newValue = newSectionData[field];
        
        // Специальная обработка дат
        if (field.includes('date')) {
            const existingDate = existingValue ? new Date(existingValue).getTime() : null;
            const newDate = newValue ? new Date(newValue).getTime() : null;
            
            if (existingDate !== newDate) {
                console.log(`🔍 Изменение в поле ${field}: ${existingValue} → ${newValue}`);
                return true;
            }
        } else {
            // Обычное сравнение
            if (existingValue !== newValue) {
                console.log(`🔍 Изменение в поле ${field}: ${existingValue} → ${newValue}`);
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Генерирует детальный отчёт о состоянии системы
 */
async function generateSystemStatusReport() {
    const logger = createLogger('Отчёт системы');
    const startTime = Date.now();
    
    try {
        logger.info('Начинаем генерацию отчёта о состоянии системы...');
        
        // Сбор основных статистик
        const [projects, stages, objects, sections] = await Promise.all([
            getAllProjects(),
            getAllStages(), 
            getAllObjects(),
            getAllSections()
        ]);
        
        // Статистика по источникам данных
        const projectsSources = {
            worksection: projects.filter(p => p.external_source === 'worksection').length,
            manual: projects.filter(p => !p.external_source || p.external_source !== 'worksection').length,
            with_external_id: projects.filter(p => p.external_id).length
        };
        
        const stagesSources = {
            worksection: stages.filter(s => s.external_source === 'worksection').length,
            manual: stages.filter(s => !s.external_source || s.external_source !== 'worksection').length,
            with_external_id: stages.filter(s => s.external_id).length
        };
        
        const objectsSources = {
            worksection: objects.filter(o => o.external_source === 'worksection').length,
            manual: objects.filter(o => !o.external_source || o.external_source !== 'worksection').length,
            with_external_id: objects.filter(o => o.external_id).length
        };
        
        const sectionsSources = {
            worksection: sections.filter(s => s.external_source === 'worksection').length,
            manual: sections.filter(s => !s.external_source || s.external_source !== 'worksection').length,
            with_external_id: sections.filter(s => s.external_id).length
        };
        
        // Проверка целостности
        const hierarchyValidation = await validateHierarchyConsistency();
        
        // Анализ активности
        const recentSyncDate = new Date();
        recentSyncDate.setHours(recentSyncDate.getHours() - 24);
        
        const recentSyncs = {
            projects: projects.filter(p => 
                p.external_updated_at && new Date(p.external_updated_at) > recentSyncDate
            ).length,
            stages: stages.filter(s => 
                s.external_updated_at && new Date(s.external_updated_at) > recentSyncDate
            ).length,
            objects: objects.filter(o => 
                o.external_updated_at && new Date(o.external_updated_at) > recentSyncDate
            ).length,
            sections: sections.filter(s => 
                s.external_updated_at && new Date(s.external_updated_at) > recentSyncDate
            ).length
        };
        
        // Анализ проблем
        const issues = [];
        const warnings = [];
        
        if (hierarchyValidation.issues.length > 0) {
            issues.push(...hierarchyValidation.issues);
        }
        
        if (projectsSources.worksection === 0) {
            warnings.push('Нет проектов синхронизированных из Worksection');
        }
        
        if (recentSyncs.projects === 0 && recentSyncs.stages === 0 && 
            recentSyncs.objects === 0 && recentSyncs.sections === 0) {
            warnings.push('Нет недавних синхронизаций (за последние 24 часа)');
        }
        
        const duration = Date.now() - startTime;
        
        logger.success(`Отчёт сгенерирован за ${duration}мс`);
        
        return {
            success: true,
            timestamp: new Date().toISOString(),
            generation_time_ms: duration,
            summary: {
                total_entities: projects.length + stages.length + objects.length + sections.length,
                hierarchy_levels: 4,
                sync_coverage: {
                    projects: Math.round((projectsSources.worksection / projects.length) * 100) || 0,
                    stages: Math.round((stagesSources.worksection / stages.length) * 100) || 0,
                    objects: Math.round((objectsSources.worksection / objects.length) * 100) || 0,
                    sections: Math.round((sectionsSources.worksection / sections.length) * 100) || 0
                },
                health_score: Math.max(0, 100 - (issues.length * 10) - (warnings.length * 5))
            },
            statistics: {
                projects: {
                    total: projects.length,
                    ...projectsSources
                },
                stages: {
                    total: stages.length,
                    ...stagesSources
                },
                objects: {
                    total: objects.length,
                    ...objectsSources
                },
                sections: {
                    total: sections.length,
                    ...sectionsSources
                }
            },
            hierarchy_validation: hierarchyValidation,
            recent_activity: {
                description: 'Синхронизации за последние 24 часа',
                ...recentSyncs,
                total: recentSyncs.projects + recentSyncs.stages + recentSyncs.objects + recentSyncs.sections
            },
            issues: {
                critical: issues,
                warnings: warnings,
                total_issues: issues.length + warnings.length
            },
            recommendations: generateRecommendations(projectsSources, stagesSources, objectsSources, sectionsSources, issues, warnings)
        };
        
    } catch (error) {
        logger.error('Ошибка генерации отчёта', error);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Генерирует рекомендации на основе анализа системы
 */
function generateRecommendations(projectsSources, stagesSources, objectsSources, sectionsSources, issues, warnings) {
    const recommendations = [];
    
    // Рекомендации по синхронизации
    if (projectsSources.worksection === 0) {
        recommendations.push({
            type: 'sync',
            priority: 'high',
            message: 'Настройте синхронизацию проектов из Worksection',
            action: 'Добавьте метку "eneca.work sync" к проектам в Worksection'
        });
    }
    
    if (projectsSources.worksection > 0 && stagesSources.worksection === 0) {
        recommendations.push({
            type: 'sync',
            priority: 'medium',
            message: 'Запустите синхронизацию стадий',
            action: 'Выполните POST /api/stages/sync'
        });
    }
    
    if (stagesSources.worksection > 0 && objectsSources.worksection === 0) {
        recommendations.push({
            type: 'sync',
            priority: 'medium',
            message: 'Запустите синхронизацию объектов',
            action: 'Выполните POST /api/objects/sync'
        });
    }
    
    if (objectsSources.worksection > 0 && sectionsSources.worksection === 0) {
        recommendations.push({
            type: 'sync',
            priority: 'medium',
            message: 'Запустите синхронизацию разделов',
            action: 'Выполните POST /api/sections/sync'
        });
    }
    
    // Рекомендации по очистке
    if (issues.length > 0) {
        recommendations.push({
            type: 'maintenance',
            priority: 'high',
            message: 'Исправьте проблемы целостности данных',
            action: 'Проверьте логи и выполните POST /api/maintenance/cleanup-orphaned'
        });
    }
    
    // Рекомендации по производительности
    const totalSynced = projectsSources.worksection + stagesSources.worksection + 
                       objectsSources.worksection + sectionsSources.worksection;
    const totalEntities = projectsSources.total + stagesSources.total + 
                         objectsSources.total + sectionsSources.total;
    
    if (totalSynced > 0 && (totalSynced / totalEntities) < 0.1) {
        recommendations.push({
            type: 'optimization',
            priority: 'low',
            message: 'Низкий уровень синхронизации с Worksection',
            action: 'Рассмотрите возможность синхронизации большего количества данных'
        });
    }
    
    return recommendations;
}

/**
 * Очищает orphaned записи в системе
 */
async function cleanupOrphanedRecords(options = {}) {
    const logger = createLogger('Очистка');
    const { dryRun = true, force = false } = options;
    
    try {
        logger.info(`Запуск очистки orphaned записей (dryRun: ${dryRun}, force: ${force})...`);
        
        if (!force && !dryRun) {
            throw new Error('Для реальной очистки необходимо указать force: true');
        }
        
        // Проверяем целостность для выявления orphaned записей
        const validation = await validateHierarchyConsistency();
        
        if (!validation.success) {
            throw new Error('Не удалось выполнить проверку целостности');
        }
        
        const cleanupResults = {
            orphaned_stages_deleted: 0,
            orphaned_objects_deleted: 0,
            orphaned_sections_deleted: 0,
            errors: []
        };
        
        if (dryRun) {
            logger.info('Режим пробного запуска - фактической очистки не будет');
            
            return {
                success: true,
                dry_run: true,
                would_delete: {
                    stages: validation.statistics.orphaned_stages,
                    objects: validation.statistics.orphaned_objects,
                    sections: validation.statistics.orphaned_sections
                },
                validation: validation
            };
        }
        
        // Реальная очистка (если не dryRun и force = true)
        // TODO: Добавить реальную логику удаления при необходимости
        logger.warning('Реальная очистка не реализована в целях безопасности');
        
        return {
            success: true,
            dry_run: false,
            cleaned: cleanupResults,
            validation: validation
        };
        
    } catch (error) {
        logger.error('Ошибка очистки', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Проверяет здоровье системы синхронизации
 */
async function checkSyncHealth() {
    const logger = createLogger('Проверка здоровья');
    const checks = [];
    let overallHealth = 'healthy';
    
    try {
        logger.info('Запуск проверки здоровья системы синхронизации...');
        
        // 1. Проверка подключения к Worksection
        try {
            const wsResponse = await makeWorksectionRequest('get_accounts');
            checks.push({
                name: 'Worksection API',
                status: wsResponse.data.status === 'ok' ? 'healthy' : 'unhealthy',
                message: wsResponse.data.status === 'ok' ? 'Подключение успешно' : 'Ошибка подключения',
                details: wsResponse.data
            });
        } catch (error) {
            checks.push({
                name: 'Worksection API',
                status: 'critical',
                message: `Ошибка подключения: ${error.message}`,
                details: null
            });
            overallHealth = 'critical';
        }
        
        // 2. Проверка подключения к Supabase
        try {
            const projects = await getAllProjects();
            checks.push({
                name: 'Supabase Database',
                status: 'healthy',
                message: `Подключение успешно, найдено ${projects.length} проектов`,
                details: { projects_count: projects.length }
            });
        } catch (error) {
            checks.push({
                name: 'Supabase Database',
                status: 'critical',
                message: `Ошибка подключения к БД: ${error.message}`,
                details: null
            });
            overallHealth = 'critical';
        }
        
        // 3. Проверка синхронизированных данных
        try {
            const syncProjects = await getProjectsWithSyncTag();
            const hasSyncData = syncProjects.success && syncProjects.data.length > 0;
            
            checks.push({
                name: 'Sync Projects',
                status: hasSyncData ? 'healthy' : 'warning',
                message: hasSyncData ? 
                    `Найдено ${syncProjects.data.length} проектов для синхронизации` : 
                    'Нет проектов с меткой sync',
                details: syncProjects
            });
            
            if (!hasSyncData && overallHealth === 'healthy') {
                overallHealth = 'warning';
            }
        } catch (error) {
            checks.push({
                name: 'Sync Projects',
                status: 'unhealthy',
                message: `Ошибка проверки sync проектов: ${error.message}`,
                details: null
            });
            if (overallHealth === 'healthy') overallHealth = 'unhealthy';
        }
        
        // 4. Проверка переменных окружения
        const envVars = [
            'WORKSECTION_HASH', 'WORKSECTION_DOMAIN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'
        ];
        
        const missingVars = envVars.filter(varName => !process.env[varName]);
        
        checks.push({
            name: 'Environment Variables',
            status: missingVars.length === 0 ? 'healthy' : 'critical',
            message: missingVars.length === 0 ? 
                'Все переменные окружения настроены' : 
                `Отсутствуют переменные: ${missingVars.join(', ')}`,
            details: {
                required: envVars,
                missing: missingVars,
                configured: envVars.filter(varName => !!process.env[varName])
            }
        });
        
        if (missingVars.length > 0) {
            overallHealth = 'critical';
        }
        
        // 5. Проверка целостности данных
        const validation = await validateHierarchyConsistency();
        const hasIssues = validation.issues && validation.issues.length > 0;
        
        checks.push({
            name: 'Data Integrity',
            status: hasIssues ? 'warning' : 'healthy',
            message: hasIssues ? 
                `Найдено ${validation.issues.length} проблем целостности` : 
                'Целостность данных в порядке',
            details: validation
        });
        
        if (hasIssues && overallHealth === 'healthy') {
            overallHealth = 'warning';
        }
        
        logger.success(`Проверка здоровья завершена. Общий статус: ${overallHealth}`);
        
        return {
            success: true,
            overall_health: overallHealth,
            timestamp: new Date().toISOString(),
            checks,
            summary: {
                total_checks: checks.length,
                healthy: checks.filter(c => c.status === 'healthy').length,
                warnings: checks.filter(c => c.status === 'warning').length,
                unhealthy: checks.filter(c => c.status === 'unhealthy').length,
                critical: checks.filter(c => c.status === 'critical').length
            }
        };
        
    } catch (error) {
        logger.error('Ошибка проверки здоровья', error);
        return {
            success: false,
            overall_health: 'critical',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = {
    getProjectsWithSyncTag,
    getProjectTags,
    createSyncTag,
    getProjectDetails,
    syncProjectsToDatabase,
    syncProjectsToSupabase,
    updateProjectsFromWorksection,
    getSupabaseProjectsWithExternalId,
    createProjectInSupabase,
    mapWorksectionStatus,
    syncStagesFromWorksection,
    syncObjectsFromWorksection,
    syncSectionsFromWorksection,
    validateHierarchyConsistency,
    generateSystemStatusReport,
    cleanupOrphanedRecords,
    checkSyncHealth
}; 