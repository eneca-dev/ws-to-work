-- ========================================================================
-- ФАЗА 1: СТРОГАЯ ДЕДУПЛИКАЦИЯ
-- ========================================================================
-- Этот файл содержит SQL миграции для предотвращения дублей в БД
-- Выполнять в Supabase SQL Editor по порядку
--
-- Автор: Sync Service
-- Дата: 2025-11-05
-- ========================================================================

-- ========================================================================
-- ШАГИ ВЫПОЛНЕНИЯ:
-- ========================================================================
-- 1. СНАЧАЛА выполните ЧАСТЬ 1: Анализ текущих дублей
-- 2. Если дубли найдены - выполните ЧАСТЬ 2: Cleanup (удаление дублей)
-- 3. Затем выполните ЧАСТЬ 3: Создание constraints
-- 4. Наконец выполните ЧАСТЬ 4: Индексы для производительности
-- ========================================================================


-- ========================================================================
-- ЧАСТЬ 1: АНАЛИЗ ТЕКУЩИХ ДУБЛЕЙ
-- ========================================================================
-- Выполните эти запросы чтобы увидеть есть ли дубли в БД
-- Если результаты пусты - можно сразу перейти к ЧАСТИ 3
-- ========================================================================

-- 1.1. Проверка дублей в projects
SELECT
    external_id,
    external_source,
    COUNT(*) as duplicate_count,
    array_agg(project_id) as project_ids,
    array_agg(project_name) as project_names
FROM projects
WHERE external_id IS NOT NULL
GROUP BY external_id, external_source
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 1.2. Проверка дублей в stages
SELECT
    stage_project_id,
    external_id,
    external_source,
    COUNT(*) as duplicate_count,
    array_agg(stage_id) as stage_ids,
    array_agg(stage_name) as stage_names
FROM stages
WHERE external_id IS NOT NULL
GROUP BY stage_project_id, external_id, external_source
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 1.3. Проверка дублей в objects
SELECT
    object_stage_id,
    external_id,
    external_source,
    COUNT(*) as duplicate_count,
    array_agg(object_id) as object_ids,
    array_agg(object_name) as object_names
FROM objects
WHERE external_id IS NOT NULL
GROUP BY object_stage_id, external_id, external_source
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 1.4. Проверка дублей в sections
SELECT
    section_project_id,
    external_id,
    external_source,
    COUNT(*) as duplicate_count,
    array_agg(section_id) as section_ids,
    array_agg(section_name) as section_names
FROM sections
WHERE external_id IS NOT NULL
GROUP BY section_project_id, external_id, external_source
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;


-- ========================================================================
-- ЧАСТЬ 2: CLEANUP - УДАЛЕНИЕ ДУБЛЕЙ
-- ========================================================================
-- ВНИМАНИЕ! Эти запросы удаляют данные!
-- Выполняйте только если в ЧАСТИ 1 нашлись дубли
-- Стратегия: оставляем самую последнюю запись (по timestamp или ID)
-- ========================================================================

-- 2.1. Удаление дублей в sections (сначала дочерние таблицы!)
-- Оставляем только самую новую запись для каждого уникального ключа
WITH duplicates AS (
    SELECT
        section_id,
        ROW_NUMBER() OVER (
            PARTITION BY section_project_id, external_source, external_id
            ORDER BY
                COALESCE(external_updated_at, created_at, NOW()) DESC,
                section_id DESC
        ) as rn
    FROM sections
    WHERE external_id IS NOT NULL
)
DELETE FROM sections
WHERE section_id IN (
    SELECT section_id FROM duplicates WHERE rn > 1
);

-- Проверка результата
SELECT 'sections duplicates removed: ' || COUNT(*) as result
FROM (
    SELECT section_project_id, external_id, external_source, COUNT(*) as cnt
    FROM sections
    WHERE external_id IS NOT NULL
    GROUP BY section_project_id, external_id, external_source
    HAVING COUNT(*) > 1
) sub;


