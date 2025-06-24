import { validateConfig } from './config';
import { RankingService } from './services/ranking/ranking.service';
import { logger } from './utils/logger';

async function testFullCollection() {
  try {
    // 1. 설정 검증
    validateConfig();
    logger.info('Configuration validated successfully');

    // 2. RankingService 초기화
    const rankingService = new RankingService();
    logger.info('RankingService initialized');

    // 3. 전체 수집 프로세스 실행
    logger.info('Starting full ranking collection test...');
    await rankingService.collectRankings();

    // 4. 통계 출력
    const stats = await rankingService.getStatistics();
    console.log('\n========== COLLECTION STATISTICS ==========');
    console.log('Local DB Statistics:', stats.local);
    console.log('Last Sync:', stats.lastSync);

    logger.info('Test completed successfully');
  } catch (error) {
    logger.error('Test failed:', error);
    console.error('\n========== ERROR DETAILS ==========');
    console.error(error);
    process.exit(1);
  }
}

// 실행
testFullCollection().then(() => {
  logger.info('All tests passed');
  process.exit(0);
}).catch((error) => {
  logger.error('Test error:', error);
  process.exit(1);
});