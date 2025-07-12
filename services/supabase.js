const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/env');
const logger = require('../utils/logger');

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
      const { data: result, error } = await this.client
        .from('projects')
        .insert(data)
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
      const { data: result, error } = await this.client
        .from('projects')
        .update(data)
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
  
  async findUserByEmail(email) {
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('email', email)
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
      logger.error(`Error finding user by email: ${error.message}`);
      return null;
    }
  }
  
  async findUserByName(name) {
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%`);
      
      if (error) throw error;
      return data.length > 0 ? data[0] : null;
    } catch (error) {
      logger.error(`Error finding user by name: ${error.message}`);
      return null;
    }
  }
}

module.exports = new SupabaseService(); 