-- 2.2. Удаление дублей в objects
-- Оставляем только самую новую запись для каждого уникального ключа
WITH duplicates AS (
    SELECT
        object_id,
        ROW_NUMBER() OVER (
            PARTITION BY object_stage_id, external_source, external_id
            ORDER BY
                COALESCE(external_updated_at, created_at, NOW()) DESC,
                object_id DESC
        ) as rn
    FROM objects
    WHERE external_id IS NOT NULL
)
DELETE FROM objects
WHERE object_id IN (
    SELECT object_id FROM duplicates WHERE rn > 1
);

-- Проверка результата
SELECT 'objects duplicates removed: ' || COUNT(*) as result
FROM (
    SELECT object_stage_id, external_id, external_source, COUNT(*) as cnt
    FROM objects
    WHERE external_id IS NOT NULL
    GROUP BY object_stage_id, external_id, external_source
    HAVING COUNT(*) > 1
) sub;


-- 2.3. Удаление дублей в stages
WITH duplicates AS (
    SELECT
        stage_id,
        ROW_NUMBER() OVER (
            PARTITION BY stage_project_id, external_source, external_id
            ORDER BY
                COALESCE(external_updated_at, created_at, NOW()) DESC,
                stage_id DESC
        ) as rn
    FROM stages
    WHERE external_id IS NOT NULL
)
DELETE FROM stages
WHERE stage_id IN (
    SELECT stage_id FROM duplicates WHERE rn > 1
);

-- Проверка результата
SELECT 'stages duplicates removed: ' || COUNT(*) as result
FROM (
    SELECT stage_project_id, external_id, external_source, COUNT(*) as cnt
    FROM stages
    WHERE external_id IS NOT NULL
    GROUP BY stage_project_id, external_id, external_source
    HAVING COUNT(*) > 1
) sub;


-- 2.4. Удаление дублей в projects
WITH duplicates AS (
    SELECT
        project_id,
        ROW_NUMBER() OVER (
            PARTITION BY external_source, external_id
            ORDER BY
                COALESCE(external_updated_at, created_at, NOW()) DESC,
                project_id DESC
        ) as rn
    FROM projects
    WHERE external_id IS NOT NULL
)
DELETE FROM projects
WHERE project_id IN (
    SELECT project_id FROM duplicates WHERE rn > 1
);

-- Проверка результата
SELECT 'projects duplicates removed: ' || COUNT(*) as result
FROM (
    SELECT external_id, external_source, COUNT(*) as cnt
    FROM projects
    WHERE external_id IS NOT NULL
    GROUP BY external_id, external_source
    HAVING COUNT(*) > 1
) sub;


-- ========================================================================
-- ЧАСТЬ 3: СОЗДАНИЕ UNIQUE CONSTRAINTS
-- ========================================================================
-- Создаём уникальные индексы для предотвращения дублей в будущем
-- ВАЖНО: Выполнять только после ЧАСТИ 2 (cleanup)
-- ========================================================================

-- 3.1. Unique constraint для projects
-- Проект уникален по (external_id, external_source)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'projects_external_unique'
    ) THEN
        ALTER TABLE projects
        ADD CONSTRAINT projects_external_unique
        UNIQUE (external_id, external_source);

        RAISE NOTICE 'Created constraint: projects_external_unique';
    ELSE
        RAISE NOTICE 'Constraint already exists: projects_external_unique';
    END IF;
END $$;


-- 3.2. Unique constraint для stages
-- Стадия уникальна по (stage_project_id, external_id, external_source)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'stages_project_external_unique'
    ) THEN
        ALTER TABLE stages
        ADD CONSTRAINT stages_project_external_unique
        UNIQUE (stage_project_id, external_id, external_source);

        RAISE NOTICE 'Created constraint: stages_project_external_unique';
    ELSE
        RAISE NOTICE 'Constraint already exists: stages_project_external_unique';
    END IF;
END $$;


-- 3.3. Unique constraint для objects
-- Объект уникален по (object_stage_id, external_id, external_source)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'objects_stage_external_unique'
    ) THEN
        ALTER TABLE objects
        ADD CONSTRAINT objects_stage_external_unique
        UNIQUE (object_stage_id, external_id, external_source);

        RAISE NOTICE 'Created constraint: objects_stage_external_unique';
    ELSE
        RAISE NOTICE 'Constraint already exists: objects_stage_external_unique';
    END IF;
