const axios = require('axios');
const crypto = require('crypto-js');
const { config } = require('../config/env');
const logger = require('../utils/logger');

class WorksectionService {
  constructor() {
    this.baseUrl = `https://${config.worksection.domain}/api/admin/v2/`;
    this.apiKey = config.worksection.hash; // Это теперь API ключ, а не готовый хеш
  }
  
  // Формирование MD5 хеша согласно документации
  generateHash(queryParams) {
    const hashInput = queryParams + this.apiKey;
    return crypto.MD5(hashInput).toString();
  }
  
  async request(action, params = {}) {
    try {
      // Формируем query параметры
      const queryParams = new URLSearchParams({ action, ...params });
      const queryString = queryParams.toString();
      
      // Генерируем хеш из query параметров + API ключ
      const hash = this.generateHash(queryString);
      
      // Добавляем хеш к query параметрам
      queryParams.append('hash', hash);
      
      // Формируем полный URL
      const url = `${this.baseUrl}?${queryParams.toString()}`;
      
      logger.info(`Worksection API: ${action}`);
      logger.info(`Request URL: ${url.replace(/hash=[^&]+/, 'hash=***')}`); // Скрываем хеш в логах
      
      // Делаем GET запрос
      const response = await axios.get(url);
      
      if (response.data.status !== 'ok') {
        throw new Error(response.data.message || 'Unknown API error');
      }
      
      return response.data;
      
    } catch (error) {
      logger.error(`Worksection API error: ${error.message}`);
      throw error;
    }
  }
  
  async getProjects() {
    const data = await this.request('get_projects');
    const projects = data.data || [];
    
    // Отладочная информация о первом проекте
    if (projects.length > 0) {
      const firstProject = projects[0];
      logger.info(`Sample project structure: ${JSON.stringify({
        id: firstProject.id,
        name: firstProject.name,
        tags: firstProject.tags,
        tagsType: typeof firstProject.tags,
        isArray: Array.isArray(firstProject.tags)
      })}`);
    }
    
    return projects;
  }
  
  async getProjectTasks(projectId) {
    const data = await this.request('get_tasks', { 
      id_project: projectId,
      extra: 'subtasks'
    });
    return data.data || [];
  }
  
  async getProjectsWithTag(tagName = 'eneca.work sync') {
    const projects = await this.getProjects();
    return projects.filter(project => {
      if (!project.tags) return false;
      
      // Если tags - массив
      if (Array.isArray(project.tags)) {
        return project.tags.includes(tagName);
      }
      
      // Если tags - строка
      if (typeof project.tags === 'string') {
        return project.tags.includes(tagName);
      }
      
      // Если tags - объект, проверяем его свойства
      if (typeof project.tags === 'object') {
        return Object.values(project.tags).some(tag => 
          tag && tag.toString().includes(tagName)
        );
      }
      
      return false;
    });
  }

  // Получить все проекты с любой меткой синхронизации
  async getProjectsWithSyncTags() {
    const projects = await this.getProjects();
    return projects.filter(project => {
      if (!project.tags) return false;
      
      const hasSyncTag = (tagValue) => {
        return tagValue && (
          tagValue.toString().includes('eneca.work sync OS') ||
          tagValue.toString().includes('eneca.work sync')
        );
      };
      
      // Если tags - массив
      if (Array.isArray(project.tags)) {
        return project.tags.some(hasSyncTag);
      }
      
      // Если tags - строка
      if (typeof project.tags === 'string') {
        return hasSyncTag(project.tags);
      }
      
      // Если tags - объект, проверяем его свойства
      if (typeof project.tags === 'object') {
        return Object.values(project.tags).some(hasSyncTag);
      }
      
      return false;
    });
  }

  // Определить тип синхронизации проекта
  determineProjectSyncType(project) {
    if (!project.tags) return null;
    
    const hasOSTag = (tagValue) => {
      return tagValue && tagValue.toString().includes('eneca.work sync OS');
    };
    
    const hasStandardTag = (tagValue) => {
      return tagValue && tagValue.toString().includes('eneca.work sync') && 
             !tagValue.toString().includes('eneca.work sync OS');
    };
    
    // Если tags - массив
    if (Array.isArray(project.tags)) {
      if (project.tags.some(hasOSTag)) return 'os';
      if (project.tags.some(hasStandardTag)) return 'standard';
    }
    
    // Если tags - строка
    if (typeof project.tags === 'string') {
      if (hasOSTag(project.tags)) return 'os';
      if (hasStandardTag(project.tags)) return 'standard';
    }
    
    // Если tags - объект, проверяем его свойства
    if (typeof project.tags === 'object') {
      const tagValues = Object.values(project.tags);
      if (tagValues.some(hasOSTag)) return 'os';
      if (tagValues.some(hasStandardTag)) return 'standard';
    }
    
    return null;
  }
  
  async getProjectTags() {
    const data = await this.request('get_tags');
    return data.data || [];
  }
  
  async getUsers() {
    const data = await this.request('get_users');
    return data.data || [];
  }
}

module.exports = new WorksectionService(); 