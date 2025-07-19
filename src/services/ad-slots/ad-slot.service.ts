import { executeQuery } from '../../database/mysql.client';
import { AdSlot } from '../../types/ad-slots.types';
import { logger } from '../../utils/logger';

export class AdSlotService {
  /**
   * 활성 상태의 ad_slots 조회
   */
  async getActiveSlots(limit?: number): Promise<AdSlot[]> {
    try {
      const query = `
        SELECT 
          ad_slot_id,
          user_id,
          managed_id,
          work_keyword,
          product_url,
          price_compare_mid,
          product_mid,
          seller_mid,
          main_keyword,
          product_name,
          price_compare_url,
          price_rank,
          price_start_rank,
          price_rank_diff,
          store_rank,
          store_start_rank,
          store_rank_diff,
          rank_check_date,
          status,
          start_date,
          end_date,
          duration_days,
          created_at,
          updated_at,
          is_active
        FROM ad_slots
        WHERE status = 'ACTIVE' 
          AND is_active = 1
          AND work_keyword IS NOT NULL
          AND work_keyword != ''
        ORDER BY 
          CASE 
            WHEN rank_check_date IS NULL THEN 0
            ELSE 1
          END,
          rank_check_date ASC,
          ad_slot_id
        ${limit ? `LIMIT ${limit}` : ''}
      `;

      const slots = await executeQuery<AdSlot>(query);
      
      logger.info(`Found ${slots.length} active ad_slots`);
      return slots;
    } catch (error) {
      logger.error('Failed to get active slots:', error);
      throw error;
    }
  }

  /**
   * 특정 ad_slot 조회
   */
  async getSlotById(adSlotId: number): Promise<AdSlot | null> {
    try {
      const query = `
        SELECT * FROM ad_slots
        WHERE ad_slot_id = ?
      `;

      const slots = await executeQuery<AdSlot>(query, [adSlotId]);
      return slots[0] || null;
    } catch (error) {
      logger.error(`Failed to get slot ${adSlotId}:`, error);
      throw error;
    }
  }

  /**
   * 배치 처리를 위한 슬롯 조회
   */
  async getSlotsForBatch(batchSize: number, offset: number = 0): Promise<AdSlot[]> {
    try {
      const query = `
        SELECT * FROM ad_slots
        WHERE status = 'ACTIVE' 
          AND is_active = 1
          AND work_keyword IS NOT NULL
          AND work_keyword != ''
        ORDER BY 
          COALESCE(rank_check_date, '1970-01-01') ASC,
          ad_slot_id
        LIMIT ? OFFSET ?
      `;

      const slots = await executeQuery<AdSlot>(query, [batchSize, offset]);
      return slots;
    } catch (error) {
      logger.error('Failed to get slots for batch:', error);
      throw error;
    }
  }

  /**
   * 활성 슬롯 총 개수
   */
  async getActiveSlotsCount(): Promise<number> {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM ad_slots
        WHERE status = 'ACTIVE' 
          AND is_active = 1
          AND work_keyword IS NOT NULL
          AND work_keyword != ''
      `;

      const result = await executeQuery<{ count: number }>(query);
      return result[0]?.count || 0;
    } catch (error) {
      logger.error('Failed to get active slots count:', error);
      throw error;
    }
  }

  /**
   * 키워드별 슬롯 그룹핑
   */
  async getSlotsByKeyword(): Promise<Map<string, AdSlot[]>> {
    try {
      const slots = await this.getActiveSlots();
      const keywordMap = new Map<string, AdSlot[]>();

      for (const slot of slots) {
        if (slot.work_keyword) {
          const keyword = slot.work_keyword.toLowerCase().trim();
          if (!keywordMap.has(keyword)) {
            keywordMap.set(keyword, []);
          }
          keywordMap.get(keyword)!.push(slot);
        }
      }

      logger.info(`Grouped ${slots.length} slots into ${keywordMap.size} unique keywords`);
      return keywordMap;
    } catch (error) {
      logger.error('Failed to group slots by keyword:', error);
      throw error;
    }
  }

  /**
   * 우선순위가 높은 슬롯 조회
   * - 순위 체크를 한 번도 안 한 슬롯
   * - 가장 오래전에 체크한 슬롯
   * - 최근 순위 변동이 큰 슬롯
   */
  async getPrioritySlots(limit: number = 100): Promise<AdSlot[]> {
    try {
      const query = `
        SELECT * FROM ad_slots
        WHERE status = 'ACTIVE' 
          AND is_active = 1
          AND work_keyword IS NOT NULL
          AND work_keyword != ''
        ORDER BY 
          -- 체크 안 한 슬롯 우선
          CASE WHEN rank_check_date IS NULL THEN 0 ELSE 1 END,
          -- 순위 변동 큰 슬롯 우선
          ABS(COALESCE(price_rank_diff, 0)) + ABS(COALESCE(store_rank_diff, 0)) DESC,
          -- 오래된 체크 우선
          rank_check_date ASC,
          ad_slot_id
        LIMIT ?
      `;

      const slots = await executeQuery<AdSlot>(query, [limit]);
      return slots;
    } catch (error) {
      logger.error('Failed to get priority slots:', error);
      throw error;
    }
  }
}