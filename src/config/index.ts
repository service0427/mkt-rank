import dotenv from 'dotenv';
import { NaverApiKey } from '../types';

dotenv.config();

// Parse Naver API keys from environment variable
const parseNaverApiKeys = (): NaverApiKey[] => {
  const apiKeysStr = process.env.NAVER_API_KEYS || '';
  if (!apiKeysStr) {
    // Return empty array if no keys provided (will use DB keys)
    return [];
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
  coupang: {
    apiUrl: process.env.COUPANG_API_URL || '',
    apiKey: process.env.COUPANG_API_KEY || '',
  },
  scheduler: {
    cronExpression: process.env.SCHEDULE_INTERVAL || '0 * * * *',
  },
  search: {
    itemsPerPage: 100,
    maxPages: 1,  // 1페이지만 (100개 = 1~100위)
    delayBetweenRequests: 1000, // 1 second delay between requests
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  environment: process.env.NODE_ENV || 'development',
};

export function validateConfig(): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate API keys format if provided
  if (process.env.NAVER_API_KEYS) {
    try {
      parseNaverApiKeys();
    } catch (error) {
      throw new Error(`Invalid NAVER_API_KEYS format: ${error}`);
    }
  }
}