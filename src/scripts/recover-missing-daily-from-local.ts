/**
 * 로컬 PostgreSQL 파티션 테이블에서 누락된 daily 데이터 복구
 * 7월 13-15일 데이터를 shopping_rankings_2025_07에서 가져와 Supabase에 동기화
 */

import { Pool } from 'pg';
import { SupabaseService } from '../services/database/supabase.service';
import { logger } from '../utils/logger';

// 로컬 PostgreSQL 연결 설정 (서버 DB)
const localPool = new Pool({
  host: process.env.LOCAL_PG_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_PG_PORT || '5432'),
  database: process.env.LOCAL_PG_DATABASE || 'mkt_rank_local',
  user: process.env.LOCAL_PG_USER || process.env.USER,
  password: process.env.LOCAL_PG_PASSWORD || '',
  max: 5,
});

async function recoverMissingDailyDataFromLocal() {
  logger.info('Starting recovery of missing daily data from local PostgreSQL...');
  
  const supabase = new SupabaseService();
  
  try {
    // 복구할 날짜 설정 (7월 13-15일)
    const dates = ['2025-07-13', '2025-07-14', '2025-07-15'];
    
    for (const dateStr of dates) {
      logger.info(`Processing date: ${dateStr}`);
      
      // KST 22:00-23:59 (UTC 13:00-14:59) 데이터를 찾기 위한 시간 범위 설정
      const startTime = `${dateStr} 13:00:00`;
      const endTime = `${dateStr} 14:59:59`;
      
      // 로컬 DB에서 해당 시간대의 데이터 조회
      const query = `
        WITH ranked_data AS (
          SELECT 
            keyword_id,
            product_id,
            rank,
            title,
            lprice,
            image,
            mall_name,
            brand,
            category1,
            category2,
            link,
            collected_at,
            ROW_NUMBER() OVER (
              PARTITION BY keyword_id, product_id 
              ORDER BY collected_at DESC
            ) as rn
          FROM shopping_rankings_2025_07
          WHERE collected_at >= $1::timestamp 
            AND collected_at <= $2::timestamp
        )
        SELECT 
          keyword_id,
          product_id,
          rank,
          title,
          lprice,
          image,
          mall_name,
          brand,
          category1,
          category2,
          link,
          collected_at
        FROM ranked_data
        WHERE rn = 1
        ORDER BY keyword_id, rank
      `;
      
      logger.info(`Querying data between ${startTime} and ${endTime}`);
      const result = await localPool.query(query, [startTime, endTime]);
      
      if (result.rows.length === 0) {
        logger.warn(`No data found for ${dateStr}`);
        continue;
      }
      
      logger.info(`Found ${result.rows.length} records for ${dateStr}`);
      
      // 키워드별로 그룹화
      const dataByKeyword: Record<string, any[]> = {};
      result.rows.forEach(row => {
        if (!dataByKeyword[row.keyword_id]) {
          dataByKeyword[row.keyword_id] = [];
        }
        dataByKeyword[row.keyword_id].push(row);
      });
      
      // 각 키워드별로 Supabase에 저장
      for (const [keywordId, rankings] of Object.entries(dataByKeyword)) {
        try {
          // shopping_rankings_daily 테이블에 저장
          const { error } = await supabase.client
            .from('shopping_rankings_daily')
            .upsert(
              rankings.map(ranking => ({
                keyword_id: ranking.keyword_id,
                product_id: ranking.product_id,
                date: dateStr,
                rank: ranking.rank,
                title: ranking.title,
                lprice: ranking.lprice,
                image: ranking.image,
                mall_name: ranking.mall_name,
                brand: ranking.brand,
                category1: ranking.category1,
                category2: ranking.category2,
                link: ranking.link,
                last_updated: new Date().toISOString()
              })),
              { onConflict: 'keyword_id,product_id,date' }
            );
          
          if (error) {
            logger.error(`Failed to sync daily data for keyword ${keywordId} on ${dateStr}:`, error);
          } else {
            logger.info(`Successfully recovered ${rankings.length} products for keyword ${keywordId} on ${dateStr}`);
          }
          
        } catch (error) {
          logger.error(`Failed to process keyword ${keywordId} on ${dateStr}:`, error);
        }
      }
      
      logger.info(`Completed recovery for ${dateStr}`);
    }
    
    logger.info('Recovery process completed');
    
    // 복구 후 통계 확인
    const { data: stats, error: statsError } = await supabase.client
      .from('shopping_rankings_daily')
      .select('date', { count: 'exact' })
      .gte('date', '2025-07-12')
      .lte('date', '2025-07-15')
      .order('date', { ascending: true });
      
    if (statsError) {
      logger.error('Failed to get recovery stats:', statsError);
    } else {
      logger.info('Recovery statistics:');
      const dateStats = await Promise.all(
        ['2025-07-12', '2025-07-13', '2025-07-14', '2025-07-15'].map(async (date) => {
          const { count } = await supabase.client
            .from('shopping_rankings_daily')
            .select('*', { count: 'exact', head: true })
            .eq('date', date);
          return { date, count };
        })
      );
      dateStats.forEach(stat => {
        logger.info(`${stat.date}: ${stat.count || 0} records`);
      });
    }
    
  } catch (error) {
    logger.error('Recovery process failed:', error);
  } finally {
    await localPool.end();
  }
}

// 스크립트 실행
recoverMissingDailyDataFromLocal()
  .then(() => {
    logger.info('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });