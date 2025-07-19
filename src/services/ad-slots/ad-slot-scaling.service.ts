import { executeQuery } from '../../database/mysql.client';
import { ApiKeyService } from '../api-key.service';
import { logger } from '../../utils/logger';

export class AdSlotScalingService {
  private apiKeyService: ApiKeyService | null = null;
  
  constructor() {
    // ApiKeyService will be initialized separately
  }
  
  async initialize(): Promise<void> {
    this.apiKeyService = await ApiKeyService.getInstance();
  }

  /**
   * 현재 API 키 수에 맞는 안전한 키워드 처리량 계산
   */
  async getScaledKeywordLimit(): Promise<number> {
    try {
      // 활성 API 키 조회
      const apiKeys = await this.apiKeyService!.getActiveApiKeys('naver_shopping');
      const keyCount = apiKeys.length;
      
      if (keyCount === 0) {
        logger.warn('No active API keys available');
        return 0;
      }
      
      // 안전한 키워드 수 계산
      // 키당 일일 20,000회 사용 (80% 사용률)
      // 3시간마다 실행 = 하루 8회
      // 키워드당 3페이지 = 3회 API 호출
      const safeCallsPerKey = 20000; // 일일 한도의 80%
      const runsPerDay = 8; // 3시간마다
      const pagesPerKeyword = 3;
      const callsPerRun = safeCallsPerKey / runsPerDay;
      const keywordsPerKey = Math.floor(callsPerRun / pagesPerKeyword);
      
      const totalKeywords = keyCount * keywordsPerKey;
      
      logger.info(`Scaling calculation: ${keyCount} keys × ${keywordsPerKey} keywords = ${totalKeywords} total`);
      
      return totalKeywords;
    } catch (error) {
      logger.error('Failed to calculate scaled keyword limit:', error);
      return 0;
    }
  }

  /**
   * 현재 처리 가능한 키워드 목록 조회
   */
  async getActiveKeywords(): Promise<string[]> {
    try {
      const limit = await this.getScaledKeywordLimit();
      
      if (limit === 0) {
        return [];
      }
      
      // 환경변수로 오버라이드 가능
      const maxKeywords = process.env.AD_SLOTS_MAX_KEYWORDS 
        ? parseInt(process.env.AD_SLOTS_MAX_KEYWORDS) 
        : limit;
      
      const finalLimit = Math.min(limit, maxKeywords);
      
      // 우선순위 기반 키워드 선택
      const query = `
        SELECT DISTINCT work_keyword 
        FROM ad_slots 
        WHERE is_active = 1 
          AND work_keyword IS NOT NULL
          AND work_keyword != ''
        ORDER BY 
          CASE WHEN price_rank IS NULL THEN 0 ELSE 1 END,  -- 미측정 우선
          CASE WHEN rank_check_date IS NULL THEN 0 ELSE 1 END,  -- 한번도 체크 안한 것 우선
          ABS(COALESCE(price_rank_diff, 0)) + ABS(COALESCE(store_rank_diff, 0)) DESC,  -- 순위 변동 큰 것
          created_at DESC  -- 최신 광고 우선
        LIMIT ?
      `;
      
      const results = await executeQuery<{ work_keyword: string }>(query, [finalLimit]);
      const keywords = results.map(r => r.work_keyword);
      
      logger.info(`Active keywords: ${keywords.length} (limit: ${finalLimit})`);
      
      return keywords;
    } catch (error) {
      logger.error('Failed to get active keywords:', error);
      return [];
    }
  }

