const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../ws.env') });

/**
 * Универсальная функция для запросов к Worksection API
 * @param {string} action - Действие API (например: 'get_projects', 'get_tasks')
 * @param {object} params - Параметры запроса
 * @returns {Promise<object>} Результат запроса
 */
async function makeWorksectionRequest(action, params = {}) {
    return new Promise((resolve, reject) => {
        try {
            // Проверяем наличие необходимых переменных окружения
            if (!process.env.WORKSECTION_DOMAIN) {
                throw new Error('WORKSECTION_DOMAIN не задан в переменных окружения');
            }
            if (!process.env.WORKSECTION_HASH) {
                throw new Error('WORKSECTION_HASH не задан в переменных окружения');
            }

            const crypto = require('crypto');
            const domain = process.env.WORKSECTION_DOMAIN;
            const apiKey = process.env.WORKSECTION_HASH;

            // Собираем все параметры (кроме hash)
            const allParams = { action, ...params };
            
            // ИСПРАВЛЕНИЕ: Для операций с параметром extra 
            // параметры НЕ должны сортироваться в алфавитном порядке
            let paramString;
            if (params.extra) {
                // Для операций с extra используем исходный порядок: action, остальные параметры
                const orderedKeys = ['action'];
                Object.keys(params).forEach(key => {
                    if (!orderedKeys.includes(key)) {
                        orderedKeys.push(key);
                    }
                });
                paramString = orderedKeys.map(key => `${key}=${allParams[key]}`).join('&');
                console.log('🔧 Используем исходный порядок параметров для операции с extra');
            } else {
                // Для остальных операций используем алфавитную сортировку
                const sortedKeys = Object.keys(allParams).sort();
                paramString = sortedKeys.map(key => `${key}=${allParams[key]}`).join('&');
                console.log('🔧 Используем алфавитную сортировку параметров');
            }
            
            const hashString = paramString + apiKey;
            
            console.log(`🔐 Строка для hash:`, hashString);
            
            // Создаем MD5 hash
            const hash = crypto.createHash('md5').update(hashString).digest('hex');
            
            console.log(`🔐 Вычисленный hash:`, hash);

            // Формируем финальные query параметры С hash
            const queryParams = new URLSearchParams({
                action: action,
                ...params,
                hash: hash
            });

            // Настройки запроса (используем admin API v2 согласно документации)
            const options = {
                hostname: domain,
                port: 443,
                path: `/api/admin/v2/?${queryParams.toString()}`,
                method: 'GET',
                headers: {
                    'User-Agent': 'eneca.work Integration/1.0'
                }
            };

            console.log(`🔗 Отправка запроса к Worksection API: ${action}`);
            console.log(`📡 URL: https://${domain}/api/admin/v2/?${queryParams.toString()}`);
            console.log(`📝 Параметры:`, Object.fromEntries(queryParams));

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        console.log(`📄 Сырой ответ (${res.statusCode}):`, data);
                        console.log(`📏 Длина ответа: ${data.length} символов`);
                        
                        if (!data || data.length === 0) {
                            reject(new Error('Пустой ответ от API'));
                            return;
                        }

                        const parsedData = JSON.parse(data);
                        
                        console.log(`✅ Ответ получен (${res.statusCode}):`, {
                            status: parsedData.status,
                            dataLength: parsedData.data ? (Array.isArray(parsedData.data) ? parsedData.data.length : 'object') : 'no data'
                        });

                        resolve({
                            statusCode: res.statusCode,
                            data: parsedData
                        });
                    } catch (parseError) {
                        console.error('❌ Ошибка парсинга JSON:', parseError.message);
                        console.error('📄 Сырой ответ:', data);
                        console.error('📏 Длина ответа:', data.length);
                        reject(new Error(`Ошибка парсинга ответа: ${parseError.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                console.error('❌ Ошибка запроса:', error.message);
                reject(new Error(`Ошибка сети: ${error.message}`));
            });

            req.on('timeout', () => {
                console.error('⏰ Тайм-аут запроса');
                req.destroy();
                reject(new Error('Тайм-аут запроса к API'));
            });

            // Устанавливаем тайм-аут 30 секунд
            req.setTimeout(30000);

            // Завершаем запрос (GET не требует отправки данных)
            req.end();

        } catch (error) {
            console.error('❌ Ошибка подготовки запроса:', error.message);
            reject(error);
        }
    });
}

module.exports = {
    makeWorksectionRequest
}; 