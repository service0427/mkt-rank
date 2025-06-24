import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },
  naver: {
    clientId: process.env.NAVER_CLIENT_ID || '',
    clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    apiUrl: 'https://openapi.naver.com/v1/search/shop.json',
  },
  scheduler: {
    // Run every 3 hours
    cronExpression: process.env.CRON_EXPRESSION || '0 */3 * * *',
  },
  search: {
    itemsPerPage: 100, // Naver API max items per request
    maxPages: 10, // Maximum pages to fetch per keyword
  },
  environment: process.env.NODE_ENV || 'development',
};

// Validate required configuration
const validateConfig = () => {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'NAVER_CLIENT_ID',
    'NAVER_CLIENT_SECRET',
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }
};

// Validate on module load
validateConfig();