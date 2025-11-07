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
  
  // Stages
  async getStages() {
    try {
      const { data, error } = await this.client
        .from('stages')
        .select('*');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Error getting stages: ${error.message}`);
      throw error;
    }
  }
  
  async createStage(data) {
    try {
      const { data: result, error } = await this.client
        .from('stages')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error creating stage: ${error.message}`);
      throw error;
    }
  }
  
  async updateStage(id, data) {
    try {
      const { data: result, error } = await this.client
        .from('stages')
        .update(data)
        .eq('stage_id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      logger.error(`Error updating stage: ${error.message}`);
      throw error;
    }
  }

  // Поиск стадии по ключу (проект + источник + внешний ID)
  async getStageByKey(projectId, externalSource, externalId) {
    try {
      const { data, error } = await this.client
        .from('stages')
        .select('*')
        .eq('stage_project_id', projectId)
        .eq('external_source', externalSource)
        .eq('external_id', externalId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error(`Error getting stage by key: ${error.message}`);
      throw error;
    }
  }

  // Идемпотентный upsert стадии
  async upsertStageByKey(projectId, externalSource, externalId, data) {
    try {
      // Валидация ключа дедупликации
      const keyValidation = validator.validateDeduplicationKey(externalId, externalSource);
      if (!keyValidation.valid) {
        const errorMsg = `Stage deduplication key validation failed: ${keyValidation.errors.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Валидация данных
      const validation = validator.validateStage(data);
      if (!validation.valid) {
        const errorMsg = `Stage validation failed: ${validation.errors.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const existing = await this.getStageByKey(projectId, externalSource, externalId);
      if (existing) {
        // Проверяем нужно ли обновление (по хэшу если есть)
        if (existing.content_hash && validation.data.content_hash) {
          if (!validator.needsUpdate(existing.content_hash, validation.data.content_hash)) {
            logger.info(`Stage "${validation.data.stage_name}" unchanged, skipping update`);
            return existing;
          }
        }
        return await this.updateStage(existing.stage_id, validation.data);
      }

      const insertPayload = {
        ...validation.data,
        stage_project_id: projectId,
        external_source: externalSource,
        external_id: externalId
      };

      const { data: created, error } = await this.client
        .from('stages')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return created;
    } catch (error) {
      if (error.code === '23505') {
        logger.warning(`Duplicate key detected for stage, retrying...`);
        try {
          const existing = await this.getStageByKey(projectId, externalSource, externalId);
          if (existing) {
            return await this.updateStage(existing.stage_id, data);
          }
        } catch (nestedError) {
          logger.error(`Upsert stage (conflict) failed: ${nestedError.message}`);
        }
      }
      logger.error(`Error upserting stage: ${error.message}`);
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

  // Поиск объекта по ключу (проект + источник + внешний ID) через стадию
  async getObjectByKey(projectId, stageId, externalSource, externalId) {
    try {
      // Объект уникален в рамках стадии; для идемпотентности учитываем и проект
      const { data, error } = await this.client
        .from('objects')
        .select('*, stages!inner(stage_id, stage_project_id)')
        .eq('object_stage_id', stageId)
        .eq('external_source', externalSource)
        .eq('external_id', externalId)
        .eq('stages.stage_project_id', projectId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error(`Error getting object by key: ${error.message}`);
      throw error;
    }
  }

  // Идемпотентный upsert объекта
  async upsertObjectByKey(projectId, stageId, externalSource, externalId, data) {
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

      const existing = await this.getObjectByKey(projectId, stageId, externalSource, externalId);
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
        object_stage_id: stageId,
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
          const existing = await this.getObjectByKey(projectId, stageId, externalSource, externalId);
          if (existing) {
            return await this.updateObject(existing.object_id, data);
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
        { count: stagesCount },
        { count: objectsCount },
        { count: sectionsCount }
      ] = await Promise.all([
        this.client.from('projects').select('*', { count: 'exact', head: true }).not('external_id', 'is', null),
        this.client.from('stages').select('*', { count: 'exact', head: true }).not('external_id', 'is', null),
        this.client.from('objects').select('*', { count: 'exact', head: true }).not('external_id', 'is', null),
        this.client.from('sections').select('*', { count: 'exact', head: true }).not('external_id', 'is', null)
      ]);

      return {
        projects: projectsCount || 0,
        stages: stagesCount || 0,
        objects: objectsCount || 0,
        sections: sectionsCount || 0,
        total: (projectsCount || 0) + (stagesCount || 0) + (objectsCount || 0) + (sectionsCount || 0)
      };
    } catch (error) {
      logger.error(`Error counting synced records: ${error.message}`);
      return { projects: 0, stages: 0, objects: 0, sections: 0, total: 0 };
    }
  }
}

module.exports = new SupabaseService(); 