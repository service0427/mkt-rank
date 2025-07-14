import { KeywordService } from '../keyword/keyword.service';
import { LocalPostgresService } from '../database/local-postgres.service';
import { addKeywordToQueue } from '../../queues/ranking-queue';
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

  constructor() {
    this.keywordService = new KeywordService();
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
      
      // 3. 큐에 추가하여 Worker가 처리하도록 함
      logger.info(`Adding Coupang keyword to queue: ${validatedKeyword}`);
      
      try {
        const job = await addKeywordToQueue(validatedKeyword, 0, 'cp');
        if (job) {
          logger.info(`Successfully added keyword ${validatedKeyword} to queue (Job ID: ${job.id})`);
        }
      } catch (error) {
        logger.error(`Failed to add keyword ${validatedKeyword} to queue:`, error);
      }
      
      return {
        keyword: validatedKeyword,
        keywordId: newKeyword.id,
        isNew: true,
        message: '쿠팡 키워드 추가됨 (순위 수집이 큐에 등록되었습니다)'
      };
      
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
      // 일반 키워드와 동일하게 처리 (큐 사용)
      const result = await this.checkKeyword(keyword);
      
      return {
        ...result,
        message: result.message + ' (로켓배송 상품 포함)'
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