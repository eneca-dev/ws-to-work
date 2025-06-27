const { makeWorksectionRequest } = require('./test-worksection');

console.log('🧪 ФИНАЛЬНЫЙ ТЕСТ ИСПРАВЛЕННОГО ХЕШИРОВАНИЯ');

(async () => {
    try {
        console.log('\n✅ Тест 1: get_tasks с extra=subtasks (было сломано, должно работать)');
        const result1 = await makeWorksectionRequest('get_tasks', {
            id_project: '129517',
            extra: 'subtasks'
        });
        
        if (result1.data.status === 'ok') {
            console.log('🎉 SUCCESS: get_tasks с extra=subtasks работает!');
            console.log(`   Найдено задач: ${result1.data.data?.length || 0}`);
        } else {
            console.log('❌ FAIL: get_tasks с extra=subtasks не работает');
            console.log(`   Ошибка: ${result1.data.message}`);
        }

        console.log('\n✅ Тест 2: get_projects с extra (должно работать как раньше)');
        const result2 = await makeWorksectionRequest('get_projects', {
            extra: 'tags,users'
        });
        
        if (result2.data.status === 'ok') {
            console.log('🎉 SUCCESS: get_projects с extra работает!');
            console.log(`   Найдено проектов: ${result2.data.data?.length || 0}`);
        } else {
            console.log('❌ FAIL: get_projects с extra не работает');
            console.log(`   Ошибка: ${result2.data.message}`);
        }

        console.log('\n✅ Тест 3: get_tasks без extra (должно работать как раньше)');
        const result3 = await makeWorksectionRequest('get_tasks', {
            id_project: '129517'
        });
        
        if (result3.data.status === 'ok') {
            console.log('🎉 SUCCESS: get_tasks без extra работает!');
            console.log(`   Найдено задач: ${result3.data.data?.length || 0}`);
        } else {
            console.log('❌ FAIL: get_tasks без extra не работает');
            console.log(`   Ошибка: ${result3.data.message}`);
        }

        console.log('\n📊 РЕЗУЛЬТАТЫ ФИНАЛЬНОГО ТЕСТА:');
        const tests = [
            { name: 'get_tasks с extra=subtasks', success: result1.data.status === 'ok' },
            { name: 'get_projects с extra', success: result2.data.status === 'ok' },
            { name: 'get_tasks без extra', success: result3.data.status === 'ok' }
        ];
        
        const passed = tests.filter(t => t.success).length;
        const total = tests.length;
        
        console.log(`✅ Прошло тестов: ${passed}/${total}`);
        
        if (passed === total) {
            console.log('🎉 ВСЕ ТЕСТЫ ПРОШЛИ! MD5 хеширование исправлено полностью! 🎉');
        } else {
            console.log('❌ Есть проблемы с хешированием');
            tests.forEach(test => {
                console.log(`   ${test.success ? '✅' : '❌'} ${test.name}`);
            });
        }

    } catch (error) {
        console.error('❌ Критическая ошибка тестирования:', error.message);
    }
})(); 