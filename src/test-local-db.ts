import { config, validateConfig } from './config';
import { LocalPostgresService } from './services/database/local-postgres.service';
import { SupabaseService } from './services/database/supabase.service';
import { DataSyncService } from './services/sync/data-sync.service';
import { logger } from './utils/logger';

async function testLocalDbSetup() {
  try {
    // 1. 설정 검증
    validateConfig();
    logger.info('Configuration validated successfully');

    // 2. 로컬 DB 연결 테스트
    const localDb = new LocalPostgresService();
    const isConnected = await localDb.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to local PostgreSQL');
    }

    // 3. 통계 조회
    const stats = await localDb.getStatistics();
    console.log('\n========== LOCAL DB STATISTICS ==========');
    console.log('Total Rankings:', stats.total_rankings || 0);
    console.log('Unique Keywords:', stats.unique_keywords || 0);
    console.log('Unique Products:', stats.unique_products || 0);
    console.log('Oldest Data (days):', Math.round(stats.oldest_data || 0));
    console.log('Newest Data (minutes ago):', Math.round(stats.newest_data || 0));

    // 4. Supabase 연결 테스트
    const supabase = new SupabaseService();
    const keywords = await supabase.getActiveKeywords();
    console.log('\n========== ACTIVE KEYWORDS ==========');
    console.log(`Found ${keywords.length} active keywords`);
    if (keywords.length > 0) {
      console.log('First 5 keywords:', keywords.slice(0, 5).map(k => k.keyword));
    }

    // 5. 동기화 서비스 테스트
    if (keywords.length > 0) {
      const syncService = new DataSyncService(localDb, supabase);
      console.log('\n========== TESTING SYNC SERVICE ==========');
      
      // 첫 번째 키워드로 테스트
      const testKeywordId = keywords[0].id;
      console.log(`Testing sync for keyword: ${keywords[0].keyword}`);
      
      // 최신 랭킹 동기화 테스트
      await syncService.syncLatestRankings([testKeywordId]);
      console.log('✓ Latest rankings sync completed');
      
      // 동기화 상태 기록
      await syncService.logSyncStatus('test_sync', 'completed', 1);
      console.log('✓ Sync status logged');
    }

    console.log('\n========== TEST COMPLETED SUCCESSFULLY ==========');
    
    // 정리
    await localDb.cleanup();
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// 테스트 실행
testLocalDbSetup().then(() => {
  logger.info('All tests passed');
  process.exit(0);
}).catch((error) => {
  logger.error('Test error:', error);
  process.exit(1);
});