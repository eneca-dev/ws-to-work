const SUPABASE_CONFIG = require('../config/supabase');

/**
 * Выполняет HTTP запрос к Supabase REST API
 */
async function makeSupabaseRequest(endpoint, options = {}) {
    const url = `${SUPABASE_CONFIG.url}/rest/v1/${endpoint}`;
    
    const defaultHeaders = {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };

    const requestOptions = {
        method: 'GET',
        headers: { ...defaultHeaders, ...options.headers },
        ...options
    };

    try {
        console.log(`🔗 Запрос к Supabase: ${url}`);
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data;
        
    } catch (error) {
        console.error('❌ Ошибка запроса к Supabase:', error.message);
        throw error;
    }
}

/**
 * Получает все проекты из Supabase
 */
async function getAllProjects() {
    try {
        console.log('📊 Получение всех проектов из Supabase...');
        
        const projects = await makeSupabaseRequest('projects?select=project_id,project_name,project_description,project_manager,project_lead_engineer,project_status,project_created,project_updated,external_id,external_source&order=project_created.desc');
        
        console.log(`📊 Получено ${projects.length} проектов из Supabase`);
        return projects;
        
    } catch (error) {
        console.error('❌ Ошибка получения проектов:', error.message);
        throw error;
    }
}

/**
 * Получает проекты из Supabase только с external_id
 */
async function getProjectsWithExternalId() {
    try {
        console.log('🔗 Получение проектов с external_id из Supabase...');
        
        const projects = await makeSupabaseRequest('projects?select=project_id,project_name,project_description,project_manager,project_lead_engineer,project_status,project_created,project_updated,external_id,external_source&external_id=not.is.null&order=project_created.desc');
        
        console.log(`🔗 Получено ${projects.length} проектов с external_id из Supabase`);
        return projects;
        
    } catch (error) {
        console.error('❌ Ошибка получения проектов с external_id:', error.message);
        throw error;
    }
}

/**
 * Создает новый проект в Supabase
 */
async function createProject(projectData) {
    try {
        console.log(`📝 Создание проекта в Supabase: ${projectData.project_name}`);
        
        const newProject = await makeSupabaseRequest('projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
        
        console.log(`✅ Проект создан в Supabase с ID: ${newProject[0].project_id}`);
        return newProject[0];
        
    } catch (error) {
        console.error('❌ Ошибка создания проекта:', error.message);
        throw error;
    }
}

/**
 * Обновляет проект в Supabase
 */
async function updateProject(projectId, updateData) {
    try {
        console.log(`📝 Обновление проекта в Supabase: ${projectId}`);
        
        const updatedProject = await makeSupabaseRequest(`projects?project_id=eq.${projectId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });
        
        console.log(`✅ Проект обновлен в Supabase: ${projectId}`);
        return updatedProject[0];
        
    } catch (error) {
        console.error('❌ Ошибка обновления проекта:', error.message);
        throw error;
    }
}

/**
 * Получает всех пользователей из Supabase
 */
async function getAllUsers() {
    try {
        console.log('👥 Получение всех пользователей из Supabase...');
        
        const users = await makeSupabaseRequest('profiles?select=user_id,first_name,last_name,email&order=first_name.asc');
        
        console.log(`👥 Получено ${users.length} пользователей из Supabase`);
        return users;
        
    } catch (error) {
        console.error('❌ Ошибка получения пользователей:', error.message);
        throw error;
    }
}

/**
 * Ищет пользователя по имени или email (нечеткий поиск)
 * С УЛУЧШЕННЫМ ЛОГИРОВАНИЕМ для диагностики назначений ответственных
 */
async function findUserByName(userName, userEmail = null) {
    const searchLog = {
        searchName: userName,
        searchEmail: userEmail,
        strategies: [],
        result: null,
        timestamp: new Date().toISOString()
    };

    try {
        console.log(`\n🔍 === ПОИСК ПОЛЬЗОВАТЕЛЯ ===`);
        console.log(`👤 Поиск пользователя по имени: "${userName}"${userEmail ? ` и email: "${userEmail}"` : ''}`);
        
        const users = await getAllUsers();
        console.log(`👥 Всего пользователей в базе: ${users.length}`);
        
        // Логируем все доступные пользователи для отладки
        if (users.length > 0) {
            console.log(`📋 Доступные пользователи в базе:`);
            users.slice(0, 5).forEach((user, index) => {
                console.log(`   ${index + 1}. ${user.first_name} ${user.last_name} (${user.email})`);
            });
            if (users.length > 5) {
                console.log(`   ... и ещё ${users.length - 5} пользователей`);
            }
        }
        
        // СТРАТЕГИЯ 1: Если передан email, сначала ищем по нему
        if (userEmail && userEmail.toLowerCase() !== 'noone' && userEmail !== '') {
            console.log(`\n🎯 СТРАТЕГИЯ 1: Поиск по email "${userEmail}"`);
            const userByEmail = users.find(user => 
                user.email && user.email.toLowerCase() === userEmail.toLowerCase()
            );
            
            if (userByEmail) {
                const fullName = `${userByEmail.first_name} ${userByEmail.last_name}`.trim();
                console.log(`✅ УСПЕХ: Найден пользователь по email: ${fullName} (${userByEmail.email})`);
                searchLog.strategies.push({
                    strategy: 'email_exact',
                    success: true,
                    found_user: fullName
                });
                searchLog.result = { found: true, method: 'email_exact', user: fullName };
                return {
                    ...userByEmail,
                    full_name: fullName
                };
            } else {
                console.log(`❌ НЕУДАЧА: Пользователь с email "${userEmail}" не найден`);
                searchLog.strategies.push({
                    strategy: 'email_exact',
                    success: false,
                    reason: 'email_not_found'
                });
                console.log(`🔍 Переходим к поиску по имени...`);
            }
        } else {
            console.log(`⚠️ Email не предоставлен или некорректный: "${userEmail}"`);
        }
        
        // СТРАТЕГИЯ 2: Поиск по имени
        console.log(`\n🎯 СТРАТЕГИЯ 2: Поиск по имени`);
        
        // Нормализуем имя для поиска - убираем спецсимволы и лишние пробелы
        const normalizedSearchName = userName
            .toLowerCase()
            .trim()
            .replace(/[^\u0400-\u04FF\u0500-\u052F\w\s]/g, '') // Убираем все кроме кириллицы, латиницы и пробелов
            .replace(/\s+/g, ' '); // Заменяем множественные пробелы на одинарные
        
        console.log(`🔍 Нормализованное имя для поиска: "${normalizedSearchName}"`);
        
        // Создаем полное имя для каждого пользователя и варианты поиска
        const usersWithFullName = users.map(user => {
            const fullName = `${user.first_name} ${user.last_name}`.trim();
            const reversedName = `${user.last_name} ${user.first_name}`.trim();
            return {
                ...user,
                full_name: fullName,
                reversed_name: reversedName,
                normalized_full: fullName.toLowerCase().replace(/\s+/g, ' '),
                normalized_reversed: reversedName.toLowerCase().replace(/\s+/g, ' ')
            };
        });
        
        // СТРАТЕГИЯ 2.1: Ищем точное совпадение по полному имени (прямой порядок)
        console.log(`\n🎯 СТРАТЕГИЯ 2.1: Точное совпадение (прямой порядок)`);
        let foundUser = usersWithFullName.find(user => 
            user.normalized_full === normalizedSearchName
        );
        
        if (foundUser) {
            console.log(`✅ УСПЕХ: Найдено точное совпадение (прямой порядок): ${foundUser.full_name} (ID: ${foundUser.user_id})`);
            searchLog.strategies.push({
                strategy: 'name_exact_direct',
                success: true,
                found_user: foundUser.full_name
            });
            searchLog.result = { found: true, method: 'name_exact_direct', user: foundUser.full_name };
            return foundUser;
        } else {
            console.log(`❌ НЕУДАЧА: Точное совпадение (прямой порядок) не найдено`);
            searchLog.strategies.push({
                strategy: 'name_exact_direct',
                success: false
            });
        }
        
        // СТРАТЕГИЯ 2.2: Ищем точное совпадение по полному имени (обратный порядок)
        console.log(`\n🎯 СТРАТЕГИЯ 2.2: Точное совпадение (обратный порядок)`);
        foundUser = usersWithFullName.find(user => 
            user.normalized_reversed === normalizedSearchName
        );
        
        if (foundUser) {
            console.log(`✅ УСПЕХ: Найдено точное совпадение (обратный порядок): ${foundUser.full_name} (ID: ${foundUser.user_id})`);
            searchLog.strategies.push({
                strategy: 'name_exact_reversed',
                success: true,
                found_user: foundUser.full_name
            });
            searchLog.result = { found: true, method: 'name_exact_reversed', user: foundUser.full_name };
            return foundUser;
        } else {
            console.log(`❌ НЕУДАЧА: Точное совпадение (обратный порядок) не найдено`);
            searchLog.strategies.push({
                strategy: 'name_exact_reversed',
                success: false
            });
        }
        
        console.log(`🔍 Точных совпадений не найдено, переходим к частичному поиску...`);
        
        // СТРАТЕГИЯ 2.3: Разбиваем поисковое имя на части для более гибкого поиска
        console.log(`\n🎯 СТРАТЕГИЯ 2.3: Поиск по частям имени`);
        const searchParts = normalizedSearchName.split(' ').filter(part => part.length > 0);
        console.log(`📝 Части имени для поиска: [${searchParts.join(', ')}]`);
        
        if (searchParts.length >= 2) {
            // Ищем пользователя, у которого есть все части имени
            foundUser = usersWithFullName.find(user => {
                const userParts = [user.first_name.toLowerCase(), user.last_name.toLowerCase()];
                return searchParts.every(searchPart => 
                    userParts.some(userPart => 
                        userPart.includes(searchPart) || searchPart.includes(userPart)
                    )
                );
            });
            
            if (foundUser) {
                console.log(`✅ УСПЕХ: Найдено совпадение по частям имени: ${foundUser.full_name} (ID: ${foundUser.user_id})`);
                searchLog.strategies.push({
                    strategy: 'name_parts_match',
                    success: true,
                    found_user: foundUser.full_name
                });
                searchLog.result = { found: true, method: 'name_parts_match', user: foundUser.full_name };
                return foundUser;
            } else {
                console.log(`❌ НЕУДАЧА: Совпадение по частям имени не найдено`);
                searchLog.strategies.push({
                    strategy: 'name_parts_match',
                    success: false
                });
            }
        } else {
            console.log(`⚠️ Недостаточно частей имени для поиска (${searchParts.length})`);
        }
        
        // СТРАТЕГИЯ 2.4: Ищем частичное совпадение (как было раньше)
        console.log(`\n🎯 СТРАТЕГИЯ 2.4: Частичное совпадение`);
        foundUser = usersWithFullName.find(user => 
            user.normalized_full.includes(normalizedSearchName) ||
            normalizedSearchName.includes(user.normalized_full) ||
            user.first_name.toLowerCase().includes(normalizedSearchName) ||
            user.last_name.toLowerCase().includes(normalizedSearchName)
        );
        
        if (foundUser) {
            console.log(`✅ УСПЕХ: Найдено частичное совпадение: ${foundUser.full_name} (ID: ${foundUser.user_id})`);
            searchLog.strategies.push({
                strategy: 'name_partial_match',
                success: true,
                found_user: foundUser.full_name
            });
            searchLog.result = { found: true, method: 'name_partial_match', user: foundUser.full_name };
            return foundUser;
        } else {
            console.log(`❌ НЕУДАЧА: Частичное совпадение не найдено`);
            searchLog.strategies.push({
                strategy: 'name_partial_match',
                success: false
            });
        }
        
        // ОКОНЧАТЕЛЬНЫЙ РЕЗУЛЬТАТ
        console.log(`\n❌ ИТОГ: Пользователь не найден: "${userName}"`);
        console.log(`🔍 Использованные стратегии: ${searchLog.strategies.length}`);
        
        // Показываем похожих пользователей для отладки
        if (searchParts.length > 0) {
            console.log(`\n🔍 ПОХОЖИЕ ПОЛЬЗОВАТЕЛИ (для отладки):`);
            const similarUsers = usersWithFullName.filter(user => 
                searchParts.some(part => 
                    user.first_name.toLowerCase().includes(part) || 
                    user.last_name.toLowerCase().includes(part)
                )
            ).slice(0, 5);
            
            if (similarUsers.length > 0) {
                similarUsers.forEach((user, index) => {
                    console.log(`   ${index + 1}. ${user.full_name} (${user.email})`);
                });
            } else {
                console.log(`   Похожих пользователей не найдено`);
            }
        }
        
        searchLog.result = { found: false, method: null, user: null };
        return null;
        
    } catch (error) {
        console.error('❌ Ошибка поиска пользователя:', error.message);
        searchLog.result = { found: false, method: null, user: null, error: error.message };
        throw error;
    } finally {
        // Логируем итоговую статистику поиска
        console.log(`\n📊 СТАТИСТИКА ПОИСКА:`);
        console.log(`   Искали: "${searchLog.searchName}" (${searchLog.searchEmail || 'без email'})`);
        console.log(`   Стратегий использовано: ${searchLog.strategies.length}`);
        console.log(`   Результат: ${searchLog.result?.found ? '✅ НАЙДЕН' : '❌ НЕ НАЙДЕН'}`);
        if (searchLog.result?.found) {
            console.log(`   Метод: ${searchLog.result.method}`);
            console.log(`   Пользователь: ${searchLog.result.user}`);
        }
        console.log(`=== КОНЕЦ ПОИСКА ПОЛЬЗОВАТЕЛЯ ===\n`);
    }
}

/**
 * Получает все стадии из базы данных
 */
async function getAllStages() {
    try {
        console.log('📋 Получение всех стадий из базы данных...');
        
        const stages = await makeSupabaseRequest('stages?select=*&order=stage_name.asc');
        
        console.log(`✅ Получено стадий: ${stages.length}`);
        return stages;
    } catch (error) {
        console.error('❌ Ошибка при получении стадий:', error.message);
        return [];
    }
}

/**
 * Создает новую стадию в базе данных
 */
async function createStage(stageData) {
    try {
        console.log(`🆕 Создание стадии: "${stageData.stage_name}"`);
        
        const newStage = await makeSupabaseRequest('stages', {
            method: 'POST',
            body: JSON.stringify(stageData)
        });
        
        console.log(`✅ Стадия создана: ${stageData.stage_name}`);
        return newStage[0];
    } catch (error) {
        console.error(`❌ Ошибка при создании стадии "${stageData.stage_name}":`, error.message);
        return null;
    }
}

/**
 * Обновляет существующую стадию
 */
async function updateStage(stageId, updateData) {
    try {
        console.log(`🔄 Обновление стадии ID: ${stageId}`);
        
        const updatedStage = await makeSupabaseRequest(`stages?stage_id=eq.${stageId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });
        
        console.log(`✅ Стадия обновлена: ${stageId}`);
        return updatedStage[0];
    } catch (error) {
        console.error(`❌ Ошибка при обновлении стадии ${stageId}:`, error.message);
        return null;
    }
}

/**
 * Находит стадию по external_id и project_id
 */
async function findStageByExternalId(externalId, projectId = null) {
    try {
        let query = `stages?external_id=eq.${externalId}&select=*`;
        
        // Если указан projectId, ищем стадию в конкретном проекте
        if (projectId) {
            query = `stages?external_id=eq.${externalId}&stage_project_id=eq.${projectId}&select=*`;
        }
        
        const stages = await makeSupabaseRequest(query);
        
        if (stages.length > 0) {
            return stages[0];
        }
        return null;
    } catch (error) {
        console.error(`❌ Ошибка при поиске стадии по external_id ${externalId}:`, error.message);
        return null;
    }
}

/**
 * Получает все объекты из базы данных
 */
async function getAllObjects() {
    try {
        console.log('📦 Получение всех объектов из базы данных...');
        
        const objects = await makeSupabaseRequest('objects?select=*&order=object_name.asc');
        
        console.log(`✅ Получено объектов: ${objects.length}`);
        return objects;
    } catch (error) {
        console.error('❌ Ошибка при получении объектов:', error.message);
        return [];
    }
}

/**
 * Создает новый объект в базе данных
 */
async function createObject(objectData) {
    try {
        console.log(`🆕 Создание объекта: "${objectData.object_name}"`);
        
        const newObject = await makeSupabaseRequest('objects', {
            method: 'POST',
            body: JSON.stringify(objectData)
        });
        
        console.log(`✅ Объект создан: ${objectData.object_name}`);
        return newObject[0];
    } catch (error) {
        console.error(`❌ Ошибка при создании объекта "${objectData.object_name}":`, error.message);
        return null;
    }
}

/**
 * Обновляет существующий объект
 */
async function updateObject(objectId, updateData) {
    try {
        console.log(`🔄 Обновление объекта ID: ${objectId}`);
        
        const updatedObject = await makeSupabaseRequest(`objects?object_id=eq.${objectId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });
        
        console.log(`✅ Объект обновлен: ${objectId}`);
        return updatedObject[0];
    } catch (error) {
        console.error(`❌ Ошибка при обновлении объекта ${objectId}:`, error.message);
        return null;
    }
}

/**
 * Находит объект по external_id и project_id
 */
async function findObjectByExternalId(externalId, projectId = null) {
    try {
        let query = `objects?external_id=eq.${externalId}&select=*`;
        
        // Если указан projectId, ищем объект в конкретном проекте
        if (projectId) {
            query = `objects?external_id=eq.${externalId}&object_project_id=eq.${projectId}&select=*`;
        }
        
        const objects = await makeSupabaseRequest(query);
        
        if (objects.length > 0) {
            return objects[0];
        }
        return null;
    } catch (error) {
        console.error(`❌ Ошибка при поиске объекта по external_id ${externalId}:`, error.message);
        return null;
    }
}

/**
 * Удаляет объект из базы данных
 */
async function deleteObject(objectId) {
    try {
        console.log(`🗑️ Удаление объекта с ID: ${objectId}`);
        
        const response = await makeSupabaseRequest(`objects?object_id=eq.${objectId}`, {
            method: 'DELETE'
        });
        
        console.log(`✅ Объект удален`);
        return true;
    } catch (error) {
        console.error('❌ Ошибка при удалении объекта:', error.message);
        throw error;
    }
}

/**
 * Получает все разделы из базы данных
 */
async function getAllSections() {
    try {
        console.log('📑 Получение всех разделов из базы данных...');
        
        const sections = await makeSupabaseRequest('sections?select=*&order=section_name.asc');
        
        console.log(`✅ Получено разделов: ${sections.length}`);
        return sections;
    } catch (error) {
        console.error('❌ Ошибка при получении разделов:', error.message);
        return [];
    }
}

/**
 * Создает новый раздел в базе данных
 */
async function createSection(sectionData) {
    try {
        console.log(`🆕 Создание раздела: "${sectionData.section_name}"`);
        
        const newSection = await makeSupabaseRequest('sections', {
            method: 'POST',
            body: JSON.stringify(sectionData)
        });
        
        console.log(`✅ Раздел создан: ${sectionData.section_name}`);
        return newSection[0];
    } catch (error) {
        console.error(`❌ Ошибка при создании раздела "${sectionData.section_name}":`, error.message);
        return null;
    }
}

/**
 * Обновляет существующий раздел
 */
async function updateSection(sectionId, updateData) {
    try {
        console.log(`🔄 Обновление раздела ID: ${sectionId}`);
        
        const updatedSection = await makeSupabaseRequest(`sections?section_id=eq.${sectionId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });
        
        console.log(`✅ Раздел обновлен: ${sectionId}`);
        return updatedSection[0];
    } catch (error) {
        console.error(`❌ Ошибка при обновлении раздела ${sectionId}:`, error.message);
        return null;
    }
}

/**
 * Находит раздел по external_id и project_id
 */
async function findSectionByExternalId(externalId, projectId = null) {
    try {
        let query = `sections?external_id=eq.${externalId}&select=*`;
        
        // Если указан projectId, ищем раздел в конкретном проекте
        if (projectId) {
            query = `sections?external_id=eq.${externalId}&section_project_id=eq.${projectId}&select=*`;
        }
        
        const sections = await makeSupabaseRequest(query);
        
        if (sections.length > 0) {
            return sections[0];
        }
        return null;
    } catch (error) {
        console.error(`❌ Ошибка при поиске раздела по external_id ${externalId}:`, error.message);
        return null;
    }
}

/**
 * Удаляет раздел из базы данных
 */
async function deleteSection(sectionId) {
    try {
        console.log(`🗑️ Удаление раздела с ID: ${sectionId}`);
        
        const response = await makeSupabaseRequest(`sections?section_id=eq.${sectionId}`, {
            method: 'DELETE'
        });
        
        console.log(`✅ Раздел удален`);
        return true;
    } catch (error) {
        console.error('❌ Ошибка при удалении раздела:', error.message);
        throw error;
    }
}

/**
 * Находит пользователя по email
 * С УЛУЧШЕННЫМ ЛОГИРОВАНИЕМ
 */
async function findUserByEmail(email) {
    try {
        console.log(`\n🔍 === ПОИСК ПОЛЬЗОВАТЕЛЯ ПО EMAIL ===`);
        console.log(`📧 Поиск пользователя по email: "${email}"`);
        
        if (!email || email.toLowerCase() === 'noone' || email.trim() === '') {
            console.log(`⚠️ Email некорректный или не предоставлен: "${email}"`);
            console.log(`=== КОНЕЦ ПОИСКА ПО EMAIL ===\n`);
            return null;
        }
        
        const users = await makeSupabaseRequest(`profiles?email=eq.${email}&select=*`);
        console.log(`👥 Найдено пользователей с email "${email}": ${users.length}`);
        
        if (users.length > 0) {
            const user = users[0];
            const fullName = `${user.first_name} ${user.last_name}`.trim();
            console.log(`✅ УСПЕХ: Найден пользователь по email: ${fullName} (ID: ${user.user_id})`);
            console.log(`=== КОНЕЦ ПОИСКА ПО EMAIL ===\n`);
            return user;
        } else {
            console.log(`❌ НЕУДАЧА: Пользователь с email "${email}" не найден в базе`);
            
            // Показываем похожие email для отладки
            const allUsers = await getAllUsers();
            const similarEmails = allUsers
                .filter(user => user.email && user.email.toLowerCase().includes(email.toLowerCase().split('@')[0]))
                .slice(0, 3);
            
            if (similarEmails.length > 0) {
                console.log(`🔍 Похожие email в базе:`);
                similarEmails.forEach((user, index) => {
                    console.log(`   ${index + 1}. ${user.first_name} ${user.last_name} (${user.email})`);
                });
            }
            
            console.log(`=== КОНЕЦ ПОИСКА ПО EMAIL ===\n`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Ошибка при поиске пользователя по email ${email}:`, error.message);
        console.log(`=== КОНЕЦ ПОИСКА ПО EMAIL ===\n`);
        return null;
    }
}



module.exports = {
    makeSupabaseRequest,
    getAllProjects,
    getProjectsWithExternalId,
    createProject,
    updateProject,
    getAllUsers,
    findUserByName,
    findUserByEmail,
    getAllStages,
    createStage,
    updateStage,
    findStageByExternalId,
    getAllObjects,
    createObject,
    updateObject,
    findObjectByExternalId,
    deleteObject,
    getAllSections,
    createSection,
    updateSection,
    findSectionByExternalId,
    deleteSection
}; 