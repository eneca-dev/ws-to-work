#!/usr/bin/env node
// scripts/count-synced.js
// Скрипт для подсчета синхронизированных данных из Worksection в eneca.work

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Инициализация Supabase клиента
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Ошибка: SUPABASE_URL и SUPABASE_ANON_KEY должны быть установлены в .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Подсчитывает количество синхронизированных проектов
 */
async function countSyncedProjects() {
  const { data, error, count } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .not('external_id', 'is', null);

  if (error) {
    throw new Error(`Ошибка подсчета проектов: ${error.message}`);
  }

  return count || 0;
}

/**
 * Подсчитывает общее количество проектов
 */
async function countTotalProjects() {
  const { data, error, count } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Ошибка подсчета всех проектов: ${error.message}`);
  }

  return count || 0;
}

/**
 * Подсчитывает количество синхронизированных стадий
 */
async function countSyncedStages() {
  const { data, error, count } = await supabase
    .from('stages')
    .select('*', { count: 'exact', head: true })
    .not('external_id', 'is', null);

  if (error) {
    throw new Error(`Ошибка подсчета стадий: ${error.message}`);
  }

  return count || 0;
}

/**
 * Подсчитывает общее количество стадий
 */
async function countTotalStages() {
  const { data, error, count } = await supabase
    .from('stages')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Ошибка подсчета всех стадий: ${error.message}`);
  }

  return count || 0;
}

/**
 * Подсчитывает количество синхронизированных объектов
 */
async function countSyncedObjects() {
  const { data, error, count } = await supabase
    .from('objects')
    .select('*', { count: 'exact', head: true })
    .not('external_id', 'is', null);

  if (error) {
    throw new Error(`Ошибка подсчета объектов: ${error.message}`);
  }

  return count || 0;
}

/**
 * Подсчитывает общее количество объектов
 */
async function countTotalObjects() {
  const { data, error, count } = await supabase
    .from('objects')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Ошибка подсчета всех объектов: ${error.message}`);
  }

  return count || 0;
}

/**
 * Подсчитывает количество синхронизированных разделов
 */
async function countSyncedSections() {
  const { data, error, count } = await supabase
    .from('sections')
    .select('*', { count: 'exact', head: true })
    .not('external_id', 'is', null);

  if (error) {
    throw new Error(`Ошибка подсчета разделов: ${error.message}`);
  }

  return count || 0;
}

/**
 * Подсчитывает общее количество разделов
 */
async function countTotalSections() {
  const { data, error, count } = await supabase
    .from('sections')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Ошибка подсчета всех разделов: ${error.message}`);
  }

  return count || 0;
}

/**
 * Получает примеры синхронизированных проектов
 */
async function getSampleProjects(limit = 5) {
  const { data, error } = await supabase
    .from('projects')
    .select('project_id, project_name, external_id')
    .not('external_id', 'is', null)
    .limit(limit);

  if (error) {
    throw new Error(`Ошибка получения примеров проектов: ${error.message}`);
  }

  return data || [];
}

/**
 * Главная функция
 */
async function main() {
  console.log('🔍 Подсчет синхронизированных данных в eneca.work...\n');

  try {
    // Подсчитываем данные параллельно
    const [
      syncedProjects,
      totalProjects,
      syncedStages,
      totalStages,
      syncedObjects,
      totalObjects,
      syncedSections,
      totalSections,
      sampleProjects
    ] = await Promise.all([
      countSyncedProjects(),
      countTotalProjects(),
      countSyncedStages(),
      countTotalStages(),
      countSyncedObjects(),
      countTotalObjects(),
      countSyncedSections(),
      countTotalSections(),
      getSampleProjects(5)
    ]);

    // Выводим результаты
    console.log('📊 === СТАТИСТИКА СИНХРОНИЗАЦИИ ===\n');

    console.log('📋 ПРОЕКТЫ:');
    console.log(`   Синхронизировано: ${syncedProjects} из ${totalProjects}`);
    console.log(`   Процент: ${totalProjects > 0 ? ((syncedProjects / totalProjects) * 100).toFixed(1) : 0}%\n`);

    console.log('🎯 СТАДИИ:');
    console.log(`   Синхронизировано: ${syncedStages} из ${totalStages}`);
    console.log(`   Процент: ${totalStages > 0 ? ((syncedStages / totalStages) * 100).toFixed(1) : 0}%\n`);

    console.log('📦 ОБЪЕКТЫ (задачи):');
    console.log(`   Синхронизировано: ${syncedObjects} из ${totalObjects}`);
    console.log(`   Процент: ${totalObjects > 0 ? ((syncedObjects / totalObjects) * 100).toFixed(1) : 0}%\n`);

    console.log('📑 РАЗДЕЛЫ (подзадачи):');
    console.log(`   Синхронизировано: ${syncedSections} из ${totalSections}`);
    console.log(`   Процент: ${totalSections > 0 ? ((syncedSections / totalSections) * 100).toFixed(1) : 0}%\n`);

    // Общая статистика
    const totalSynced = syncedProjects + syncedStages + syncedObjects + syncedSections;
    const totalAll = totalProjects + totalStages + totalObjects + totalSections;

    console.log('📊 ИТОГО:');
    console.log(`   Всего синхронизировано: ${totalSynced} из ${totalAll} записей`);
    console.log(`   Общий процент: ${totalAll > 0 ? ((totalSynced / totalAll) * 100).toFixed(1) : 0}%\n`);

    // Примеры проектов
    if (sampleProjects.length > 0) {
      console.log('📝 Примеры синхронизированных проектов:');
      sampleProjects.forEach((project, index) => {
        console.log(`   ${index + 1}. ${project.project_name}`);
        console.log(`      External ID: ${project.external_id}, DB ID: ${project.project_id}`);
      });
    }

    console.log('\n✅ Подсчет завершен!');

  } catch (error) {
    console.error(`\n❌ Ошибка: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Запуск скрипта
main();
