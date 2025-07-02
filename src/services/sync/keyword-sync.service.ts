import { SupabaseService } from '../database/supabase.service';
import { NaverKeywordApiService } from '../keyword/naver-keyword-api.service';
import { logger } from '../../utils/logger';
import { Campaign } from '../../types/supabase-types';


export class KeywordSyncService {
  private supabase: SupabaseService;
  private naverApi: NaverKeywordApiService;

  constructor() {
    this.supabase = new SupabaseService();
    this.naverApi = new NaverKeywordApiService();
  }

  /**
   * 메인 동기화 함수 - 누락된 키워드를 찾아서 등록
   * @param dryRun - true면 실제로 추가하지 않고 로그만 출력
   */
  async syncMissingKeywords(dryRun: boolean = false): Promise<void> {
    try {
      logger.info('Starting keyword synchronization...');

      // 1. campaigns에서 키워드 추출
      const campaignKeywords = await this.extractKeywordsFromCampaigns();
      logger.info(`Found ${campaignKeywords.size} keywords from campaigns`);

      // 2. shopping_rankings_current에서 사용 중인 keyword_id 찾기
      const missingKeywordIds = await this.findMissingKeywordIds();
      logger.info(`Found ${missingKeywordIds.length} keyword IDs without search_keywords entry`);

      // 3. 두 소스에서 찾은 키워드 처리
      const keywordsToAdd = new Set<string>();

      // campaigns에서 찾은 키워드 중 search_keywords에 없는 것
      for (const keyword of campaignKeywords) {
        const exists = await this.checkKeywordExists(keyword);
        if (!exists) {
          keywordsToAdd.add(keyword);
        }
      }

      // 4. 누락된 키워드 등록
      logger.info(`Total keywords to add: ${keywordsToAdd.size}`);
      
      if (dryRun) {
        logger.info('=== DRY RUN MODE - 실제로 추가되지 않습니다 ===');
        for (const keyword of keywordsToAdd) {
          logger.info(`[DRY RUN] Would add keyword: ${keyword}`);
        }
      } else {
        for (const keyword of keywordsToAdd) {
          await this.addKeyword(keyword);
          // API 호출 간격 조절
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      logger.info('Keyword synchronization completed');
    } catch (error) {
      logger.error('Keyword synchronization failed:', error);
      throw error;
    }
  }

  /**
   * campaigns 테이블에서 키워드 추출
   */
  private async extractKeywordsFromCampaigns(): Promise<Set<string>> {
    const keywords = new Set<string>();

    try {
      const { data: campaigns, error } = await this.supabase.client
        .from('campaigns')
        .select('id, ranking_field_mapping, add_info')
        .not('ranking_field_mapping', 'is', null)
        .not('add_info', 'is', null)
        .returns<Pick<Campaign, 'id' | 'ranking_field_mapping' | 'add_info'>[]>();

      if (error) throw error;

      for (const campaign of campaigns || []) {
        try {
          // ranking_field_mapping과 add_info를 매칭해서 키워드 추출
          const mappings = campaign.ranking_field_mapping;
          const addInfo = campaign.add_info;

          if (mappings && addInfo) {
            // ranking_field_mapping 구조에 따라 파싱
            // 예: {"keyword": "search_term"} 형태라면
            for (const [key, fieldName] of Object.entries(mappings)) {
              if (key.includes('keyword') && typeof fieldName === 'string' && addInfo[fieldName]) {
                const keyword = String(addInfo[fieldName]).trim();
                if (keyword) {
                  keywords.add(keyword);
                }
              }
            }

            // 또는 add_info에 직접 keyword 필드가 있을 수도 있음
            if (addInfo.keyword) {
              keywords.add(String(addInfo.keyword).trim());
            }
            if (addInfo.search_keyword) {
              keywords.add(String(addInfo.search_keyword).trim());
            }
          }
        } catch (err) {
          logger.error(`Failed to extract keywords from campaign ${campaign.id}:`, err);
        }
      }
    } catch (error) {
      logger.error('Failed to fetch campaigns:', error);
      throw error;
    }

    return keywords;
  }

  /**
   * shopping_rankings_current에서 search_keywords에 없는 keyword_id 찾기
   */
  private async findMissingKeywordIds(): Promise<string[]> {
    try {
      // shopping_rankings_current의 모든 unique keyword_id
      const { data: rankingKeywordIds, error: rankingError } = await this.supabase.client
        .from('shopping_rankings_current')
        .select('keyword_id')
        .order('keyword_id');

      if (rankingError) throw rankingError;

      // 중복 제거
      const uniqueKeywordIds = [...new Set(rankingKeywordIds?.map(r => r.keyword_id) || [])];

      // search_keywords에 있는 id들
      const { data: existingKeywords, error: keywordError } = await this.supabase.client
        .from('search_keywords')
        .select('id')
        .in('id', uniqueKeywordIds);

      if (keywordError) throw keywordError;

      const existingIds = new Set(existingKeywords?.map(k => k.id) || []);
      
      // 누락된 ID들
      return uniqueKeywordIds.filter(id => !existingIds.has(id));
    } catch (error) {
      logger.error('Failed to find missing keyword IDs:', error);
      throw error;
    }
  }

  /**
   * 키워드 존재 여부 확인
   */
  private async checkKeywordExists(keyword: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.client
        .from('search_keywords')
        .select('id')
        .eq('keyword', keyword)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
        throw error;
      }

      return !!data;
    } catch (error) {
      logger.error(`Failed to check keyword existence for "${keyword}":`, error);
      return false;
    }
  }

  /**
   * 새 키워드 추가
   */
  private async addKeyword(keyword: string): Promise<void> {
    try {
      logger.info(`Adding new keyword: ${keyword}`);

      // 네이버 API로 검색량 조회
      const searchVolume = await this.naverApi.analyzeKeyword(keyword);

      const { error } = await this.supabase.client
        .from('search_keywords')
        .insert({
          keyword,
          pc_count: searchVolume?.pc || 0,
          mobile_count: searchVolume?.mobile || 0,
          total_count: searchVolume?.total || 0,
          pc_ratio: searchVolume?.pcRatio || 0,
          mobile_ratio: searchVolume?.mobileRatio || 0,
          is_active: true,
          user_id: null // 시스템에서 자동 생성
        });

      if (error) {
        logger.error(`Failed to insert keyword "${keyword}":`, error);
        throw error;
      }

      logger.info(`Successfully added keyword: ${keyword}`);
    } catch (error) {
      logger.error(`Failed to add keyword "${keyword}":`, error);
      // 개별 실패는 전체 프로세스를 중단하지 않음
    }
  }
}