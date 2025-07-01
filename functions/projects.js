const { makeWorksectionRequest } = require('./worksection-api');
const { getAllProjects, getProjectsWithExternalId, createProject, updateProject, findUserByName, findUserByEmail, getAllManagers, createManager, updateManager, findManagerByExternalId, getAllStages, createStage, updateStage, findStageByExternalId, getAllObjects, createObject, updateObject, findObjectByExternalId, deleteObject, getAllSections, createSection, updateSection, findSectionByExternalId, deleteSection } = require('./supabase-client');

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
    console.log(`📝 Создание проекта в Supabase: ${wsProject.name}`);
    
    let managerId = null;
    
    // 1. Создаем или находим Manager'а на основе компании проекта
    if (wsProject.company) {
        console.log(`🏢 Обрабатываем компанию проекта: ${wsProject.company}`);
        
        // Ищем существующего менеджера по external_id (ID компании)
        const existingManager = await findManagerByExternalId(wsProject.company_id?.toString() || 'company_' + wsProject.id);
        
        if (existingManager) {
            console.log(`✅ Найден существующий менеджер: ${existingManager.manager_name} (ID: ${existingManager.manager_id})`);
            managerId = existingManager.manager_id;
        } else {
            // Создаем нового менеджера
            console.log(`➕ Создаем нового менеджера для компании: ${wsProject.company}`);
            
            const managerData = {
                manager_name: wsProject.company,
                manager_description: `Менеджер проектов компании "${wsProject.company}". Импортировано из Worksection.`,
                external_id: wsProject.company_id?.toString() || 'company_' + wsProject.id,
                external_source: 'worksection',
                external_updated_at: new Date().toISOString()
            };
            
            const newManager = await createManager(managerData);
            managerId = newManager.manager_id;
            console.log(`✅ Создан новый менеджер: ${newManager.manager_name} (ID: ${newManager.manager_id})`);
        }
    } else {
        console.log(`⚠️ У проекта "${wsProject.name}" не указана компания`);
    }
    
    // 2. Создаем проект с привязкой к менеджеру
    const projectData = {
        project_name: wsProject.name,
        project_description: `Импортировано из Worksection. ${wsProject.description || ''}`.trim(),
        manager_id: managerId, // Привязываем к Manager'у
        external_id: wsProject.id.toString(),
        external_source: 'worksection',
        external_updated_at: new Date().toISOString(),
        project_status: mapWorksectionStatus(wsProject.status),
    };
    
    // 3. Ищем и назначаем ответственного за проект (project_manager)
    if (wsProject.manager_name) {
        console.log(`👤 Ищем ответственного за проект: ${wsProject.manager_name}`);
        const foundUser = await findUserByName(wsProject.manager_name, wsProject.manager_email);
        if (foundUser) {
            projectData.project_manager = foundUser.user_id;
            console.log(`✅ Назначен ответственный: ${foundUser.full_name} (ID: ${foundUser.user_id})`);
        } else {
            console.log(`⚠️ Ответственный не найден в базе: ${wsProject.manager_name}`);
        }
    }
    
    // 4. Создаем проект в Supabase
    const newProject = await createProject(projectData);
    
    console.log(`✅ Проект создан: ${newProject.project_name} (ID: ${newProject.project_id})`);
    if (managerId) {
        console.log(`🔗 Проект привязан к менеджеру ID: ${managerId}`);
    }
    
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
        console.log('🔄 Начинаем обновление проектов...');
        
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
            updated: [],    // Обновленные проекты
            notFound: [],   // Проекты не найдены в Supabase
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
                
                // Проверяем изменение названия
                if (existingProject.project_name !== wsProject.name) {
                    const nameChange = {
                        field: 'Название проекта',
                        old_value: existingProject.project_name,
                        new_value: wsProject.name
                    };
                    projectChanges.push(nameChange);
                    console.log(`📝 [${wsProject.name}] Обновляем название: "${existingProject.project_name}" → "${wsProject.name}"`);
                    updateData.project_name = wsProject.name;
                    hasChanges = true;
                }
                
                // Ищем менеджера проекта по имени и email (если есть в данных Worksection)
                if (wsProject.manager_name) {
                    console.log(`👤 [${wsProject.name}] Ищем менеджера: "${wsProject.manager_name}"${wsProject.manager_email ? ` (${wsProject.manager_email})` : ''}`);
                    const foundManager = await findUserByName(wsProject.manager_name, wsProject.manager_email);
                    
                    if (foundManager) {
                        if (existingProject.manager_id !== foundManager.user_id) {
                            // Получаем текущего менеджера для детального лога
                            let currentManagerName = 'Не назначен';
                            if (existingProject.manager_id) {
                                try {
                                    const { getAllUsers } = require('./supabase-client');
                                    const allUsers = await getAllUsers();
                                    const currentManager = allUsers.find(u => u.user_id === existingProject.manager_id);
                                    if (currentManager) {
                                        currentManagerName = `${currentManager.first_name} ${currentManager.last_name}`.trim();
                                    }
                                } catch (err) {
                                    console.log(`⚠️ [${wsProject.name}] Не удалось получить имя текущего менеджера`);
                                }
                            }
                            
                            const managerChange = {
                                field: 'Менеджер проекта',
                                old_value: currentManagerName,
                                new_value: foundManager.full_name
                            };
                            projectChanges.push(managerChange);
                            console.log(`👤 [${wsProject.name}] Обновляем менеджера: "${currentManagerName}" → "${foundManager.full_name}" (ID: ${foundManager.user_id})`);
                            updateData.manager_id = foundManager.user_id;
                            hasChanges = true;
                        } else {
                            console.log(`👤 [${wsProject.name}] Менеджер не изменился: ${foundManager.full_name}`);
                        }
                    } else {
                        console.log(`⚠️ [${wsProject.name}] Менеджер не найден в Supabase: "${wsProject.manager_name}"`);
                    }
                } else {
                    console.log(`⚠️ [${wsProject.name}] Менеджер не указан в Worksection`);
                }
                
                // Обновляем проект если есть изменения
                if (hasChanges) {
                    console.log(`💾 [${wsProject.name}] Применяем ${projectChanges.length} изменений...`);
                    projectChanges.forEach(change => {
                        console.log(`   🔄 ${change.field}: "${change.old_value}" → "${change.new_value}"`);
                    });
                    
                    const updatedProject = await updateProject(existingProject.project_id, updateData);
                    
                    results.updated.push({
                        wsProject,
                        supabaseProject: existingProject,
                        updatedProject,
                        changes: projectChanges,
                        updateData: updateData,
                        status: 'updated'
                    });
                    
                    console.log(`✅ [${wsProject.name}] Проект успешно обновлен`);
                } else {
                    console.log(`✅ [${wsProject.name}] Проект актуален, изменений нет`);
                    results.updated.push({
                        wsProject,
                        supabaseProject: existingProject,
                        status: 'no_changes'
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
        
        console.log('🎉 Обновление завершено!');
        
        // Подробная статистика
        const actuallyUpdated = results.updated.filter(item => item.status === 'updated');
        const noChanges = results.updated.filter(item => item.status === 'no_changes');
        
        console.log(`📊 Детальная статистика:`);
        console.log(`   ✅ Всего проектов обработано: ${wsProjects.length}`);
        console.log(`   🔄 Проектов обновлено: ${actuallyUpdated.length}`);
        console.log(`   📋 Проектов без изменений: ${noChanges.length}`);
        console.log(`   ❓ Проектов не найдено в Supabase: ${results.notFound.length}`);
        console.log(`   ❌ Ошибок: ${results.errors.length}`);
        
        // Показываем детали обновленных проектов
        if (actuallyUpdated.length > 0) {
            console.log(`\n📝 Обновленные проекты:`);
            actuallyUpdated.forEach(item => {
                console.log(`   📋 "${item.wsProject.name}"`);
                if (item.changes && item.changes.length > 0) {
                    item.changes.forEach(change => {
                        console.log(`      🔄 ${change.field}: "${change.old_value}" → "${change.new_value}"`);
                    });
                }
            });
        }
        
        // Показываем проекты без изменений
        if (noChanges.length > 0) {
            console.log(`\n✅ Проекты без изменений:`);
            noChanges.forEach(item => {
                console.log(`   📋 "${item.wsProject.name}"`);
            });
        }
        
        // Показываем не найденные проекты
        if (results.notFound.length > 0) {
            console.log(`\n❓ Проекты не найдены в Supabase:`);
            results.notFound.forEach(item => {
                console.log(`   📋 "${item.wsProject.name}" (ID: ${item.wsProject.id})`);
            });
        }
        
        // Показываем ошибки
        if (results.errors.length > 0) {
            console.log(`\n❌ Ошибки:`);
            results.errors.forEach(item => {
                console.log(`   📋 "${item.wsProject.name}": ${item.error}`);
            });
        }
        
        return {
            success: true,
            data: results,
            summary: {
                total: wsProjects.length,
                updated: results.updated.length,
                notFound: results.notFound.length,
                errors: results.errors.length
            }
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
                        
                        // Ищем существующую стадию по external_id
                        let existingStage = await findStageByExternalId(tagId);
                        
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
                        
                        // Ищем существующий объект по external_id
                        let existingObject = await findObjectByExternalId(wsTask.id.toString());
                        
                        // Определяем стадию для объекта
                        let targetStageId = null;
                        
                        // Если у задачи есть метки, пытаемся найти соответствующую стадию
                        if (wsTask.tags && typeof wsTask.tags === 'object') {
                            for (const [tagId, tagName] of Object.entries(wsTask.tags)) {
                                // Ищем стадию по external_id (ID метки из Worksection)
                                const matchingStage = existingStages.find(
                                    stage => stage.external_id === tagId && 
                                            stage.stage_project_id === supabaseProject.project_id
                                );
                                if (matchingStage) {
                                    targetStageId = matchingStage.stage_id;
                                    console.log(`🏷️ [${wsProject.name}] Найдена стадия по метке "${tagName}" (ID: ${tagId}): "${matchingStage.stage_name}"`);
                                    break;
                                }
                            }
                        }
                        
                        // Если стадия не найдена по меткам, ищем стадию с external_id в проекте
                        if (!targetStageId) {
                            const projectStagesWithExternalId = existingStages.filter(
                                stage => stage.stage_project_id === supabaseProject.project_id && 
                                         stage.external_id !== null
                            );
                            if (projectStagesWithExternalId.length > 0) {
                                targetStageId = projectStagesWithExternalId[0].stage_id;
                                console.log(`🏷️ [${wsProject.name}] Используем первую стадию с external_id: "${projectStagesWithExternalId[0].stage_name}"`);
                            }
                        }
                        
                        // Если все еще не найдена, используем любую доступную стадию проекта
                        if (!targetStageId) {
                            const projectStages = existingStages.filter(
                                stage => stage.stage_project_id === supabaseProject.project_id
                            );
                            if (projectStages.length > 0) {
                                targetStageId = projectStages[0].stage_id;
                                console.log(`📋 [${wsProject.name}] Используем первую доступную стадию: "${projectStages[0].stage_name}"`);
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
                            
                            const objectData = {
                                object_name: wsTask.name,
                                object_description: wsTask.text || '',
                                object_stage_id: targetStageId,
                                object_project_id: supabaseProject.project_id,
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
 * Синхронизирует разделы из подзадач Worksection
 */
async function syncSectionsFromWorksection() {
    console.log('🚀 Начало синхронизации разделов из подзадач Worksection...');
    
    const results = {
        created: [],
        updated: [],
        unchanged: [],
        deleted: [],
        errors: []
    };
    
    try {
        // 1. Получаем проекты с sync тегом
        console.log('🔍 Получение проектов с меткой sync...');
        const wsProjectsResponse = await getProjectsWithSyncTag();
        
        if (!wsProjectsResponse.success || !wsProjectsResponse.data) {
            console.log('❌ Не удалось получить проекты с sync тегом');
            return { success: false, error: 'Не удалось получить проекты с sync тегом', data: results };
        }
        
        const wsProjects = wsProjectsResponse.data;
        console.log(`✅ Найдено ${wsProjects.length} проектов с меткой sync`);
        
        if (wsProjects.length === 0) {
            console.log('⚠️ Нет проектов с меткой sync для синхронизации');
            return { success: true, data: results, summary: { created: 0, updated: 0, unchanged: 0, deleted: 0, errors: 0 } };
        }
        
        // 2. Получаем существующие данные из Supabase
        console.log('📋 Получение существующих данных из Supabase...');
        const [existingObjects, existingSections] = await Promise.all([
            getAllObjects(),
            getAllSections()
        ]);
        
        console.log(`📊 Загружено из Supabase:`);
        console.log(`   📦 Объекты: ${existingObjects.length}`);
        console.log(`   📑 Разделы: ${existingSections.length}`);
        
        // 3. Обрабатываем каждый проект с sync тегом
        for (const wsProject of wsProjects) {
            console.log(`\n🔍 [${wsProject.name}] Обработка проекта...`);
            
            try {
                // Получаем задачи проекта с подзадачами
                console.log(`📋 [${wsProject.name}] Получение задач проекта с подзадачами...`);
                const tasksResponse = await makeWorksectionRequest('get_tasks', {
                    id_project: wsProject.id,
                    extra: 'subtasks'  // ИСПРАВЛЕНИЕ: используем extra=subtasks
                });
                
                if (tasksResponse.data.status !== 'ok') {
                    console.log(`❌ [${wsProject.name}] Ошибка получения задач: ${tasksResponse.data.message}`);
                    results.errors.push({
                        project: wsProject.name,
                        error: `Ошибка получения задач: ${tasksResponse.data.message}`
                    });
                    continue;
                }
                
                const allTasks = tasksResponse.data.data || [];
                console.log(`📋 [${wsProject.name}] Найдено задач: ${allTasks.length}`);
                
                // 4. Обрабатываем подзадачи каждой задачи
                let taskCount = 0;
                let subtaskCount = 0;
                
                for (const wsTask of allTasks) {
                    taskCount++;
                    
                    // Пропускаем неактивные задачи
                    if (wsTask.status !== 'active') {
                        console.log(`⏭️ [${wsProject.name}] Пропуск неактивной задачи: "${wsTask.name}"`);
                        continue;
                    }
                    
                    // Проверяем есть ли родительский объект для этой задачи
                    const parentObject = existingObjects.find(obj => 
                        obj.external_id && obj.external_id.toString() === wsTask.id.toString()
                    );
                    
                    if (!parentObject) {
                        console.log(`⚠️ [${wsProject.name}] Родительский объект не найден для задачи "${wsTask.name}" (ID: ${wsTask.id})`);
                        continue;
                    }
                    
                    console.log(`✅ [${wsProject.name}] Найден родительский объект для задачи "${wsTask.name}": "${parentObject.object_name}"`);
                    
                    // Обрабатываем подзадачи (теперь они в поле child)
                    const subtasks = wsTask.child || [];
                    console.log(`📑 [${wsProject.name}] Найдено подзадач в задаче "${wsTask.name}": ${subtasks.length}`);
                    
                    for (const subtask of subtasks) {
                        subtaskCount++;
                        
                        try {
                            const result = await processSingleSubtask(
                                subtask, 
                                parentObject, 
                                wsProject, 
                                existingSections
                            );
                            
                            if (result.action === 'created') {
                                results.created.push({
                                    section: result.section,
                                    project: wsProject,
                                    subtask: subtask
                                });
                            } else if (result.action === 'updated') {
                                results.updated.push({
                                    section: result.section,
                                    project: wsProject,
                                    subtask: subtask
                                });
                            } else if (result.action === 'unchanged') {
                                results.unchanged.push({
                                    section: result.section,
                                    project: wsProject,
                                    subtask: subtask
                                });
                            }
                            
                        } catch (subtaskError) {
                            console.log(`❌ [${wsProject.name}] Ошибка обработки подзадачи "${subtask.name}": ${subtaskError.message}`);
                            results.errors.push({
                                project: wsProject.name,
                                task: wsTask.name,
                                subtask: subtask.name,
                                error: subtaskError.message
                            });
                        }
                    }
                }
                
                console.log(`📊 [${wsProject.name}] Обработано задач: ${taskCount}, подзадач: ${subtaskCount}`);
                
            } catch (projectError) {
                console.log(`❌ [${wsProject.name}] Ошибка обработки проекта: ${projectError.message}`);
                results.errors.push({
                    project: wsProject.name,
                    error: projectError.message
                });
            }
        }
        
        // 5. Выводим итоговую статистику
        console.log(`\n🎉 Синхронизация разделов завершена!`);
        console.log(`📊 Статистика синхронизации разделов:`);
        console.log(`   🆕 Создано разделов: ${results.created.length}`);
        console.log(`   🔄 Обновлено разделов: ${results.updated.length}`);
        console.log(`   ✅ Разделов без изменений: ${results.unchanged.length}`);
        console.log(`   🗑️ Удалено разделов: ${results.deleted.length}`);
        console.log(`   ❌ Ошибок: ${results.errors.length}`);
        
        if (results.errors.length > 0) {
            console.log(`\n❌ Детали ошибок:`);
            results.errors.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error.project}: ${error.error}`);
            });
        }
        
        return {
            success: true,
            data: results,
            summary: {
                created: results.created.length,
                updated: results.updated.length,
                unchanged: results.unchanged.length,
                deleted: results.deleted.length,
                errors: results.errors.length
            }
        };
        
    } catch (error) {
        console.error('❌ Критическая ошибка синхронизации разделов:', error.message);
        return {
            success: false,
            error: error.message,
            data: results
        };
    }
}

/**
 * Обрабатывает одну подзадачу для синхронизации
 */
async function processSingleSubtask(wsSubtask, parentObject, wsProject, existingSections) {
    console.log(`📑 [${wsProject.name}] Обработка подзадачи: "${wsSubtask.name}" (ID: ${wsSubtask.id})`);
    
    // 1. Фильтры подзадач
    if (wsSubtask.status !== 'active') {
        console.log(`⏭️ [${wsProject.name}] Пропуск неактивной подзадачи: "${wsSubtask.name}"`);
        return { action: 'skipped', reason: 'inactive' };
    }
    
    if (wsSubtask.name.startsWith('!')) {
        console.log(`⏭️ [${wsProject.name}] Пропуск служебной подзадачи: "${wsSubtask.name}"`);
        return { action: 'skipped', reason: 'service_task' };
    }
    
    // 2. Поиск ответственного пользователя
    let responsibleId = null;
    if (wsSubtask.user_to && wsSubtask.user_to.email) {
        const responsible = await findUserByEmail(wsSubtask.user_to.email);
        if (responsible) {
            responsibleId = responsible.user_id;
            console.log(`👤 [${wsProject.name}] Найден ответственный: ${responsible.first_name} ${responsible.last_name}`);
        } else {
            console.log(`⚠️ [${wsProject.name}] Ответственный не найден для email: ${wsSubtask.user_to.email}`);
        }
    }
    
    // 3. Подготовка данных раздела
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
    
    // 4. Проверка существующего раздела
    const existingSection = existingSections.find(
        s => s.external_id && s.external_id.toString() === wsSubtask.id.toString()
    );
    
    if (existingSection) {
        // Проверяем, нужно ли обновление
        const needsUpdate = hasChanges(existingSection, sectionData, [
            'section_name', 'section_description', 'section_responsible', 
            'section_start_date', 'section_end_date'
        ]);
        
        if (needsUpdate) {
            console.log(`🔄 [${wsProject.name}] Обновляем раздел: "${sectionData.section_name}"`);
            
            const updatedSection = await updateSection(existingSection.section_id, sectionData);
            
            if (updatedSection) {
                console.log(`✅ [${wsProject.name}] Раздел обновлен: "${sectionData.section_name}"`);
                return { action: 'updated', section: updatedSection };
            } else {
                throw new Error(`Не удалось обновить раздел "${sectionData.section_name}"`);
            }
        } else {
            console.log(`✅ [${wsProject.name}] Раздел актуален: "${sectionData.section_name}"`);
            return { action: 'unchanged', section: existingSection };
        }
    } else {
        // Создаем новый раздел
        console.log(`🆕 [${wsProject.name}] Создаем новый раздел: "${sectionData.section_name}"`);
        
        const newSection = await createSection(sectionData);
        
        if (newSection) {
            console.log(`✅ [${wsProject.name}] Раздел создан: "${sectionData.section_name}" (ID: ${newSection.section_id})`);
            return { action: 'created', section: newSection };
        } else {
            throw new Error(`Не удалось создать раздел "${sectionData.section_name}"`);
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
    syncSectionsFromWorksection
}; 