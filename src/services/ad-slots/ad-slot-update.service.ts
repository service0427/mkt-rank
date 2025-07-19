import { executeQuery, executeUpdate, withTransaction } from '../../database/mysql.client';
import { RankingUpdateResult } from '../../types/ad-slots.types';
import { logger } from '../../utils/logger';

export class AdSlotUpdateService {
  /**
   * 순위 정보를 MySQL ad_slots 테이블에 업데이트
   */
  async updateSlotRankings(result: RankingUpdateResult): Promise<void> {
    try {
      await withTransaction(async (connection) => {
        // 1. 기본 순위 업데이트
        const updateQuery = `
          UPDATE ad_slots 
          SET 
            price_rank = ?,
            store_rank = ?,
            rank_check_date = CURRENT_DATE(),
            updated_at = CURRENT_TIMESTAMP()
          WHERE ad_slot_id = ?
        `;

        await connection.execute(updateQuery, [
          result.price_rank || null,
          result.store_rank || null,
          result.ad_slot_id,
        ]);

        // 2. 시작 순위가 없으면 현재 순위를 시작 순위로 설정
        const initStartRankQuery = `
          UPDATE ad_slots 
          SET 
            price_start_rank = CASE 
              WHEN price_start_rank IS NULL AND ? IS NOT NULL THEN ?
              ELSE price_start_rank
            END,
            store_start_rank = CASE 
              WHEN store_start_rank IS NULL AND ? IS NOT NULL THEN ?
              ELSE store_start_rank
            END
          WHERE ad_slot_id = ?
        `;

        await connection.execute(initStartRankQuery, [
          result.price_rank === undefined ? null : result.price_rank,
          result.price_rank === undefined ? null : result.price_rank,
          result.store_rank === undefined ? null : result.store_rank,
          result.store_rank === undefined ? null : result.store_rank,
          result.ad_slot_id,
        ]);

        // 3. 순위 차이 계산 및 업데이트
        const updateDiffQuery = `
          UPDATE ad_slots 
          SET 
            price_rank_diff = CASE 
              WHEN price_start_rank IS NOT NULL AND price_rank IS NOT NULL 
              THEN price_start_rank - price_rank
              ELSE NULL
            END,
            store_rank_diff = CASE 
              WHEN store_start_rank IS NOT NULL AND store_rank IS NOT NULL 
              THEN store_start_rank - store_rank
              ELSE NULL
            END
          WHERE ad_slot_id = ?
        `;

        await connection.execute(updateDiffQuery, [result.ad_slot_id]);

        logger.info(`Updated rankings for ad_slot ${result.ad_slot_id}`, {
          priceRank: result.price_rank,
          storeRank: result.store_rank,
          found: result.is_found,
        });
      });
    } catch (error) {
      logger.error(`Failed to update rankings for ad_slot ${result.ad_slot_id}:`, error);
      throw error;
    }
  }

  /**
   * 배치로 여러 슬롯 업데이트
   */
  async updateMultipleSlots(results: RankingUpdateResult[]): Promise<void> {
    const successCount = { total: 0 };
    const errors: Array<{ ad_slot_id: number; error: string }> = [];

    for (const result of results) {
      try {
        await this.updateSlotRankings(result);
        successCount.total++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ ad_slot_id: result.ad_slot_id, error: errorMessage });
        logger.error(`Failed to update ad_slot ${result.ad_slot_id}:`, error);
      }
    }

    logger.info(`Batch update completed`, {
      total: results.length,
      success: successCount.total,
      failed: errors.length,
    });

    if (errors.length > 0) {
      logger.error('Batch update errors:', errors);
    }
  }

  /**
   * 슬롯 상태 업데이트 (필요시 사용)
   */
  async updateSlotStatus(
    adSlotId: number,
    status: 'EMPTY' | 'WAITING' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED' | 'MODIFIED'
  ): Promise<void> {
    try {
      const query = `
        UPDATE ad_slots 
        SET 
          status = ?,
          updated_at = CURRENT_TIMESTAMP()
        WHERE ad_slot_id = ?
      `;

      await executeUpdate(query, [status, adSlotId]);
      logger.info(`Updated status for ad_slot ${adSlotId} to ${status}`);
    } catch (error) {
      logger.error(`Failed to update status for ad_slot ${adSlotId}:`, error);
      throw error;
    }
  }

  /**
   * 순위 초기화 (status 변경 시 등)
   */
  async resetRankings(adSlotId: number): Promise<void> {
    try {
      const query = `
        UPDATE ad_slots 
        SET 
          price_rank = NULL,
          price_start_rank = NULL,
          price_rank_diff = NULL,
          store_rank = NULL,
          store_start_rank = NULL,
          store_rank_diff = NULL,
          rank_check_date = NULL,
          updated_at = CURRENT_TIMESTAMP()
        WHERE ad_slot_id = ?
      `;

      await executeUpdate(query, [adSlotId]);
      logger.info(`Reset rankings for ad_slot ${adSlotId}`);
    } catch (error) {
      logger.error(`Failed to reset rankings for ad_slot ${adSlotId}:`, error);
      throw error;
    }
  }

  /**
   * 통계 정보 조회
   */
  async getUpdateStats(): Promise<{
    totalUpdatedToday: number;
    totalActive: number;
    avgPriceRankDiff: number;
    avgStoreRankDiff: number;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(CASE WHEN rank_check_date = CURRENT_DATE() THEN 1 END) as totalUpdatedToday,
          COUNT(CASE WHEN status = 'ACTIVE' AND is_active = 1 THEN 1 END) as totalActive,
          AVG(price_rank_diff) as avgPriceRankDiff,
          AVG(store_rank_diff) as avgStoreRankDiff
        FROM ad_slots
        WHERE is_active = 1
      `;

      const result = await executeQuery<any>(query);
      return result[0] || {
        totalUpdatedToday: 0,
        totalActive: 0,
        avgPriceRankDiff: 0,
        avgStoreRankDiff: 0,
      };
    } catch (error) {
      logger.error('Failed to get update stats:', error);
      throw error;
    }
  }
}