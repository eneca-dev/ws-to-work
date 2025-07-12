class Logger {
  constructor() {
    this.logs = [];
  }
  
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message };
    
    this.logs.push(logEntry);
    
    const emoji = this.getEmoji(level);
    console.log(`${emoji} [${timestamp}] ${message}`);
  }
  
  info(message) {
    this.log(message, 'info');
  }
  
  success(message) {
    this.log(message, 'success');
  }
  
  warning(message) {
    this.log(message, 'warning');
  }
  
  error(message) {
    this.log(message, 'error');
  }
  
  getEmoji(level) {
    const emojis = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    return emojis[level] || 'ℹ️';
  }
  
  getLogs() {
    return this.logs;
  }
  
  clearLogs() {
    this.logs = [];
  }
}

module.exports = new Logger(); 