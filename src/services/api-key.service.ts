import { supabase } from '../config/supabase';
import { NaverApiKey } from '../types';
import { logger } from '../utils/logger';

export interface ApiKeyRecord {
  id: string;
  provider: string;
  client_id: string;
  client_secret: string;
  description?: string;
  is_active: boolean;
  usage_count: number;
  last_used_at?: string;
  rate_limit_count: number;
  last_rate_limit_at?: string;
  created_at: string;
  updated_at: string;
}

export class ApiKeyService {
  private static instance: ApiKeyService;

  private constructor() {}

  static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService();
    }
    return ApiKeyService.instance;
  }

  async getActiveApiKeys(provider: string): Promise<NaverApiKey[]> {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('provider', provider)
        .eq('is_active', true)
        .order('usage_count', { ascending: true });

      if (error) {
        logger.error('Failed to fetch API keys:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error(`No active API keys found for provider: ${provider}`);
      }

      return data.map((key: ApiKeyRecord) => ({
        clientId: key.client_id,
        clientSecret: key.client_secret,
        usageCount: key.usage_count,
        lastUsed: key.last_used_at ? new Date(key.last_used_at) : new Date(),
      }));
    } catch (error) {
      logger.error('Error in getActiveApiKeys:', error);
      throw error;
    }
  }

  async updateKeyUsage(clientId: string, provider: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({
          usage_count: (await supabase.from('api_keys').select('usage_count').eq('client_id', clientId).eq('provider', provider).single()).data?.usage_count + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('client_id', clientId)
        .eq('provider', provider);

      if (error) {
        logger.error('Failed to update key usage:', error);
      }
    } catch (error) {
      logger.error('Error in updateKeyUsage:', error);
    }
  }

  async markKeyAsRateLimited(clientId: string, provider: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({
          rate_limit_count: (await supabase.from('api_keys').select('rate_limit_count').eq('client_id', clientId).eq('provider', provider).single()).data?.rate_limit_count + 1,
          last_rate_limit_at: new Date().toISOString(),
        })
        .eq('client_id', clientId)
        .eq('provider', provider);

      if (error) {
        logger.error('Failed to update rate limit count:', error);
      }
    } catch (error) {
      logger.error('Error in markKeyAsRateLimited:', error);
    }
  }

  async getAllApiKeys(provider?: string): Promise<ApiKeyRecord[]> {
    try {
      let query = supabase.from('api_keys').select('*');
      
      if (provider) {
        query = query.eq('provider', provider);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch all API keys:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Error in getAllApiKeys:', error);
      throw error;
    }
  }

  async createApiKey(apiKey: Partial<ApiKeyRecord>): Promise<ApiKeyRecord> {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .insert({
          provider: apiKey.provider,
          client_id: apiKey.client_id,
          client_secret: apiKey.client_secret,
          description: apiKey.description,
          is_active: apiKey.is_active ?? true,
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create API key:', error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Error in createApiKey:', error);
      throw error;
    }
  }

  async updateApiKey(id: string, updates: Partial<ApiKeyRecord>): Promise<ApiKeyRecord> {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .update({
          client_id: updates.client_id,
          client_secret: updates.client_secret,
          description: updates.description,
          is_active: updates.is_active,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update API key:', error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Error in updateApiKey:', error);
      throw error;
    }
  }

  async deleteApiKey(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Failed to delete API key:', error);
        throw error;
      }
    } catch (error) {
      logger.error('Error in deleteApiKey:', error);
      throw error;
    }
  }

  async validateApiKey(provider: string, clientId: string, clientSecret: string): Promise<boolean> {
    try {
      if (provider === 'naver_shopping') {
        // 네이버 API 테스트 호출
        const response = await fetch('https://openapi.naver.com/v1/search/shop.json?query=test&display=1', {
          headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret,
          },
        });

        return response.ok;
      }

      // 다른 provider에 대한 검증 로직 추가 가능
      return false;
    } catch (error) {
      logger.error('Error validating API key:', error);
      return false;
    }
  }
}