END $$;


-- 3.4. Unique constraint для sections
-- Раздел уникален по (section_project_id, external_id, external_source)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sections_project_external_unique'
    ) THEN
        ALTER TABLE sections
        ADD CONSTRAINT sections_project_external_unique
        UNIQUE (section_project_id, external_id, external_source);

        RAISE NOTICE 'Created constraint: sections_project_external_unique';
    ELSE
        RAISE NOTICE 'Constraint already exists: sections_project_external_unique';
    END IF;
END $$;


-- ========================================================================
-- ЧАСТЬ 4: ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- ========================================================================
-- Создаём индексы для ускорения поиска при синхронизации
-- ========================================================================

-- 4.1. Индексы для projects
CREATE INDEX IF NOT EXISTS idx_projects_external_id
ON projects(external_id)
WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_external_source
ON projects(external_source)
WHERE external_source IS NOT NULL;


-- 4.2. Индексы для stages
CREATE INDEX IF NOT EXISTS idx_stages_project_id
ON stages(stage_project_id);

CREATE INDEX IF NOT EXISTS idx_stages_external_lookup
ON stages(stage_project_id, external_id, external_source)
WHERE external_id IS NOT NULL;


-- 4.3. Индексы для objects
CREATE INDEX IF NOT EXISTS idx_objects_stage_id
ON objects(object_stage_id);

CREATE INDEX IF NOT EXISTS idx_objects_external_lookup
ON objects(object_stage_id, external_id, external_source)
WHERE external_id IS NOT NULL;


-- 4.4. Индексы для sections
CREATE INDEX IF NOT EXISTS idx_sections_project_id
ON sections(section_project_id);

CREATE INDEX IF NOT EXISTS idx_sections_object_id
ON sections(section_object_id);

CREATE INDEX IF NOT EXISTS idx_sections_external_lookup
ON sections(section_project_id, external_id, external_source)
WHERE external_id IS NOT NULL;


