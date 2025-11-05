const crypto = require('crypto');
const logger = require('./logger');

/**
 * Модуль валидации и нормализации данных перед записью в БД
 * Предотвращает запись невалидных данных и помогает избежать дублей
 */
class Validator {

  /**
   * Валидация и нормализация данных проекта
   */
  validateProject(data, externalData = {}) {
    const errors = [];
    const normalized = {};

    // Обязательные поля
    if (!data.project_name || typeof data.project_name !== 'string') {
      errors.push('project_name is required and must be a string');
    } else {
      normalized.project_name = this.sanitizeString(data.project_name, 255);
    }

    // External ID валидация
    if (data.external_id !== undefined) {
      if (data.external_id === null || data.external_id === '') {
        errors.push('external_id cannot be empty string');
      } else {
        normalized.external_id = String(data.external_id).trim();
      }
    }

    // External source валидация
    if (data.external_source !== undefined) {
      if (data.external_source === null || data.external_source === '') {
        errors.push('external_source cannot be empty string');
      } else {
        normalized.external_source = this.sanitizeString(data.external_source, 50);
      }
    }

    // Опциональные поля
    if (data.project_description !== undefined) {
      normalized.project_description = data.project_description
        ? this.sanitizeString(data.project_description, 5000)
        : null;
    }

    if (data.project_manager !== undefined) {
      normalized.project_manager = data.project_manager || null;
    }

    if (data.external_updated_at !== undefined) {
      normalized.external_updated_at = data.external_updated_at || new Date().toISOString();
    }

    // Вычисляем content hash для определения изменений
    if (Object.keys(externalData).length > 0) {
      normalized.content_hash = this.calculateContentHash({
        name: normalized.project_name,
        description: normalized.project_description,
        manager: normalized.project_manager
      });
    }

    return { valid: errors.length === 0, errors, data: normalized };
  }

  /**
   * Валидация и нормализация данных стадии
   */
  validateStage(data, externalData = {}) {
    const errors = [];
    const normalized = {};

    // Обязательные поля
    if (!data.stage_name || typeof data.stage_name !== 'string') {
      errors.push('stage_name is required and must be a string');
    } else {
      normalized.stage_name = this.sanitizeString(data.stage_name, 255);
    }

    // Опциональные поля
    if (data.stage_description !== undefined) {
      normalized.stage_description = data.stage_description
        ? this.sanitizeString(data.stage_description, 2000)
        : null;
    }

    if (data.stage_project_id !== undefined) {
      normalized.stage_project_id = data.stage_project_id;
    }

    if (data.external_id !== undefined) {
      if (data.external_id === null || data.external_id === '') {
        errors.push('external_id cannot be empty string');
      } else {
        normalized.external_id = String(data.external_id).trim();
      }
    }

    if (data.external_source !== undefined) {
      if (data.external_source === null || data.external_source === '') {
        errors.push('external_source cannot be empty string');
      } else {
        normalized.external_source = this.sanitizeString(data.external_source, 50);
      }
    }

    // Вычисляем content hash
    if (Object.keys(externalData).length > 0) {
      normalized.content_hash = this.calculateContentHash({
        name: normalized.stage_name,
        description: normalized.stage_description
      });
    }

    return { valid: errors.length === 0, errors, data: normalized };
  }

  /**
   * Валидация и нормализация данных объекта
   */
  validateObject(data, externalData = {}) {
    const errors = [];
    const normalized = {};

    // Обязательные поля
    if (!data.object_name || typeof data.object_name !== 'string') {
      errors.push('object_name is required and must be a string');
    } else {
      normalized.object_name = this.sanitizeString(data.object_name, 255);
    }

    // Опциональные поля
    if (data.object_description !== undefined) {
      normalized.object_description = data.object_description
        ? this.sanitizeString(data.object_description, 5000)
        : null;
    }

    if (data.object_stage_id !== undefined) {
      normalized.object_stage_id = data.object_stage_id;
    }

    if (data.external_id !== undefined) {
      if (data.external_id === null || data.external_id === '') {
        errors.push('external_id cannot be empty string');
      } else {
        normalized.external_id = String(data.external_id).trim();
      }
    }

    if (data.external_source !== undefined) {
      if (data.external_source === null || data.external_source === '') {
        errors.push('external_source cannot be empty string');
      } else {
        normalized.external_source = this.sanitizeString(data.external_source, 50);
      }
    }

    if (data.external_updated_at !== undefined) {
      normalized.external_updated_at = data.external_updated_at || new Date().toISOString();
    }

    // Вычисляем content hash
    if (Object.keys(externalData).length > 0) {
      normalized.content_hash = this.calculateContentHash({
        name: normalized.object_name,
        description: normalized.object_description
      });
    }

    return { valid: errors.length === 0, errors, data: normalized };
  }

