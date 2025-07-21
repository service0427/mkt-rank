// Rankings Controller
import { query } from '../db/postgres';

interface RankingFilter {
  platform?: string;
  service_id?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}

interface SearchRankingParams {
  keyword: string;
  platform: string;
  limit: number;
}

export async function getCurrentRankings(filters: RankingFilter) {
  try {
    let whereConditions = [];
    let params = [];
    let paramCount = 1;
    
    if (filters.platform) {
      whereConditions.push(`r.platform = $${paramCount++}`);
      params.push(filters.platform);
    }
    
    if (filters.service_id) {
      whereConditions.push(`k.service_id = $${paramCount++}`);
      params.push(filters.service_id);
    }
    
    if (filters.keyword) {
      whereConditions.push(`k.keyword ILIKE $${paramCount++}`);
      params.push(`%${filters.keyword}%`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;
    
    params.push(limit, offset);
    
    const rankings = await query<any>(`
      SELECT 
        r.keyword_id,
        r.platform,
        r.product_id,
        r.title,
        r.link,
        r.image,
        r.lprice,
        r.mall_name,
        r.brand,
        r.category1,
        r.rank,
        r.previous_rank,
        r.rank_change,
        r.collected_at,
        k.keyword,
        k.service_id,
        s.service_name
      FROM unified_rankings_current r
      JOIN unified_search_keywords k ON r.keyword_id = k.id
      LEFT JOIN unified_services s ON k.service_id = s.service_id
      ${whereClause}
      ORDER BY k.keyword, r.rank
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `, params);
    
    return rankings;
  } catch (error) {
    console.error('Error fetching current rankings:', error);
    return [];
  }
}

export async function getRankingHistory(keyword_id: string, days: number = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get hourly data for recent days
    if (days <= 7) {
      const history = await query<any>(`
        SELECT 
          keyword_id,
          platform,
          product_id,
          hour,
          avg_rank,
          min_rank,
          max_rank,
          title,
          lprice,
          mall_name
        FROM unified_rankings_hourly
        WHERE keyword_id = $1 AND hour >= $2
        ORDER BY hour DESC, avg_rank ASC
      `, [keyword_id, startDate]);
      
      return history;
    } else {
      // Get daily data for longer periods
      const history = await query<any>(`
        SELECT 
          keyword_id,
          platform,
          product_id,
          date,
          avg_rank,
          min_rank,
          max_rank,
          title,
          lprice,
          mall_name
        FROM unified_rankings_daily
        WHERE keyword_id = $1 AND date >= $2
        ORDER BY date DESC, avg_rank ASC
      `, [keyword_id, startDate]);
      
      return history;
    }
  } catch (error) {
    console.error('Error fetching ranking history:', error);
    return [];
  }
}

export async function getKeywordStats(keyword_id: string) {
  try {
    // Get current rank and previous rank
    const [currentRank] = await query<any>(`
      SELECT 
        rank as current_rank,
        previous_rank,
        rank_change,
        collected_at
      FROM unified_rankings_current
      WHERE keyword_id = $1 AND platform = 'naver_shopping'
      ORDER BY rank ASC
      LIMIT 1
    `, [keyword_id]);
    
    // Get 7 day trend
    const [weekStats] = await query<any>(`
      SELECT 
        ROUND(AVG(avg_rank), 1) as avg_rank,
        MIN(min_rank) as best_rank
      FROM unified_rankings_daily
      WHERE keyword_id = $1 
        AND platform = 'naver_shopping'
        AND date >= CURRENT_DATE - INTERVAL '7 days'
    `, [keyword_id]);
    
    if (!currentRank && !weekStats) {
      return {
        current_rank: '-',
        previous_rank: '-',
        best_rank: '-',
        avg_rank: '-',
        rank_change: 0
      };
    }
    
    return {
      current_rank: currentRank?.current_rank || '-',
      previous_rank: currentRank?.previous_rank || '-',
      best_rank: weekStats?.best_rank || currentRank?.current_rank || '-',
      avg_rank: weekStats?.avg_rank || currentRank?.current_rank || '-',
      rank_change: currentRank?.rank_change || 0,
      collected_at: currentRank?.collected_at
    };
  } catch (error) {
    console.error('Error fetching keyword stats:', error);
    return {
      current_rank: '-',
      previous_rank: '-',
      best_rank: '-',
      avg_rank: '-',
      rank_change: 0
    };
  }
}

export async function getProductStats(keyword_id: string, product_id: string) {
  try {
    // Get current rank and product info
    const [currentData] = await query<any>(`
      SELECT 
        rank as current_rank,
        previous_rank,
        rank_change,
        collected_at,
        title,
        lprice,
        mall_name
      FROM unified_rankings_current
      WHERE keyword_id = $1 
        AND product_id = $2
        AND platform = 'naver_shopping'
      LIMIT 1
    `, [keyword_id, product_id]);
    
    // Get 7 day stats
    const [weekStats] = await query<any>(`
      SELECT 
        ROUND(AVG(avg_rank), 1) as avg_rank,
        MIN(min_rank) as best_rank
      FROM unified_rankings_daily
      WHERE keyword_id = $1 
        AND product_id = $2
        AND platform = 'naver_shopping'
        AND date >= CURRENT_DATE - INTERVAL '7 days'
    `, [keyword_id, product_id]);
    
    if (!currentData && !weekStats) {
      return null;
    }
    
    return {
      current_rank: currentData?.current_rank || '-',
      previous_rank: currentData?.previous_rank || '-',
      best_rank: weekStats?.best_rank || currentData?.current_rank || '-',
      avg_rank: weekStats?.avg_rank || currentData?.current_rank || '-',
      rank_change: currentData?.rank_change || 0,
      collected_at: currentData?.collected_at,
      title: currentData?.title,
      lprice: currentData?.lprice,
      mall_name: currentData?.mall_name
    };
  } catch (error) {
    console.error('Error fetching product stats:', error);
    return null;
  }
}

export async function getProductRankingHistory(keyword_id: string, product_id: string, days: number = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get hourly data for recent days
    if (days <= 7) {
      const history = await query<any>(`
        SELECT 
          hour,
          avg_rank,
          min_rank,
          max_rank,
          sample_count
        FROM unified_rankings_hourly
        WHERE keyword_id = $1 
          AND product_id = $2
          AND platform = 'naver_shopping'
          AND hour >= $3
        ORDER BY hour DESC
      `, [keyword_id, product_id, startDate]);
      
      return history;
    } else {
      // Get daily data for longer periods
      const history = await query<any>(`
        SELECT 
          date,
          avg_rank,
          min_rank,
          max_rank,
          sample_count
        FROM unified_rankings_daily
        WHERE keyword_id = $1 
          AND product_id = $2
          AND platform = 'naver_shopping'
          AND date >= $3
        ORDER BY date DESC
      `, [keyword_id, product_id, startDate]);
      
      return history;
    }
  } catch (error) {
    console.error('Error fetching product ranking history:', error);
    return [];
  }
}

