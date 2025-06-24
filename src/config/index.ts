import dotenv from 'dotenv';
import { NaverApiKey } from '../types';

dotenv.config();

// Parse Naver API keys from environment variable
const parseNaverApiKeys = (): NaverApiKey[] => {
  const apiKeysStr = process.env.NAVER_API_KEYS || '';
  if (!apiKeysStr) {
    throw new Error('NAVER_API_KEYS environment variable is required');
  }

  return apiKeysStr.split(',').map((keyPair) => {
    const [clientId, clientSecret] = keyPair.trim().split(':');
    if (!clientId || !clientSecret) {
      throw new Error('Invalid API key format. Expected: clientId:clientSecret');
    }
    return {
      clientId,
      clientSecret,
      usageCount: 0,
      lastUsed: new Date(),
    };
  });
};

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },
  naver: {
    apiKeys: parseNaverApiKeys(),
    apiUrl: 'https://openapi.naver.com/v1/search/shop.json',
  },
  scheduler: {
    cronExpression: process.env.SCHEDULE_INTERVAL || '0 */3 * * *',
  },
  search: {
    itemsPerPage: 100,
    maxPages: 10,
    delayBetweenRequests: 1000, // 1 second delay between requests
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
};

export function validateConfig(): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'NAVER_API_KEYS',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate API keys format
  try {
    parseNaverApiKeys();
  } catch (error) {
    throw new Error(`Invalid NAVER_API_KEYS format: ${error}`);
  }
}