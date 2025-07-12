import { KeywordService } from '../keyword/keyword.service';
import { CoupangRankingService } from './coupang-ranking.service';
import { CoupangDataSyncService } from '../sync/coupang-data-sync.service';
import { LocalPostgresService } from '../database/local-postgres.service';
import { SupabaseService } from '../database/supabase.service';
import { logger } from '../../utils/logger';

export interface CoupangKeywordCheckResult {
  keyword: string;
  keywordId: string;
  isNew: boolean;
  message: string;
  error?: string;
  rocketCount?: number;
}

export class CoupangInstantRankingService {
  private keywordService: KeywordService;
  private rankingService: CoupangRankingService;
  private syncService: CoupangDataSyncService;

  constructor() {
    this.keywordService = new KeywordService();
    this.rankingService = new CoupangRankingService();
    const localDb = new LocalPostgresService();
    const supabase = new SupabaseService();
    this.syncService = new CoupangDataSyncService(localDb, supabase);
  }

  /**
   * 쿠팡 단일 키워드 체크 및 처리
   */
  async checkKeyword(keyword: string): Promise<CoupangKeywordCheckResult> {
    try {
      // 키워드 검증
      const validatedKeyword = this.validateKeyword(keyword);
      
      // 1. 키워드 존재 확인 (type='cp')
      const existing = await this.keywordService.getKeywordByNameAndType(validatedKeyword, 'cp');
      
      if (existing) {
        logger.info(`Coupang keyword already exists: ${validatedKeyword}`);
        return {
          keyword: validatedKeyword,
          keywordId: existing.id,
          isNew: false,
          message: '이미 등록된 쿠팡 키워드입니다'
        };
      }
      
      // 2. 새 키워드 추가 (type='cp')
      logger.info(`Creating new Coupang keyword: ${validatedKeyword}`);
      const newKeyword = await this.keywordService.createKeyword(validatedKeyword, 'cp');
      
      // 3. 즉시 순위 수집
      try {
        logger.info(`Collecting Coupang rankings for new keyword: ${validatedKeyword}`);
        // SearchKeyword 타입으로 변환
        const searchKeyword = {
          id: newKeyword.id,
          user_id: null,
          keyword: newKeyword.keyword,
          pc_count: 0,
          mobile_count: 0,
          total_count: 0,
          pc_ratio: 0,
          mobile_ratio: 0,
          searched_at: newKeyword.created_at,
          type: 'cp'
        };
        await this.rankingService.collectKeywordRankings(searchKeyword);
        
        // 4. 즉시 Supabase 동기화 (current, hourly)
        logger.info(`Syncing Coupang rankings to Supabase for keyword: ${validatedKeyword}`);
        await this.syncService.syncCurrentRankings([newKeyword.id]);
        await this.syncService.syncHourlySnapshots([newKeyword.id]);
        
        // 로켓배송 상품 수 계산
        const rocketCount = await this.getRocketDeliveryCount(newKeyword.id);
        
        return {
          keyword: validatedKeyword,
          keywordId: newKeyword.id,
          isNew: true,
          message: '쿠팡 키워드 추가, 순위 수집 및 동기화 완료',
          rocketCount
        };
      } catch (collectError) {
        logger.error(`Failed to collect Coupang rankings for ${validatedKeyword}:`, collectError);
        
        // 순위 수집 실패해도 키워드는 추가됨
        return {
          keyword: validatedKeyword,
          keywordId: newKeyword.id,
          isNew: true,
          message: '쿠팡 키워드 추가됨 (순위 수집은 다음 스케줄에 진행)',
          error: '순위 수집 중 오류 발생'
        };
      }
      
    } catch (error) {
      logger.error(`Failed to check Coupang keyword ${keyword}:`, error);
      throw error;
    }
  }

