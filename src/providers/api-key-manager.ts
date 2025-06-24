import { NaverApiKey } from '../types';
import { logger } from '../utils/logger';

export class ApiKeyManager {
  private apiKeys: NaverApiKey[];
  private currentIndex = 0;

  constructor(apiKeys: NaverApiKey[]) {
    this.apiKeys = [...apiKeys];
    logger.info(`Initialized API key manager with ${this.apiKeys.length} keys`);
  }

  getNextKey(): NaverApiKey {
    const key = this.apiKeys[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
    
    // Update usage stats
    key.usageCount = (key.usageCount || 0) + 1;
    key.lastUsed = new Date();
    
    logger.debug(`Using API key ${this.currentIndex + 1}/${this.apiKeys.length}`);
    return key;
  }

  getCurrentKey(): NaverApiKey {
    return this.apiKeys[this.currentIndex];
  }

  markKeyAsLimited(key: NaverApiKey): void {
    logger.warn(`API key rate limited: ${key.clientId.substring(0, 8)}...`);
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