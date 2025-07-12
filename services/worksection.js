const axios = require('axios');
const { config } = require('../config/env');
const logger = require('../utils/logger');

class WorksectionService {
  constructor() {
    this.baseUrl = `https://${config.worksection.domain}/api/admin/`;
    this.hash = config.worksection.hash;
  }
  
  async request(action, params = {}) {
    try {
      const url = `${this.baseUrl}${action}`;
      const data = { ...params, hash: this.hash };
      
      logger.info(`Worksection API: ${action}`);
      
      const response = await axios.post(url, data);
      
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