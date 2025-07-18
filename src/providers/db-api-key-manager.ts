import { NaverApiKey } from '../types';
import { logger } from '../utils/logger';
import { ApiKeyService } from '../services/api-key.service';

export class DbApiKeyManager {
  private apiKeys: NaverApiKey[] = [];
  private currentIndex = 0;
  private apiKeyService: ApiKeyService;
  private provider: string;
  private lastRefreshTime: Date | null = null;
  private refreshInterval = 5 * 60 * 1000; // 5분마다 리프레시

  constructor(provider: string) {
    this.provider = provider;
    this.apiKeyService = ApiKeyService.getInstance();
  }

  async initialize(): Promise<void> {
    await this.refreshKeys();
  }

  private async refreshKeys(): Promise<void> {
    try {
      const keys = await this.apiKeyService.getActiveApiKeys(this.provider);
      this.apiKeys = keys;
      this.lastRefreshTime = new Date();
      logger.info(`Loaded ${this.apiKeys.length} API keys for ${this.provider} from database`);
    } catch (error) {
      logger.error(`Failed to load API keys for ${this.provider}:`, error);
      // 기존 키가 있으면 계속 사용
      if (this.apiKeys.length === 0) {
        throw new Error(`No API keys available for ${this.provider}`);
      }
    }
  }

  private async checkAndRefresh(): Promise<void> {
    if (!this.lastRefreshTime || 
        Date.now() - this.lastRefreshTime.getTime() > this.refreshInterval) {
      await this.refreshKeys();
    }
  }

  async getNextKey(): Promise<NaverApiKey> {
    await this.checkAndRefresh();
    
    if (this.apiKeys.length === 0) {
      throw new Error(`No API keys available for ${this.provider}`);
    }

    const key = this.apiKeys[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
    
    // Update usage stats
    key.usageCount = (key.usageCount || 0) + 1;
    key.lastUsed = new Date();
    
    // DB에 사용 통계 업데이트 (비동기로 처리)
    this.apiKeyService.updateKeyUsage(key.clientId, this.provider).catch(err => {
      logger.error('Failed to update key usage in DB:', err);
    });
    
    logger.debug(`Using API key ${this.currentIndex + 1}/${this.apiKeys.length} for ${this.provider}`);
    return key;
  }

  getCurrentKey(): NaverApiKey {
    if (this.apiKeys.length === 0) {
      throw new Error(`No API keys available for ${this.provider}`);
    }
    return this.apiKeys[this.currentIndex];
  }

  async markKeyAsLimited(key: NaverApiKey): Promise<void> {
    logger.warn(`API key rate limited for ${this.provider}: ${key.clientId.substring(0, 8)}...`);
    
    // DB에 레이트 리밋 기록
    await this.apiKeyService.markKeyAsRateLimited(key.clientId, this.provider);
    
    // Move to next key immediately
    this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
  }

  getStats() {
    return this.apiKeys.map((key, index) => ({
      index,
      clientId: key.clientId.substring(0, 8) + '...',
      usageCount: key.usageCount || 0,
      lastUsed: key.lastUsed,
    }));
  }
}