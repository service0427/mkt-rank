import axios, { AxiosInstance, AxiosError } from 'axios';
import { query } from '../../db/postgres';

interface NaverSearchItem {
  title: string;
  link: string;
  image: string;
  lprice: string;
  hprice: string;
  mallName: string;
  productId: string;
  productType: string;
  brand: string;
  maker: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
}

interface NaverSearchResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverSearchItem[];
}

interface ApiKey {
  key_id: string;
  client_id: string;
  client_secret: string;
  is_active: boolean;
  usage_count: number;
  daily_limit: number;
  last_used_at?: Date;
}

export class NaverShoppingProvider {
  private apiUrl = 'https://openapi.naver.com/v1/search/shop.json';
  private currentKeyIndex = 0;
  private apiKeys: ApiKey[] = [];

  async getRankings(keyword: string, maxPages: number = 3) {
    const rankings = [];
    const itemsPerPage = 100; // Max allowed by Naver API

    // Load API keys if not loaded
    if (this.apiKeys.length === 0) {
      await this.loadApiKeys();
    }

    for (let page = 1; page <= maxPages; page++) {
      try {
        const results = await this.searchPage(keyword, page, itemsPerPage);
        
        for (let i = 0; i < results.length; i++) {
          const rank = (page - 1) * itemsPerPage + i + 1;
          rankings.push({
            keyword,
            rank,
            platform: 'naver_shopping',
            metadata: {
              productId: results[i].productId,
              title: results[i].title,
              mallName: results[i].mallName,
              lprice: results[i].lprice,
              brand: results[i].brand,
              category1: results[i].category1,
              category2: results[i].category2,
            }
          });
        }

        // If we got less than full page, no more results
        if (results.length < itemsPerPage) {
          break;
        }

        // Add delay between requests
        await this.delay(500);
      } catch (error) {
        console.error(`Error fetching page ${page} for ${keyword}:`, error);
        break;
      }
    }

    return rankings;
  }

  private async loadApiKeys() {
    const keys = await query<ApiKey>(`
      SELECT key_id, client_id, client_secret, is_active, usage_count, daily_limit, last_used_at
      FROM unified_api_keys
      WHERE provider = 'naver_shopping' AND is_active = true
      ORDER BY usage_count ASC
    `);

    if (keys.length === 0) {
      throw new Error('No active Naver API keys found');
    }

    this.apiKeys = keys;
  }

  private async searchPage(keyword: string, page: number, itemsPerPage: number): Promise<NaverSearchItem[]> {
    const maxRetries = Math.min(3, this.apiKeys.length);
    let retryCount = 0;

    while (retryCount < maxRetries) {
      const apiKey = this.getNextApiKey();
      
      if (!apiKey) {
        throw new Error('No available API keys');
      }

      try {
        const axiosInstance = this.createAxiosInstance(apiKey);
        const start = (page - 1) * itemsPerPage + 1;

        const response = await axiosInstance.get<NaverSearchResponse>('', {
          params: {
            query: keyword,
            display: itemsPerPage,
            start,
            sort: 'sim',
          },
        });

        // Update API key usage
        await this.updateApiKeyUsage(apiKey.key_id);

        return response.data.items || [];
      } catch (error) {
        if (this.isRateLimitError(error)) {
          console.warn(`Rate limit hit for key ${apiKey.key_id}, trying next key...`);
          retryCount++;
          await this.delay(1000);
          continue;
        }
        throw error;
      }
    }

    throw new Error('All API keys exhausted');
  }

  private createAxiosInstance(apiKey: ApiKey): AxiosInstance {
    return axios.create({
      baseURL: this.apiUrl,
      headers: {
        'X-Naver-Client-Id': apiKey.client_id,
        'X-Naver-Client-Secret': apiKey.client_secret,
      },
      timeout: 30000,
    });
  }

  private getNextApiKey(): ApiKey | null {
    // Find an API key that hasn't exceeded daily limit
    for (let i = 0; i < this.apiKeys.length; i++) {
      const index = (this.currentKeyIndex + i) % this.apiKeys.length;
      const key = this.apiKeys[index];
      
      if (key.usage_count < key.daily_limit) {
        this.currentKeyIndex = (index + 1) % this.apiKeys.length;
        return key;
      }
    }

    return null;
  }

  private async updateApiKeyUsage(keyId: string) {
    try {
      await query(`
        UPDATE unified_api_keys
        SET 
          usage_count = CASE 
            WHEN last_reset_at < CURRENT_DATE THEN 1
            ELSE usage_count + 1
          END,
          last_reset_at = CASE
            WHEN last_reset_at < CURRENT_DATE THEN CURRENT_DATE
            ELSE last_reset_at
          END,
          last_used_at = CURRENT_TIMESTAMP
        WHERE key_id = $1
      `, [keyId]);

      // Update local cache
      const key = this.apiKeys.find(k => k.key_id === keyId);
      if (key) {
        key.usage_count++;
      }
    } catch (error) {
      console.error('Failed to update API key usage:', error);
    }
  }

  private isRateLimitError(error: any): boolean {
    if (error instanceof AxiosError) {
      return error.response?.status === 429 || 
             (error.response?.status === 400 && 
              error.response?.data?.errorCode === 'SE01');
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}