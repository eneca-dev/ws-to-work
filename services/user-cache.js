const supabaseService = require('./supabase');
const logger = require('../utils/logger');

/**
 * Кэш пользователей для быстрого поиска без запросов к БД
 * Загружает всех пользователей один раз и индексирует их в памяти
 */
class UserCache {
  constructor() {
    this.users = [];
    this.emailIndex = new Map();      // email → user
    this.nameIndex = new Map();       // full name → user
    this.emailPartIndex = new Map();  // email part → user
    this.initialized = false;
  }

  /**
   * Загружает всех пользователей и строит индексы
   */
  async initialize() {
    logger.info('🔄 Initializing user cache...');
    const startTime = Date.now();

    try {
      // Загружаем всех пользователей один раз
      this.users = await supabaseService.getUsers();

      // Строим индексы для быстрого поиска
      this.buildIndexes();

      const duration = Date.now() - startTime;
      logger.success(`✅ User cache initialized: ${this.users.length} users loaded in ${duration}ms`);
      this.initialized = true;

    } catch (error) {
      logger.error(`❌ Failed to initialize user cache: ${error.message}`);
      throw error;
    }
  }

  /**
   * Строит индексы для быстрого поиска
   */
  buildIndexes() {
    this.emailIndex.clear();
    this.nameIndex.clear();
    this.emailPartIndex.clear();

    for (const user of this.users) {
      // Индекс по email (точное совпадение)
      if (user.email) {
        const emailLower = user.email.toLowerCase().trim();
        this.emailIndex.set(emailLower, user);

        // Индекс по части email (до @)
        const emailPart = emailLower.split('@')[0];
        if (!this.emailPartIndex.has(emailPart)) {
          this.emailPartIndex.set(emailPart, user);
        }
      }

      // Индекс по полному имени
      if (user.first_name && user.last_name) {
        const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
        this.nameIndex.set(fullName, user);

        // Обратный порядок (Фамилия Имя)
        const reverseName = `${user.last_name} ${user.first_name}`.toLowerCase();
        if (!this.nameIndex.has(reverseName)) {
          this.nameIndex.set(reverseName, user);
        }
      }
    }

    logger.info(`📊 Indexes built: ${this.emailIndex.size} emails, ${this.nameIndex.size} names`);
  }

  /**
   * Поиск пользователя (с поддержкой всех стратегий)
   */
  findUser(searchTerm, stats = null) {
    if (!this.initialized) {
      throw new Error('User cache not initialized');
    }

    if (!searchTerm) {
      if (stats) stats.user_search.empty_queries++;
      return null;
    }

    const searchId = `cache_${Date.now()}`;
    logger.info(`🔍 [${searchId}] User cache search: "${searchTerm}"`);

    if (stats) {
      stats.user_search.total_searches++;
      stats.user_search.searches.push({
        search_term: searchTerm,
        search_id: searchId,
        timestamp: new Date().toISOString()
      });
    }

    // Стратегия 1: Точный поиск по email
    const emailResult = this.searchByExactEmail(searchTerm);
    if (emailResult) {
      logger.info(`✅ [${searchId}] Found by exact email`);
      if (stats) stats.user_search.successful_by_email++;
      return emailResult;
    }

    // Стратегия 2: Поиск по части email (до @)
    const emailPartResult = this.searchByEmailPart(searchTerm);
    if (emailPartResult) {
      logger.info(`✅ [${searchId}] Found by email part`);
      if (stats) stats.user_search.successful_by_email_part++;
      return emailPartResult;
    }

    // Стратегия 3: Поиск по полному имени
    const nameResult = this.searchByName(searchTerm);
    if (nameResult) {
      logger.info(`✅ [${searchId}] Found by name`);
      if (stats) stats.user_search.successful_by_name++;
      return nameResult;
    }

    // Стратегия 4: Поиск по частям имени
    const namePartsResult = this.searchByNameParts(searchTerm);
    if (namePartsResult) {
      logger.info(`✅ [${searchId}] Found by name parts`);
      if (stats) stats.user_search.successful_by_name_parts++;
      return namePartsResult;
    }

    // Стратегия 5: Fuzzy поиск
    const fuzzyResult = this.searchFuzzy(searchTerm);
    if (fuzzyResult) {
      logger.info(`✅ [${searchId}] Found by fuzzy search`);
      if (stats) stats.user_search.successful_by_fuzzy++;
      return fuzzyResult;
    }

    logger.warning(`❌ [${searchId}] User not found`);
    if (stats) stats.user_search.failed++;
    return null;
  }

  searchByExactEmail(email) {
    const emailLower = email.toLowerCase().trim();
    return this.emailIndex.get(emailLower) || null;
  }

  searchByEmailPart(searchTerm) {
    const emailPart = searchTerm.includes('@')
      ? searchTerm.split('@')[0]
      : searchTerm;
    return this.emailPartIndex.get(emailPart.toLowerCase()) || null;
  }

  searchByName(searchTerm) {
    const nameLower = searchTerm.trim().toLowerCase();
    return this.nameIndex.get(nameLower) || null;
  }

  searchByNameParts(searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    return this.users.find(user => {
      if (!user.first_name && !user.last_name) return false;
      const firstName = (user.first_name || '').toLowerCase();
      const lastName = (user.last_name || '').toLowerCase();
      return firstName.includes(searchLower) || lastName.includes(searchLower);
    }) || null;
  }

  searchFuzzy(searchTerm) {
    const searchWords = searchTerm.toLowerCase().split(/\s+/);
    return this.users.find(user => {
      const fullName = `${user.first_name || ''} ${user.last_name || ''} ${user.email || ''}`.toLowerCase();
      return searchWords.some(word => fullName.includes(word));
    }) || null;
  }

  /**
   * Очистка кэша
   */
  clear() {
    this.users = [];
    this.emailIndex.clear();
    this.nameIndex.clear();
    this.emailPartIndex.clear();
    this.initialized = false;
    logger.info('🗑️ User cache cleared');
  }

  /**
   * Проверка инициализации
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Получить статистику кэша
   */
  getStats() {
    return {
      total_users: this.users.length,
      email_index_size: this.emailIndex.size,
      name_index_size: this.nameIndex.size,
      email_part_index_size: this.emailPartIndex.size,
      initialized: this.initialized
    };
  }
}

module.exports = new UserCache();