  /**
   * 쿠팡 다중 키워드 체크 및 처리
   */
  async checkMultipleKeywords(keywords: string[]): Promise<CoupangKeywordCheckResult[]> {
    logger.info(`Checking ${keywords.length} Coupang keywords`);
    
    // 병렬 처리로 성능 최적화
    const promises = keywords.map(keyword => 
      this.checkKeyword(keyword).catch(error => ({
        keyword,
        keywordId: '',
        isNew: false,
        message: '처리 중 오류 발생',
        error: error.message
      }))
    );
    
    const results = await Promise.all(promises);
    
    const newCount = results.filter(r => r.isNew).length;
    const existingCount = results.filter(r => !r.isNew && !r.error).length;
    const errorCount = results.filter(r => r.error).length;
    
    logger.info(`Coupang keyword check completed: ${newCount} new, ${existingCount} existing, ${errorCount} errors`);
    
    return results;
  }

  /**
   * 로켓배송 키워드 체크
   */
  async checkRocketDeliveryKeyword(keyword: string): Promise<CoupangKeywordCheckResult> {
    try {
      const result = await this.checkKeyword(keyword);
      
      if (result.isNew || !result.error) {
        // 로켓배송 전용 수집 실행
        await this.rankingService.collectRocketDeliveryOnly(keyword);
      }
      
      return {
        ...result,
        message: result.message + ' (로켓배송 전용)'
      };
    } catch (error) {
      logger.error(`Failed to check rocket delivery keyword ${keyword}:`, error);
      throw error;
    }
  }

  /**
   * 키워드 상태 확인
   */
  async getKeywordStatus(keyword: string): Promise<{
    exists: boolean;
    keywordId?: string;
    lastCollected?: Date;
    totalProducts?: number;
    rocketProducts?: number;
  }> {
    try {
      const existing = await this.keywordService.getKeywordByNameAndType(keyword, 'cp');
      
      if (!existing) {
        return { exists: false };
      }

      // 로컬 DB에서 통계 가져오기
      const localDb = new LocalPostgresService();
      const statsQuery = `
        SELECT 
          COUNT(DISTINCT product_id) as total_products,
          COUNT(DISTINCT CASE WHEN is_rocket THEN product_id END) as rocket_products,
          MAX(collected_at) as last_collected
        FROM cp_rankings
        WHERE keyword_id = $1
          AND collected_at > NOW() - INTERVAL '24 hours'
      `;
      
      const result = await localDb.pool.query(statsQuery, [existing.id]);
      const stats = result.rows[0];

      return {
        exists: true,
        keywordId: existing.id,
        lastCollected: stats.last_collected,
        totalProducts: parseInt(stats.total_products) || 0,
        rocketProducts: parseInt(stats.rocket_products) || 0
      };
    } catch (error) {
      logger.error(`Failed to get status for keyword ${keyword}:`, error);
      throw error;
    }
  }

  /**
   * 로켓배송 상품 수 계산
   */
  private async getRocketDeliveryCount(keywordId: string): Promise<number> {
    try {
      const localDb = new LocalPostgresService();
      const query = `
        SELECT COUNT(DISTINCT product_id) as rocket_count
        FROM cp_rankings
        WHERE keyword_id = $1
          AND is_rocket = true
          AND collected_at = (
            SELECT MAX(collected_at) 
            FROM cp_rankings 
            WHERE keyword_id = $1
          )
      `;
      
      const result = await localDb.pool.query(query, [keywordId]);
      return parseInt(result.rows[0].rocket_count) || 0;
    } catch (error) {
      logger.error('Failed to get rocket delivery count:', error);
      return 0;
    }
  }

  /**
   * 키워드 검증
   */
  private validateKeyword(keyword: string): string {
    // 모든 종류의 줄바꿈 문자 제거 후 앞뒤 공백 제거
    const trimmed = keyword
      .replace(/[\r\n]+/g, '')  // \r, \n 제거
      .trim();
    
    // 길이 검증 (2자 이상, 50자 이하)
    if (trimmed.length < 2) {
      throw new Error('키워드는 2자 이상이어야 합니다');
    }
    
    if (trimmed.length > 50) {
      throw new Error('키워드는 50자 이하여야 합니다');
    }
    
    // 특수문자 검증 (한글, 영문, 숫자, 공백만 허용)
    const validPattern = /^[가-힣a-zA-Z0-9\s]+$/;
    if (!validPattern.test(trimmed)) {
      throw new Error('키워드는 한글, 영문, 숫자, 공백만 사용 가능합니다');
    }
    
    return trimmed;
  }
}