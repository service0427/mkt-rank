import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { LocalPostgresService } from './local-postgres.service';

export class DatabaseCleanupService {
  private pool: Pool;
  
  constructor() {
    const localDb = new LocalPostgresService();
    this.pool = localDb.pool;
  }

  /**
   * 오래된 로컬 DB 데이터 정리
   * shopping_rankings와 cp_rankings 테이블에서 7일 이상 된 데이터 삭제
   */
  async cleanupOldRankings(): Promise<void> {
    try {
      logger.info('Starting database cleanup for old rankings');
      
      // 쇼핑 랭킹 정리 (7일 이전 데이터 삭제)
      const shoppingResult = await this.pool.query(`
        DELETE FROM shopping_rankings 
        WHERE collected_at < NOW() - INTERVAL '7 days'
      `);
      
      logger.info(`Deleted ${shoppingResult.rowCount} old shopping rankings`);
      
      // 쿠팡 랭킹 정리 (7일 이전 데이터 삭제)
      const coupangResult = await this.pool.query(`
        DELETE FROM cp_rankings 
        WHERE collected_at < NOW() - INTERVAL '7 days'
      `);
      
      logger.info(`Deleted ${coupangResult.rowCount} old coupang rankings`);
      
      // VACUUM을 실행하여 디스크 공간 회수
      await this.pool.query('VACUUM ANALYZE shopping_rankings');
      await this.pool.query('VACUUM ANALYZE cp_rankings');
      
      logger.info('Database cleanup completed successfully');
    } catch (error) {
      logger.error('Database cleanup failed:', error);
      throw error;
    }
  }
  
  /**
   * 정기적으로 실행할 정리 작업
   * 매일 새벽 3시에 실행하는 것을 권장
   */
  async runDailyCleanup(): Promise<void> {
    try {
      await this.cleanupOldRankings();
      
      // 추가로 오래된 월별 파티션 테이블도 삭제 (3개월 이전)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      
      const year = threeMonthsAgo.getFullYear();
      const month = String(threeMonthsAgo.getMonth() + 1).padStart(2, '0');
      
      const oldTables = [
        `shopping_rankings_${year}_${month}`,
        `cp_rankings_${year}_${month}`
      ];
      
      for (const tableName of oldTables) {
        try {
          await this.pool.query(`DROP TABLE IF EXISTS ${tableName}`);
          logger.info(`Dropped old partition table: ${tableName}`);
        } catch (error) {
          logger.warn(`Failed to drop table ${tableName}:`, error);
        }
      }
      
    } catch (error) {
      logger.error('Daily cleanup failed:', error);
      throw error;
    }
  }
}