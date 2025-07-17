/**
 * 누락된 daily 데이터 복구 스크립트
 * 12일부터 현재까지의 hourly 데이터를 기반으로 daily 데이터 재생성
 */

import { LocalPostgresService } from '../services/database/local-postgres.service';
import { SupabaseService } from '../services/database/supabase.service';
import { logger } from '../utils/logger';

async function recoverMissingDailyData() {
  logger.info('Starting recovery of missing daily data...');
  
  const localDb = new LocalPostgresService();
  const supabase = new SupabaseService();
  
  try {
    // 활성 키워드 가져오기
    const keywords = await supabase.getActiveKeywords(100, 'shopping');
    const keywordIds = keywords.map(k => k.id);
    
    logger.info(`Found ${keywords.length} shopping keywords to process`);
    
    // 복구할 날짜 범위 설정 (12일부터 어제까지)
    const startDate = new Date('2025-07-12');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);
    
    logger.info(`Recovery period: ${startDate.toISOString().split('T')[0]} to ${yesterday.toISOString().split('T')[0]}`);
    
    // 각 날짜별로 처리
    const currentDate = new Date(startDate);
    while (currentDate <= yesterday) {
      const dateStr = currentDate.toISOString().split('T')[0];
      logger.info(`Processing date: ${dateStr}`);
      
      for (const keywordId of keywordIds) {
        try {
          // 해당 날짜의 hourly 데이터 찾기 (KST 22:00-23:59 = UTC 13:00-14:59)
          const searchStart = new Date(currentDate);
          searchStart.setUTCHours(13, 0, 0, 0);
          
          const searchEnd = new Date(currentDate);
          searchEnd.setUTCHours(14, 59, 59, 999);
          
          logger.info(`Searching hourly data for keyword ${keywordId} between ${searchStart.toISOString()} and ${searchEnd.toISOString()}`);
          
          const { data: hourlyData, error: fetchError } = await supabase.client
            .from('shopping_rankings_hourly')
            .select('*')
            .eq('keyword_id', keywordId)
            .gte('hour', searchStart.toISOString())
            .lte('hour', searchEnd.toISOString())
            .order('hour', { ascending: false })
            .order('rank', { ascending: true })
            .limit(100);
            
          if (fetchError) {
            logger.error(`Error fetching hourly data: ${fetchError.message}`);
            continue;
          }
          
          if (!hourlyData || hourlyData.length === 0) {
            logger.warn(`No hourly data found for keyword ${keywordId} on ${dateStr}`);
            continue;
          }
          
          logger.info(`Found ${hourlyData.length} hourly records for keyword ${keywordId} on ${dateStr}`);
          
          // shopping_rankings_daily 테이블에 저장
          const { error } = await supabase.client
            .from('shopping_rankings_daily')
            .upsert(
              hourlyData.map(ranking => ({
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
            logger.error(`Failed to sync daily snapshot for keyword ${keywordId} on ${dateStr}:`, error);
          } else {
            logger.info(`Successfully recovered daily data for keyword ${keywordId} on ${dateStr}`);
          }
          
        } catch (error) {
          logger.error(`Failed to process keyword ${keywordId} on ${dateStr}:`, error);
        }
      }
      
      // 다음 날짜로 이동
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    logger.info('Recovery process completed');
    
    // 복구 후 통계 확인
    const { data: stats, error: statsError } = await supabase.client
      .from('shopping_rankings_daily')
      .select('date', { count: 'exact' })
      .gte('date', '2025-07-12')
      .order('date', { ascending: true });
      
    if (statsError) {
      logger.error('Failed to get recovery stats:', statsError);
    } else {
      logger.info('Recovery statistics:', stats);
    }
    
  } catch (error) {
    logger.error('Recovery process failed:', error);
  } finally {
    await localDb.cleanup();
  }
}

// 스크립트 실행
recoverMissingDailyData()
  .then(() => {
    logger.info('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });