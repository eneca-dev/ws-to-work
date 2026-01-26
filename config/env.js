require('dotenv').config();

const config = {
  port: process.env.PORT || 3001,
  
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
  },
  
  // Worksection
  worksection: {
    domain: process.env.WORKSECTION_DOMAIN,
    hash: process.env.WORKSECTION_HASH,
  },
  
  // Sync settings
  sync: {
    batchSize: parseInt(process.env.SYNC_BATCH_SIZE) || 50,
    delayMs: parseInt(process.env.SYNC_DELAY_MS) || 1000,
    maxRetries: parseInt(process.env.SYNC_MAX_RETRIES) || 3,
  },

  // Telegram notifications (опционально)
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    chatId2: process.env.TELEGRAM_CHAT_ID_2 || null,
    enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  }
};

function validateConfig() {
  const errors = [];
  
  if (!config.supabase.url) errors.push('SUPABASE_URL is required');
  if (!config.supabase.key) errors.push('SUPABASE_ANON_KEY is required');
  if (!config.worksection.domain) errors.push('WORKSECTION_DOMAIN is required');
  if (!config.worksection.hash) errors.push('WORKSECTION_HASH is required');
  
  if (errors.length > 0) {
    throw new Error(`Configuration errors: ${errors.join(', ')}`);
  }
}

module.exports = { config, validateConfig }; 