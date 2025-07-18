import { config } from '../config';
import { ApiKeyService } from '../services/api-key.service';
import { logger } from '../utils/logger';

async function migrateApiKeys() {
  const apiKeyService = ApiKeyService.getInstance();
  
  try {
    // 환경변수에서 API 키 가져오기
    const envApiKeys = config.naver.apiKeys;
    
    if (!envApiKeys || envApiKeys.length === 0) {
      logger.error('No API keys found in environment variables');
      return;
    }
    
    logger.info(`Found ${envApiKeys.length} API keys in environment variables`);
    
    // 각 키를 DB에 추가
    for (let i = 0; i < envApiKeys.length; i++) {
      const key = envApiKeys[i];
      
      try {
        // 이미 존재하는지 확인
        const existingKeys = await apiKeyService.getAllApiKeys('naver_shopping');
        const exists = existingKeys.some(k => k.client_id === key.clientId);
        
        if (exists) {
          logger.info(`API key ${i + 1} already exists: ${key.clientId.substring(0, 8)}...`);
          continue;
        }
        
        // DB에 추가
        const newKey = await apiKeyService.createApiKey({
          provider: 'naver_shopping',
          client_id: key.clientId,
          client_secret: key.clientSecret,
          description: `환경변수에서 마이그레이션된 키 ${i + 1}`,
          is_active: true
        });
        
        logger.info(`Successfully migrated API key ${i + 1}: ${key.clientId.substring(0, 8)}...`);
      } catch (error) {
        logger.error(`Failed to migrate API key ${i + 1}:`, error);
      }
    }
    
    // 마이그레이션 완료 후 DB의 모든 키 확인
    const allKeys = await apiKeyService.getAllApiKeys('naver_shopping');
    logger.info(`\nTotal API keys in database: ${allKeys.length}`);
    
    allKeys.forEach((key, index) => {
      logger.info(`${index + 1}. ${key.client_id.substring(0, 8)}... - ${key.description || 'No description'} (${key.is_active ? 'Active' : 'Inactive'})`);
    });
    
  } catch (error) {
    logger.error('Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

// 실행
migrateApiKeys();