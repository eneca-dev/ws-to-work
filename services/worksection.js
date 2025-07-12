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
    return data.data || [];
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
    return projects.filter(project => 
      project.tags && project.tags.includes(tagName)
    );
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