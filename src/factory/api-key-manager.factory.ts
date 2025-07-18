import { DbApiKeyManager } from '../providers/db-api-key-manager';
import { ApiKeyManager } from '../providers/api-key-manager';
import { config } from '../config';
import { logger } from '../utils/logger';

export class ApiKeyManagerFactory {
  private static naverShoppingManager: DbApiKeyManager | null = null;

  static async getNaverShoppingManager(): Promise<DbApiKeyManager> {
    if (!this.naverShoppingManager) {
      this.naverShoppingManager = new DbApiKeyManager('naver_shopping');
      await this.naverShoppingManager.initialize();
    }
    return this.naverShoppingManager;
  }

  // 폴백: DB에서 키를 가져올 수 없는 경우 환경변수 사용
  static async getNaverShoppingManagerWithFallback(): Promise<DbApiKeyManager | ApiKeyManager> {
    try {
      return await this.getNaverShoppingManager();
    } catch (error) {
      logger.warn('Failed to load API keys from DB, falling back to environment variables:', error);
      return new ApiKeyManager(config.naver.apiKeys);
    }
  }
}