  /**
   * 스케일링 상태 조회
   */
  async getScalingStatus(): Promise<{
    phase: number;
    apiKeys: {
      total: number;
      healthy: number;
      dailyCapacity: number;
      currentUsage: number;
      usagePercent: number;
    };
    keywords: {
      totalAvailable: number;
      currentlyActive: number;
      processingCapacity: number;
      recommendation: string;
    };
    nextScaling: {
      recommendedDate: string;
      addApiKeys: number;
      addKeywords: number;
      reason: string;
    };
  }> {
    try {
      // API 키 상태
      const apiKeys = await this.apiKeyService!.getActiveApiKeys('naver_shopping');
      const keyStats = await this.calculateKeyStats(apiKeys);
      
      // 키워드 상태
      const totalKeywordsQuery = `
        SELECT COUNT(DISTINCT work_keyword) as count
        FROM ad_slots
        WHERE is_active = 1 AND work_keyword IS NOT NULL
      `;
      const [{ count: totalAvailable }] = await executeQuery<{ count: number }>(totalKeywordsQuery);
      
      const currentCapacity = await this.getScaledKeywordLimit();
      const currentlyActive = Math.min(
        totalAvailable,
        parseInt(process.env.AD_SLOTS_MAX_KEYWORDS || String(currentCapacity))
      );
      
      // 현재 단계 계산
      const phase = this.calculatePhase(apiKeys.length);
      
      // 다음 스케일링 권장사항
      const nextScaling = this.calculateNextScaling(
        apiKeys.length,
        keyStats.usagePercent,
        currentlyActive,
        totalAvailable
      );
      
      return {
        phase,
        apiKeys: keyStats,
        keywords: {
          totalAvailable,
          currentlyActive,
          processingCapacity: currentCapacity,
          recommendation: this.getRecommendation(keyStats.usagePercent),
        },
        nextScaling,
      };
    } catch (error) {
      logger.error('Failed to get scaling status:', error);
      throw error;
    }
  }

  /**
   * API 키 통계 계산
   */
  private async calculateKeyStats(apiKeys: any[]): Promise<any> {
    let totalUsage = 0;
    let healthyKeys = 0;
    
    for (const key of apiKeys) {
      const usage = key.daily_usage || 0;
      totalUsage += usage;
      
      if (usage < 22500) { // 90% 미만
        healthyKeys++;
      }
    }
    
    const dailyCapacity = apiKeys.length * 25000;
    const usagePercent = dailyCapacity > 0 ? (totalUsage / dailyCapacity) * 100 : 0;
    
    return {
      total: apiKeys.length,
      healthy: healthyKeys,
      dailyCapacity,
      currentUsage: totalUsage,
      usagePercent: Math.round(usagePercent),
    };
  }

  /**
   * 현재 단계 계산
   */
  private calculatePhase(keyCount: number): number {
    if (keyCount <= 2) return 1;
    if (keyCount <= 4) return 2;
    if (keyCount <= 7) return 3;
    if (keyCount <= 10) return 4;
    return 5;
  }

  /**
   * 다음 스케일링 권장사항 계산
   */
  private calculateNextScaling(
    currentKeys: number,
    usagePercent: number,
    activeKeywords: number,
    totalKeywords: number
  ): any {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 7); // 기본 1주 후
    
    let addKeys = 0;
    let addKeywords = 0;
    let reason = '';
    
    if (usagePercent < 50 && activeKeywords < totalKeywords) {
      // 사용률이 낮고 처리할 키워드가 더 있음
      addKeys = 0;
      addKeywords = Math.min(1000, totalKeywords - activeKeywords);
      reason = 'Low usage, can handle more keywords';
    } else if (usagePercent > 70) {
      // 사용률이 높음
      addKeys = Math.ceil(currentKeys * 0.5); // 50% 증가
      addKeywords = addKeys * 800; // 키당 800개 키워드
      reason = `High usage (${usagePercent}%), need more API keys`;
    } else {
      // 안정적인 상태
      reason = 'System running stable, monitor for 1 more week';
    }
    
    return {
      recommendedDate: nextDate.toISOString().split('T')[0],
      addApiKeys: addKeys,
      addKeywords,
      reason,
    };
  }

  /**
   * 권장사항 생성
   */
  private getRecommendation(usagePercent: number): string {
    if (usagePercent < 30) return 'underutilized';
    if (usagePercent < 70) return 'optimal';
    if (usagePercent < 85) return 'monitor';
    return 'expand';
  }
}