  /**
   * Валидация и нормализация данных раздела
   */
  validateSection(data, externalData = {}) {
    const errors = [];
    const normalized = {};

    // Обязательные поля
    if (!data.section_name || typeof data.section_name !== 'string') {
      errors.push('section_name is required and must be a string');
    } else {
      normalized.section_name = this.sanitizeString(data.section_name, 255);
    }

    // Опциональные поля
    if (data.section_description !== undefined) {
      normalized.section_description = data.section_description
        ? this.sanitizeString(data.section_description, 5000)
        : null;
    }

    if (data.section_object_id !== undefined) {
      normalized.section_object_id = data.section_object_id;
    }

    if (data.section_project_id !== undefined) {
      normalized.section_project_id = data.section_project_id;
    }

    if (data.section_responsible !== undefined) {
      normalized.section_responsible = data.section_responsible || null;
    }

    // Валидация дат
    if (data.section_start_date !== undefined) {
      normalized.section_start_date = this.validateDate(data.section_start_date);
    }

    if (data.section_end_date !== undefined) {
      normalized.section_end_date = this.validateDate(data.section_end_date);
    }

    if (data.external_id !== undefined) {
      if (data.external_id === null || data.external_id === '') {
        errors.push('external_id cannot be empty string');
      } else {
        normalized.external_id = String(data.external_id).trim();
      }
    }

    if (data.external_source !== undefined) {
      if (data.external_source === null || data.external_source === '') {
        errors.push('external_source cannot be empty string');
      } else {
        normalized.external_source = this.sanitizeString(data.external_source, 50);
      }
    }

    if (data.external_updated_at !== undefined) {
      normalized.external_updated_at = data.external_updated_at || new Date().toISOString();
    }

    // Вычисляем content hash
    if (Object.keys(externalData).length > 0) {
      normalized.content_hash = this.calculateContentHash({
        name: normalized.section_name,
        description: normalized.section_description,
        responsible: normalized.section_responsible,
        start_date: normalized.section_start_date,
        end_date: normalized.section_end_date
      });
    }

    return { valid: errors.length === 0, errors, data: normalized };
  }

  /**
   * Sanitize строки: trim, ограничение длины
   */
  sanitizeString(str, maxLength = 255) {
    if (str === null || str === undefined) return null;

    let sanitized = String(str).trim();

    // Удаляем невидимые символы
    sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    // Ограничиваем длину
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
      logger.warning(`String truncated to ${maxLength} characters`);
    }

    return sanitized;
  }

  /**
   * Валидация даты
   */
  validateDate(dateStr) {
    if (!dateStr) return null;

    // Проверяем что это валидная дата
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      logger.warning(`Invalid date format: ${dateStr}`);
      return null;
    }

    return dateStr;
  }

  /**
   * Вычисление хэша содержимого для определения изменений
   * Используем MD5 для быстрого сравнения (не для безопасности)
   */
  calculateContentHash(data) {
    // Сортируем ключи для консистентности
    const sortedKeys = Object.keys(data).sort();
    const normalizedData = {};

    sortedKeys.forEach(key => {
      const value = data[key];
      // Нормализуем значения
      if (value === null || value === undefined) {
        normalizedData[key] = '';
      } else if (typeof value === 'string') {
        normalizedData[key] = value.trim().toLowerCase();
      } else {
        normalizedData[key] = String(value);
      }
    });

    const content = JSON.stringify(normalizedData);
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Проверка нужно ли обновление (сравнение хэшей)
   */
  needsUpdate(existingHash, newHash) {
    if (!existingHash || !newHash) return true;
    return existingHash !== newHash;
  }

  /**
   * Проверка что external_id и external_source валидны для дедупликации
   */
  validateDeduplicationKey(externalId, externalSource) {
    const errors = [];

    if (!externalId || externalId.trim() === '') {
      errors.push('external_id is required for deduplication');
    }

    if (!externalSource || externalSource.trim() === '') {
      errors.push('external_source is required for deduplication');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Логирование ошибок валидации
   */
  logValidationErrors(entityType, entityName, errors) {
    if (errors.length > 0) {
      logger.error(`Validation failed for ${entityType} "${entityName}": ${errors.join(', ')}`);
      return false;
    }
    return true;
  }
}

module.exports = new Validator();