-- 4.5. Индексы для profiles (поиск пользователей)
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
ON profiles(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_profiles_name_search
ON profiles(LOWER(first_name), LOWER(last_name));


-- ========================================================================
-- ЧАСТЬ 5: ДОПОЛНИТЕЛЬНЫЕ CONSTRAINT'Ы ДЛЯ ЦЕЛОСТНОСТИ ДАННЫХ
-- ========================================================================

-- 5.1. Проверка что external_id не пустая строка
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_external_id_not_empty;
ALTER TABLE projects
ADD CONSTRAINT projects_external_id_not_empty
CHECK (external_id IS NULL OR LENGTH(TRIM(external_id)) > 0);

ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_external_id_not_empty;
ALTER TABLE stages
ADD CONSTRAINT stages_external_id_not_empty
CHECK (external_id IS NULL OR LENGTH(TRIM(external_id)) > 0);

ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_external_id_not_empty;
ALTER TABLE objects
ADD CONSTRAINT objects_external_id_not_empty
CHECK (external_id IS NULL OR LENGTH(TRIM(external_id)) > 0);

ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_external_id_not_empty;
ALTER TABLE sections
ADD CONSTRAINT sections_external_id_not_empty
CHECK (external_id IS NULL OR LENGTH(TRIM(external_id)) > 0);


-- 5.2. Проверка что external_source не пустая строка
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_external_source_not_empty;
ALTER TABLE projects
ADD CONSTRAINT projects_external_source_not_empty
CHECK (external_source IS NULL OR LENGTH(TRIM(external_source)) > 0);

ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_external_source_not_empty;
ALTER TABLE stages
ADD CONSTRAINT stages_external_source_not_empty
CHECK (external_source IS NULL OR LENGTH(TRIM(external_source)) > 0);

ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_external_source_not_empty;
ALTER TABLE objects
ADD CONSTRAINT objects_external_source_not_empty
CHECK (external_source IS NULL OR LENGTH(TRIM(external_source)) > 0);

ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_external_source_not_empty;
ALTER TABLE sections
ADD CONSTRAINT sections_external_source_not_empty
CHECK (external_source IS NULL OR LENGTH(TRIM(external_source)) > 0);


-- ========================================================================
-- ЧАСТЬ 6: ФИНАЛЬНАЯ ПРОВЕРКА
-- ========================================================================
-- Запустите эти запросы для проверки что всё работает корректно
-- ========================================================================

-- 6.1. Проверка что constraints созданы
SELECT
    conname as constraint_name,
    conrelid::regclass as table_name,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname IN (
    'projects_external_unique',
    'stages_project_external_unique',
    'objects_stage_external_unique',
    'sections_project_external_unique'
)
ORDER BY table_name;


-- 6.2. Проверка что индексы созданы
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
    AND schemaname = 'public'
    AND tablename IN ('projects', 'stages', 'objects', 'sections', 'profiles')
ORDER BY tablename, indexname;


-- 6.3. Финальная проверка дублей (должно быть 0 везде)
SELECT 'Projects' as table_name, COUNT(*) as duplicates_found FROM (
    SELECT external_id, external_source, COUNT(*) as cnt
    FROM projects
    WHERE external_id IS NOT NULL
    GROUP BY external_id, external_source
    HAVING COUNT(*) > 1
) t
UNION ALL
SELECT 'Stages', COUNT(*) FROM (
    SELECT stage_project_id, external_id, external_source, COUNT(*) as cnt
    FROM stages
    WHERE external_id IS NOT NULL
    GROUP BY stage_project_id, external_id, external_source
    HAVING COUNT(*) > 1
) t
UNION ALL
SELECT 'Objects', COUNT(*) FROM (
    SELECT object_stage_id, external_id, external_source, COUNT(*) as cnt
    FROM objects
    WHERE external_id IS NOT NULL
    GROUP BY object_stage_id, external_id, external_source
    HAVING COUNT(*) > 1
) t
UNION ALL
SELECT 'Sections', COUNT(*) FROM (
    SELECT section_project_id, external_id, external_source, COUNT(*) as cnt
    FROM sections
    WHERE external_id IS NOT NULL
    GROUP BY section_project_id, external_id, external_source
    HAVING COUNT(*) > 1
) t;


-- ========================================================================
-- ЧАСТЬ 7: ROLLBACK (если что-то пошло не так)
-- ========================================================================
-- Используйте эти команды только если нужно откатить изменения
-- ВНИМАНИЕ: Не выполняйте автоматически!
-- ========================================================================

/*
-- Удаление constraints
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_external_unique;
ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_project_external_unique;
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_stage_external_unique;
ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_project_external_unique;

-- Удаление индексов
DROP INDEX IF EXISTS idx_projects_external_id;
DROP INDEX IF EXISTS idx_projects_external_source;
DROP INDEX IF EXISTS idx_stages_project_id;
DROP INDEX IF EXISTS idx_stages_external_lookup;
DROP INDEX IF EXISTS idx_objects_stage_id;
DROP INDEX IF EXISTS idx_objects_external_lookup;
DROP INDEX IF EXISTS idx_sections_project_id;
DROP INDEX IF EXISTS idx_sections_object_id;
DROP INDEX IF EXISTS idx_sections_external_lookup;
DROP INDEX IF EXISTS idx_profiles_email_lower;
DROP INDEX IF EXISTS idx_profiles_name_search;

-- Удаление дополнительных constraints
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_external_id_not_empty;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_external_source_not_empty;
ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_external_id_not_empty;
ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_external_source_not_empty;
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_external_id_not_empty;
ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_external_source_not_empty;
ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_external_id_not_empty;
ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_external_source_not_empty;
*/


-- ========================================================================
-- КОНЕЦ МИГРАЦИИ
-- ========================================================================
-- После выполнения всех частей:
-- 1. Проверьте ЧАСТЬ 6 - все проверки должны пройти успешно
-- 2. Запустите синхронизацию для проверки работы приложения
-- 3. Мониторьте логи на предмет ошибок duplicate key
-- ========================================================================
