// Unified Ranking Collector Worker
import { query } from '../db/postgres';
import { UnifiedKeyword } from '../types';
import { NaverShoppingProvider } from './providers/naver-shopping.provider';
// import { CoupangProvider } from './providers/coupang.provider';
import * as cron from 'node-cron';

interface RankingData {
  keyword: string;
  rank: number;
  platform: string;
  metadata?: any;
}

class RankingCollector {
  private naverProvider: NaverShoppingProvider;
  // private coupangProvider: CoupangProvider | null = null;
  private isRunning = false;

  constructor() {
    this.naverProvider = new NaverShoppingProvider();
    // 쿠팡은 나중에 활성화
    // this.coupangProvider = new CoupangProvider();
  }

  async collectAllRankings() {
    if (this.isRunning) {
      console.log('Ranking collection is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting ranking collection...');

    try {
      // Get all active keywords
      const keywords = await this.getActiveKeywords();
      console.log(`Found ${keywords.length} active keywords to collect`);

      // Collect rankings for each keyword
      for (const keyword of keywords) {
        await this.collectKeywordRankings(keyword);
        // Add delay to avoid rate limiting
        await this.delay(1000);
      }

      console.log('Ranking collection completed');
    } catch (error) {
      console.error('Error during ranking collection:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async getActiveKeywords(): Promise<UnifiedKeyword[]> {
    const result = await query<UnifiedKeyword>(`
      SELECT DISTINCT k.*, s.service_name
      FROM unified_search_keywords k
      LEFT JOIN unified_services s ON k.service_id = s.service_id
      WHERE k.is_active = true
      ORDER BY k.keyword
    `);
    return result;
  }

  private async collectKeywordRankings(keyword: UnifiedKeyword) {
    console.log(`Collecting rankings for: ${keyword.keyword}`);

    try {
      // Collect based on keyword type
      if (keyword.type === 'shopping' || keyword.type === 'naver') {
        await this.collectNaverRankings(keyword);
      }
      
      if (keyword.type === 'coupang') {
        await this.collectCoupangRankings(keyword);
      }

      if (keyword.type === 'ad_slots') {
        // AD_SLOTS uses Naver Shopping rankings
        await this.collectNaverRankings(keyword);
      }
    } catch (error) {
      console.error(`Error collecting rankings for ${keyword.keyword}:`, error);
    }
  }

  private async collectNaverRankings(keyword: UnifiedKeyword) {
    try {
      const rankings = await this.naverProvider.getRankings(keyword.keyword, 3); // 3 pages = 300 items
      await this.saveRankings(keyword, rankings, 'naver_shopping');
    } catch (error) {
      console.error(`Naver ranking collection failed for ${keyword.keyword}:`, error);
    }
  }

  private async collectCoupangRankings(keyword: UnifiedKeyword) {
    // 쿠팡은 나중에 구현
    console.log(`Coupang ranking collection skipped for ${keyword.keyword} (not implemented yet)`);
  }

  private async saveRankings(keyword: UnifiedKeyword, rankings: RankingData[], platform: string) {
    if (!rankings || rankings.length === 0) {
      console.log(`No rankings found for ${keyword.keyword} on ${platform}`);
      return;
    }

    const collectedAt = new Date();
    
    // Save detailed rankings to partitioned table
    for (const ranking of rankings) {
      try {
        await query(`
          INSERT INTO unified_rankings_detail (
            service_id, keyword_id, keyword, platform,
            product_id, title, link, image, lprice, mall_name,
            brand, category1, category2,
            rank, collected_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          keyword.service_id,
          keyword.id,
          keyword.keyword,
          platform,
          ranking.metadata?.productId || '',
          ranking.metadata?.title || '',
          ranking.metadata?.link || ranking.metadata?.href || '',
          ranking.metadata?.image || ranking.metadata?.thumbnail || '',
          ranking.metadata?.lprice || 0,
          ranking.metadata?.mallName || '쿠팡',
          ranking.metadata?.brand || '',
          ranking.metadata?.category1 || '',
          ranking.metadata?.category2 || '',
          ranking.rank,
          collectedAt
        ]);
      } catch (error) {
        console.error(`Error saving ranking detail for ${keyword.keyword}:`, error);
      }
    }

    // Update current rankings table
    await this.updateCurrentRankings(keyword, rankings, platform);
    
    // Update hourly and daily aggregations for all products
    for (const ranking of rankings) {
      await this.updateHourlyRanking(keyword, ranking, platform);
      await this.updateDailyRanking(keyword, ranking, platform);
    }
    
    console.log(`Saved ${rankings.length} rankings for ${keyword.keyword} on ${platform}`);
  }

  private async updateCurrentRankings(keyword: UnifiedKeyword, rankings: any[], platform: string) {
    // 기존 순위 조회 (이전 순위 계산용)
    const existingRanks = await query<any>(`
      SELECT product_id, rank 
      FROM unified_rankings_current 
      WHERE keyword_id = $1 AND platform = $2
    `, [keyword.id, platform]);

    const rankMap = new Map(existingRanks.map(r => [r.product_id, r.rank]));

    // 각 순위 업데이트 또는 삽입
    for (const ranking of rankings) {
      const productId = ranking.metadata?.productId || '';
      const previousRank = rankMap.get(productId);

      await query(`
        INSERT INTO unified_rankings_current (
          keyword_id, platform, product_id,
          rank, previous_rank,
          title, link, image, lprice, mall_name,
          brand, category1, collected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (keyword_id, product_id, platform)
        DO UPDATE SET
          rank = $4,
          previous_rank = unified_rankings_current.rank,
          title = $6,
          link = $7,
          image = $8,
          lprice = $9,
          mall_name = $10,
          brand = $11,
          category1 = $12,
          collected_at = $13,
          updated_at = CURRENT_TIMESTAMP
      `, [
        keyword.id,
        platform,
        productId,
        ranking.rank,
        previousRank || null,
        ranking.metadata?.title || '',
        ranking.metadata?.link || ranking.metadata?.href || '',
        ranking.metadata?.image || ranking.metadata?.thumbnail || '',
        ranking.metadata?.lprice || 0,
        ranking.metadata?.mallName || (platform === 'coupang' ? '쿠팡' : ''),
        ranking.metadata?.brand || '',
        ranking.metadata?.category1 || '',
        new Date()
      ]);
    }

    // 300위 밖으로 밀려난 상품 제거
    await query(`
      DELETE FROM unified_rankings_current
      WHERE keyword_id = $1 
      AND platform = $2
      AND product_id NOT IN (
        SELECT product_id 
        FROM unnest($3::text[]) AS product_id
      )
    `, [keyword.id, platform, rankings.map(r => r.metadata?.productId || '')]);
  }

  private async updateHourlyRanking(keyword: UnifiedKeyword, ranking: RankingData, platform: string) {
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);

    await query(`
      INSERT INTO unified_rankings_hourly (
        keyword_id, platform, product_id, hour,
        avg_rank, min_rank, max_rank, sample_count,
        title, lprice, mall_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10)
      ON CONFLICT (keyword_id, platform, product_id, hour)
      DO UPDATE SET
        avg_rank = (unified_rankings_hourly.avg_rank * unified_rankings_hourly.sample_count + $5) / (unified_rankings_hourly.sample_count + 1),
        min_rank = LEAST(unified_rankings_hourly.min_rank, $6),
        max_rank = GREATEST(unified_rankings_hourly.max_rank, $7),
        sample_count = unified_rankings_hourly.sample_count + 1
    `, [
      keyword.id,
      platform,
      ranking.metadata?.productId || '',
      currentHour,
      ranking.rank,
      ranking.rank,
      ranking.rank,
      ranking.metadata?.title || '',
      ranking.metadata?.lprice || 0,
      ranking.metadata?.mallName || '쿠팡'
    ]);
  }

  private async updateDailyRanking(keyword: UnifiedKeyword, ranking: RankingData, platform: string) {
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    await query(`
      INSERT INTO unified_rankings_daily (
        keyword_id, platform, product_id, date,
        avg_rank, min_rank, max_rank, sample_count,
        title, lprice, mall_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10)
      ON CONFLICT (keyword_id, platform, product_id, date)
      DO UPDATE SET
        avg_rank = (unified_rankings_daily.avg_rank * unified_rankings_daily.sample_count + $5) / (unified_rankings_daily.sample_count + 1),
        min_rank = LEAST(unified_rankings_daily.min_rank, $6),
        max_rank = GREATEST(unified_rankings_daily.max_rank, $7),
        sample_count = unified_rankings_daily.sample_count + 1
    `, [
      keyword.id,
      platform,
      ranking.metadata?.productId || '',
      currentDate,
      ranking.rank,
      ranking.rank,
      ranking.rank,
      ranking.metadata?.title || '',
      ranking.metadata?.lprice || 0,
      ranking.metadata?.mallName || '쿠팡'
    ]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main worker execution
const collector = new RankingCollector();

// Run immediately on start
collector.collectAllRankings();

// Schedule to run every hour
cron.schedule('0 * * * *', () => {
  console.log('Starting scheduled ranking collection...');
  collector.collectAllRankings();
});

console.log('Ranking collector worker started. Scheduled to run every hour.');

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down ranking collector...');
  process.exit(0);
});