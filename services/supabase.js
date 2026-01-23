const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/env');
const logger = require('../utils/logger');
const validator = require('../utils/validator');

class SupabaseService {
  constructor() {
    this.client = createClient(config.supabase.url, config.supabase.key);
  }
  
  // Projects
  async getProjects() {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting projects: ${error.message}`);
      throw error;
    }
  }
  
  async getProjectsWithExternalId() {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .not('external_id', 'is', null);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting projects with external_id: ${error.message}`);
      throw error;
    }
  }
  
  async createProject(data) {
    try {
      // Валидация данных перед вставкой
      const validation = validator.validateProject(data);
      if (!validation.valid) {
        const errorMsg = `Project validation failed: ${validation.errors.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const { data: result, error } = await this.client
        .from('projects')
        .insert(validation.data)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error creating project: ${error.message}`);
      throw error;
    }
  }
  
  async updateProject(id, data) {
    try {
      // Валидация данных перед обновлением
      const validation = validator.validateProject(data);
      if (!validation.valid) {
        const errorMsg = `Project validation failed: ${validation.errors.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const { data: result, error } = await this.client
        .from('projects')
        .update(validation.data)
        .eq('project_id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error updating project: ${error.message}`);
      throw error;
    }
  }

  async getProjectByExternalId(externalId) {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('project_id, project_name, external_id, external_source')
        .eq('external_id', externalId)
        .eq('external_source', 'worksection')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Error getting project by external_id: ${error.message}`);
      throw error;
    }
  }

  // Objects
  async getObjects() {
    try {
      const { data, error } = await this.client
        .from('objects')
        .select('*');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting objects: ${error.message}`);
      throw error;
    }
  }
  
  async createObject(data) {
    try {
      const { data: result, error } = await this.client
        .from('objects')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error creating object: ${error.message}`);
      throw error;
    }
  }
  
  async updateObject(id, data) {
    try {
      const { data: result, error } = await this.client
        .from('objects')
        .update(data)
        .eq('object_id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error updating object: ${error.message}`);
      throw error;
    }
  }

  // Поиск объекта по ключу (проект + источник + внешний ID) - напрямую через project_id
  async getObjectByProjectKey(projectId, externalSource, externalId) {
    try {
      const { data, error } = await this.client
        .from('objects')
        .select('*')
        .eq('object_project_id', projectId)
        .eq('external_source', externalSource)
        .eq('external_id', externalId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error(`Error getting object by project key: ${error.message}`);
      throw error;
    }
  }

  // Идемпотентный upsert объекта - привязка к проекту напрямую
  async upsertObjectByProjectKey(projectId, externalSource, externalId, data) {
    try {
      // Валидация ключа дедупликации
      const keyValidation = validator.validateDeduplicationKey(externalId, externalSource);
      if (!keyValidation.valid) {
        const errorMsg = `Object deduplication key validation failed: ${keyValidation.errors.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Валидация данных
      const validation = validator.validateObject(data);
      if (!validation.valid) {
        const errorMsg = `Object validation failed: ${validation.errors.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const existing = await this.getObjectByProjectKey(projectId, externalSource, externalId);
      if (existing) {
        // Проверяем нужно ли обновление (по хэшу если есть)
        if (existing.content_hash && validation.data.content_hash) {
          if (!validator.needsUpdate(existing.content_hash, validation.data.content_hash)) {
            logger.info(`Object "${validation.data.object_name}" unchanged, skipping update`);
            return existing;
          }
        }
        return await this.updateObject(existing.object_id, validation.data);
      }

      const insertPayload = {
        ...validation.data,
        object_project_id: projectId,
        external_source: externalSource,
        external_id: externalId
      };

      const { data: created, error } = await this.client
        .from('objects')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return created;
    } catch (error) {
      if (error.code === '23505') {
        logger.warning(`Duplicate key detected for object, retrying...`);
        try {
          const existing = await this.getObjectByProjectKey(projectId, externalSource, externalId);
          if (existing) {
            const validation = validator.validateObject(data);
            return await this.updateObject(existing.object_id, validation.data);
          }
        } catch (nestedError) {
          logger.error(`Upsert object (conflict) failed: ${nestedError.message}`);
        }
      }
      logger.error(`Error upserting object: ${error.message}`);
      throw error;
    }
  }

  // Sections
  async getSections() {
    try {
      const { data, error } = await this.client
        .from('sections')
        .select('*');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting sections: ${error.message}`);
      throw error;
    }
  }
  
  async createSection(data) {
    try {
      const { data: result, error } = await this.client
        .from('sections')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error creating section: ${error.message}`);
      throw error;
    }
  }
  
  async updateSection(id, data) {
    try {
      const { data: result, error } = await this.client
        .from('sections')
        .update(data)
        .eq('section_id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error updating section: ${error.message}`);
      throw error;
    }
  }

  // Поиск раздела по ключу (проект + источник + внешний ID) для идемпотентной синхронизации
  async getSectionByKey(projectId, externalSource, externalId) {
    try {
      const { data, error } = await this.client
        .from('sections')
        .select('*')
        .eq('section_project_id', projectId)
        .eq('external_source', externalSource)
        .eq('external_id', externalId)
        .single();

      // PGRST116 — нет строк, возвращаем null
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error(`Error getting section by key: ${error.message}`);
      throw error;
    }
  }

  // Идемпотентный upsert раздела: сначала ищем по ключу, затем update или insert.
  // Обрабатываем возможную конкуренцию/триггер 23505 повторно — читаем и обновляем.
  async upsertSectionByKey(projectId, externalSource, externalId, data) {
    try {
      // Валидация ключа дедупликации
      const keyValidation = validator.validateDeduplicationKey(externalId, externalSource);
      if (!keyValidation.valid) {
        const errorMsg = `Section deduplication key validation failed: ${keyValidation.errors.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Валидация данных
      const validation = validator.validateSection(data);
      if (!validation.valid) {
        const errorMsg = `Section validation failed: ${validation.errors.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const existing = await this.getSectionByKey(projectId, externalSource, externalId);
      if (existing) {
        // Проверяем нужно ли обновление (по хэшу если есть)
        if (existing.content_hash && validation.data.content_hash) {
          if (!validator.needsUpdate(existing.content_hash, validation.data.content_hash)) {
            logger.info(`Section "${validation.data.section_name}" unchanged, skipping update`);
            return existing;
          }
        }
        return await this.updateSection(existing.section_id, validation.data);
      }

      // Вставка новой записи
      const insertPayload = {
        ...validation.data,
        section_project_id: projectId,
        external_source: externalSource,
        external_id: externalId
      };

      const { data: created, error } = await this.client
        .from('sections')
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;
      return created;
    } catch (error) {
      // Обработка конфликта уникальности, вызванного триггером в БД
      if (error.code === '23505') {
        logger.warning(`Duplicate key detected for section, retrying...`);
        try {
          const existing = await this.getSectionByKey(projectId, externalSource, externalId);
          if (existing) {
            return await this.updateSection(existing.section_id, data);
          }
        } catch (nestedError) {
          logger.error(`Upsert (conflict recovery) failed: ${nestedError.message}`);
        }
      }
      logger.error(`Error upserting section: ${error.message}`);
      throw error;
    }
  }
  
  // Users (Profiles)
  async getUsers() {
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('*');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting users: ${error.message}`);
      throw error;
    }
  }
  
  // Улучшенная функция поиска пользователей с максимальной гибкостью
  async findUser(searchTerm, stats = null) {
    if (!searchTerm) {
      if (stats) stats.user_search.empty_queries++;
      return null;
    }
    
    const searchId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.info(`🔍 [${searchId}] Starting user search for: "${searchTerm}"`);
    
    if (stats) {
      stats.user_search.total_searches++;
      stats.user_search.searches.push({
        search_term: searchTerm,
        search_id: searchId,
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      // Стратегия 1: Точный поиск по email
      const emailResult = await this.searchByExactEmail(searchTerm, searchId);
      if (emailResult) {
        logger.info(`✅ [${searchId}] Found by exact email: ${emailResult.first_name} ${emailResult.last_name} (${emailResult.email})`);
        if (stats) stats.user_search.successful_by_email++;
        return emailResult;
      }
      
      // Стратегия 2: Поиск по части email (до @)
      const emailPartResult = await this.searchByEmailPart(searchTerm, searchId);
      if (emailPartResult) {
        logger.info(`✅ [${searchId}] Found by email part: ${emailPartResult.first_name} ${emailPartResult.last_name} (${emailPartResult.email})`);
        if (stats) stats.user_search.successful_by_email_part++;
        return emailPartResult;
      }
      
      // Стратегия 3: Поиск по полному имени (прямой и обратный порядок)
      const nameResult = await this.searchByName(searchTerm, searchId);
      if (nameResult) {
        logger.info(`✅ [${searchId}] Found by name: ${nameResult.first_name} ${nameResult.last_name} (${nameResult.email})`);
        if (stats) stats.user_search.successful_by_name++;
        return nameResult;
      }
      
      // Стратегия 4: Поиск по частям имени
      const namePartsResult = await this.searchByNameParts(searchTerm, searchId);
      if (namePartsResult) {
        logger.info(`✅ [${searchId}] Found by name parts: ${namePartsResult.first_name} ${namePartsResult.last_name} (${namePartsResult.email})`);
        if (stats) stats.user_search.successful_by_name_parts++;
        return namePartsResult;
      }
      
      // Стратегия 5: Fuzzy поиск
      const fuzzyResult = await this.searchFuzzy(searchTerm, searchId);
      if (fuzzyResult) {
        logger.info(`✅ [${searchId}] Found by fuzzy search: ${fuzzyResult.first_name} ${fuzzyResult.last_name} (${fuzzyResult.email})`);
        if (stats) stats.user_search.successful_by_fuzzy++;
        return fuzzyResult;
      }
      
      logger.warning(`❌ [${searchId}] User not found: "${searchTerm}"`);
      if (stats) stats.user_search.failed++;
      return null;
      
    } catch (error) {
      logger.error(`❌ [${searchId}] Error searching user "${searchTerm}": ${error.message}`);
      if (stats) stats.user_search.errors++;
      return null;
    }
  }
  
  async searchByExactEmail(email, searchId) {
    try {
      logger.info(`🔍 [${searchId}] Strategy 1: Exact email search`);
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error(`Error in exact email search: ${error.message}`);
      return null;
    }
  }
  
  async searchByEmailPart(searchTerm, searchId) {
    try {
      logger.info(`🔍 [${searchId}] Strategy 2: Email part search`);
      const emailPart = searchTerm.includes('@') ? searchTerm.split('@')[0] : searchTerm;
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .ilike('email', `${emailPart}%@%`);
      
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      logger.error(`Error in email part search: ${error.message}`);
      return null;
    }
  }
  
  async searchByName(searchTerm, searchId) {
    try {
      logger.info(`🔍 [${searchId}] Strategy 3: Full name search`);
      const nameParts = searchTerm.trim().split(/\s+/);
      if (nameParts.length < 2) return null;
      
      // Прямой порядок: Имя Фамилия
      const { data: directData, error: directError } = await this.client
        .from('profiles')
        .select('*')
        .ilike('first_name', `%${nameParts[0]}%`)
        .ilike('last_name', `%${nameParts[1]}%`);
      
      if (directData && directData.length > 0) return directData[0];
      
      // Обратный порядок: Фамилия Имя
      const { data: reverseData, error: reverseError } = await this.client
        .from('profiles')
        .select('*')
        .ilike('first_name', `%${nameParts[1]}%`)
        .ilike('last_name', `%${nameParts[0]}%`);
      
      return reverseData && reverseData.length > 0 ? reverseData[0] : null;
    } catch (error) {
      logger.error(`Error in name search: ${error.message}`);
      return null;
    }
  }
  
  async searchByNameParts(searchTerm, searchId) {
    try {
      logger.info(`🔍 [${searchId}] Strategy 4: Name parts search`);
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`);
      
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      logger.error(`Error in name parts search: ${error.message}`);
      return null;
    }
  }
  
  async searchFuzzy(searchTerm, searchId) {
    try {
      logger.info(`🔍 [${searchId}] Strategy 5: Fuzzy search`);
      const searchWords = searchTerm.toLowerCase().split(/\s+/);
      const { data, error } = await this.client
        .from('profiles')
        .select('*');
      
      if (error) throw error;
      if (!data) return null;
      
      // Ищем пользователя где хотя бы одно слово совпадает
      const candidates = data.filter(user => {
        const fullName = `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase();
        return searchWords.some(word => fullName.includes(word));
      });
      
      return candidates.length > 0 ? candidates[0] : null;
    } catch (error) {
      logger.error(`Error in fuzzy search: ${error.message}`);
      return null;
    }
  }
  
  // Deprecated: для обратной совместимости
  async findUserByEmail(email) {
    return this.findUser(email);
  }

  // Deprecated: для обратной совместимости
  async findUserByName(name) {
    return this.findUser(name);
  }

  /**
   * Подсчитывает синхронизированные записи (с external_id)
   */
  async countSyncedRecords() {
    try {
      const [
        { count: projectsCount },
        { count: objectsCount },
        { count: sectionsCount },
        { count: decompositionStagesCount },
        { count: decompositionItemsCount }
      ] = await Promise.all([
        this.client.from('projects').select('*', { count: 'exact', head: true }).not('external_id', 'is', null),
        this.client.from('objects').select('*', { count: 'exact', head: true }).not('external_id', 'is', null),
        this.client.from('sections').select('*', { count: 'exact', head: true }).not('external_id', 'is', null),
        this.client.from('decomposition_stages').select('*', { count: 'exact', head: true }).not('external_id', 'is', null),
        this.client.from('decomposition_items').select('*', { count: 'exact', head: true }).not('external_id', 'is', null)
      ]);

      return {
        projects: projectsCount || 0,
        objects: objectsCount || 0,
        sections: sectionsCount || 0,
        decomposition_stages: decompositionStagesCount || 0,
        decomposition_items: decompositionItemsCount || 0,
        total: (projectsCount || 0) + (objectsCount || 0) + (sectionsCount || 0) +
               (decompositionStagesCount || 0) + (decompositionItemsCount || 0)
      };
    } catch (error) {
      logger.error(`Error counting synced records: ${error.message}`);
      return { projects: 0, objects: 0, sections: 0, decomposition_stages: 0, decomposition_items: 0, total: 0 };
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DECOMPOSITION STAGES (3rd level nested tasks)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getDecompositionStageByExternalId(externalId) {
    try {
      const { data, error } = await this.client
        .from('decomposition_stages')
        .select('*')
        .eq('external_id', externalId)
        .eq('external_source', 'worksection')
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`Error getting decomposition_stage by external_id: ${error.message}`);
      throw error;
    }
  }

  async createDecompositionStage(data) {
    try {
      const { data: result, error } = await this.client
        .from('decomposition_stages')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error creating decomposition_stage: ${error.message}`);
      throw error;
    }
  }

  async updateDecompositionStage(stageId, data) {
    try {
      const { data: result, error } = await this.client
        .from('decomposition_stages')
        .update(data)
        .eq('decomposition_stage_id', stageId)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error updating decomposition_stage: ${error.message}`);
      throw error;
    }
  }

  async getSectionByExternalId(externalId, externalSource = 'worksection') {
    try {
      const { data, error } = await this.client
        .from('sections')
        .select('*')
        .eq('external_id', externalId)
        .eq('external_source', externalSource)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`Error getting section by external_id: ${error.message}`);
      throw error;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DECOMPOSITION ITEMS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getDecompositionItemByExternalId(externalId) {
    try {
      const { data, error } = await this.client
        .from('decomposition_items')
        .select('*')
        .eq('external_id', externalId)
        .eq('external_source', 'worksection')
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`Error getting decomposition_item by external_id: ${error.message}`);
      throw error;
    }
  }

  async createDecompositionItem(data) {
    try {
      const { data: result, error } = await this.client
        .from('decomposition_items')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error creating decomposition_item: ${error.message}`);
      throw error;
    }
  }

  async updateDecompositionItem(itemId, data) {
    try {
      const { data: result, error } = await this.client
        .from('decomposition_items')
        .update(data)
        .eq('decomposition_item_id', itemId)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error updating decomposition_item: ${error.message}`);
      throw error;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // WORK LOGS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getWorkLogByExternalId(externalId) {
    try {
      const { data, error } = await this.client
        .from('work_logs')
        .select('*')
        .eq('external_id', externalId)
        .eq('external_source', 'worksection')
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`Error getting work_log by external_id: ${error.message}`);
      throw error;
    }
  }

  async createWorkLog(data) {
    try {
      const { data: result, error } = await this.client
        .from('work_logs')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error creating work_log: ${error.message}`);
      throw error;
    }
  }

  async getWorkLogsByProject(projectId) {
    try {
      const { data, error } = await this.client
        .from('work_logs')
        .select(`
          work_log_id,
          work_log_date,
          work_log_hours,
          work_log_amount,
          work_log_description,
          external_id,
          external_source,
          decomposition_items!inner (
            decomposition_item_id,
            sections!inner (
              section_id,
              section_project_id
            )
          ),
          profiles (
            user_id,
            email,
            first_name,
            last_name
          )
        `)
        .eq('decomposition_items.sections.section_project_id', projectId)
        .eq('external_source', 'worksection');

      if (error) throw error;

      // Преобразуем результат для удобства
      return (data || []).map(wl => ({
        work_log_id: wl.work_log_id,
        work_log_date: wl.work_log_date,
        work_log_hours: wl.work_log_hours,
        work_log_amount: wl.work_log_amount,
        work_log_description: wl.work_log_description,
        external_id: wl.external_id,
        external_source: wl.external_source,
        user_email: wl.profiles?.email,
        user_name: `${wl.profiles?.first_name || ''} ${wl.profiles?.last_name || ''}`.trim()
      }));

    } catch (error) {
      logger.error(`Error getting work_logs by project: ${error.message}`);
      throw error;
    }
  }

  async getWorkLogsByBudget(budgetId) {
    try {
      const { data, error } = await this.client
        .from('work_logs')
        .select('work_log_id, work_log_amount')
        .eq('budget_id', budgetId);

      if (error) throw error;

      return data || [];

    } catch (error) {
      logger.error(`Error getting work_logs by budget: ${error.message}`);
      throw error;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BUDGETS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getBudgetForDecompositionItem(decompositionItemId) {
    try {
      const { data, error } = await this.client
        .from('budgets')
        .select('*')
        .eq('entity_type', 'decomposition_item')
        .eq('entity_id', decompositionItemId)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`Error getting budget for decomposition_item: ${error.message}`);
      throw error;
    }
  }

  async updateBudget(budgetId, data) {
    try {
      const { data: result, error } = await this.client
        .from('budgets')
        .update(data)
        .eq('budget_id', budgetId)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error updating budget: ${error.message}`);
      throw error;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PROFILES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getProfile(userId) {
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`Error getting profile: ${error.message}`);
      throw error;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPER METHODS FOR CONSTANTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async getDifficultyIdByName(name) {
    try {
      const { data, error } = await this.client
        .from('decomposition_difficulty_levels')
        .select('difficulty_id')
        .eq('difficulty_abbr', name) // ✅ Используем difficulty_abbr вместо difficulty_name
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data?.difficulty_id || null;
    } catch (error) {
      logger.error(`Error getting difficulty ID by name "${name}": ${error.message}`);
      return null;
    }
  }

  async getWorkCategoryIdByName(name) {
    try {
      const { data, error } = await this.client
        .from('work_categories')
        .select('work_category_id')
        .eq('work_category_name', name)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data?.work_category_id || null;
    } catch (error) {
      logger.error(`Error getting work category ID by name "${name}": ${error.message}`);
      return null;
    }
  }

  async getStatusIdByName(name) {
    try {
      const { data, error } = await this.client
        .from('section_statuses') // ✅ Используем section_statuses (для decomposition_items)
        .select('id')
        .eq('name', name)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data?.id || null;
    } catch (error) {
      logger.error(`Error getting status ID by name "${name}": ${error.message}`);
      return null;
    }
  }
}

module.exports = new SupabaseService(); 