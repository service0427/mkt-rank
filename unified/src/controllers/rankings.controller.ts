// Rankings Controller
import { query } from '../db/postgres';

interface RankingFilter {
  platform?: string;
  service_id?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
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

export async function triggerCollection(_service_id?: string, _keyword_ids?: string[]) {
  // This would trigger the collector worker
  // For now, just return success
  return {
    success: true,
    message: 'Collection triggered',
    job_id: `job_${Date.now()}`
  };
}