import { KeywordService } from '../keyword/keyword.service';
import { RankingService } from './ranking.service';
import { SimplifiedDataSyncService } from '../sync/data-sync-simplified.service';
import { LocalPostgresService } from '../database/local-postgres.service';
import { SupabaseService } from '../database/supabase.service';
import { logger } from '../../utils/logger';

export interface KeywordCheckResult {
  keyword: string;
  keywordId: string;
  isNew: boolean;
  message: string;
  error?: string;
}

export class InstantRankingService {
  private keywordService: KeywordService;
  private rankingService: RankingService;
  private syncService: SimplifiedDataSyncService;

  constructor() {
    this.keywordService = new KeywordService();
    this.rankingService = new RankingService();
    const localDb = new LocalPostgresService();
    const supabase = new SupabaseService();
    this.syncService = new SimplifiedDataSyncService(localDb, supabase);
  }

  /**
   * 단일 키워드 체크 및 처리
   */
  async checkKeyword(keyword: string): Promise<KeywordCheckResult> {
    try {
      // 키워드 검증
      const validatedKeyword = this.validateKeyword(keyword);
      
      // 1. 키워드 존재 확인
      const existing = await this.keywordService.getKeywordByName(validatedKeyword);
      
      if (existing) {
        logger.info(`Keyword already exists: ${validatedKeyword}`);
        return {
          keyword: validatedKeyword,
          keywordId: existing.id,
          isNew: false,
          message: '이미 등록된 키워드입니다'
        };
      }
      
      // 2. 새 키워드 추가
      logger.info(`Creating new keyword: ${validatedKeyword}`);
      const newKeyword = await this.keywordService.createKeyword(validatedKeyword);
      
      // 3. 즉시 순위 수집
      try {
        logger.info(`Collecting rankings for new keyword: ${validatedKeyword}`);
        // RankingService는 SearchKeyword 타입을 기대하므로 변환
        const searchKeyword = {
          id: newKeyword.id,
          user_id: null,
          keyword: newKeyword.keyword,
          pc_count: 0,
          mobile_count: 0,
          total_count: 0,
          pc_ratio: 0,
          mobile_ratio: 0,
          searched_at: newKeyword.created_at
        };
        await this.rankingService.collectKeywordRankings(searchKeyword);
        
        // 4. 즉시 Supabase 동기화 (current, hourly)
        logger.info(`Syncing rankings to Supabase for keyword: ${validatedKeyword}`);
        await this.syncService.syncCurrentRankings([newKeyword.id]);
        await this.syncService.syncHourlySnapshots([newKeyword.id]);
        
        return {
          keyword: validatedKeyword,
          keywordId: newKeyword.id,
          isNew: true,
          message: '키워드 추가, 순위 수집 및 동기화 완료'
        };
      } catch (collectError) {
        logger.error(`Failed to collect rankings for ${validatedKeyword}:`, collectError);
        
        // 순위 수집 실패해도 키워드는 추가됨
        return {
          keyword: validatedKeyword,
          keywordId: newKeyword.id,
          isNew: true,
          message: '키워드 추가됨 (순위 수집은 다음 스케줄에 진행)',
          error: '순위 수집 중 오류 발생'
        };
      }
      
    } catch (error) {
      logger.error(`Failed to check keyword ${keyword}:`, error);
      throw error;
    }
  }

  /**
   * 다중 키워드 체크 및 처리
   */
  async checkMultipleKeywords(keywords: string[]): Promise<KeywordCheckResult[]> {
    logger.info(`Checking ${keywords.length} keywords`);
    
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
    
    logger.info(`Keyword check completed: ${newCount} new, ${existingCount} existing, ${errorCount} errors`);
    
    return results;
  }

  /**
   * 키워드 검증
   */
  private validateKeyword(keyword: string): string {
    // 앞뒤 공백 제거
    const trimmed = keyword.trim();
    
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