export async function triggerCollection(_service_id?: string, _keyword_ids?: string[]) {
  // This would trigger the collector worker
  // For now, just return success
  return {
    success: true,
    message: 'Collection triggered',
    job_id: `job_${Date.now()}`
  };
}

export async function searchRankings(params: SearchRankingParams) {
  try {
    const { keyword, platform, limit } = params;
    
    // 먼저 해당 키워드가 있는지 확인
    const [keywordData] = await query<any>(`
      SELECT id FROM unified_search_keywords 
      WHERE keyword = $1
      LIMIT 1
    `, [keyword]);
    
    if (!keywordData) {
      return [];
    }
    
    // unified_rankings_current에서 검색
    const rankings = await query<any>(`
      SELECT 
        urc.rank,
        urc.product_id,
        urc.title,
        urc.link,
        urc.image,
        urc.lprice,
        urc.mall_name,
        urc.brand,
        urc.category1,
        urc.previous_rank,
        urc.rank_change,
        urc.collected_at,
        usk.keyword
      FROM unified_rankings_current urc
      JOIN unified_search_keywords usk ON urc.keyword_id = usk.id
      WHERE usk.keyword = $1 
      AND urc.platform = $2
      ORDER BY urc.rank ASC
      LIMIT $3
    `, [keyword, platform, limit]);
    
    if (rankings.length === 0) {
      // current 테이블에 없으면 detail 테이블에서 검색
      const detailRankings = await query<any>(`
        SELECT 
          rank,
          product_id,
          title,
          link,
          image,
          lprice,
          mall_name,
          brand,
          category1,
          collected_at,
          keyword
        FROM unified_rankings_detail
        WHERE keyword = $1 
        AND platform = $2
        AND collected_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        ORDER BY collected_at DESC, rank ASC
        LIMIT $3
      `, [keyword, platform, limit]);
      
      return detailRankings;
    }
    
    return rankings;
  } catch (error) {
    console.error('Error searching rankings:', error);
    throw error;
  }
}