import dotenv from 'dotenv';
dotenv.config();

import { SupabaseService } from './services/database/supabase.service';
import { logger } from './utils/logger';

async function cleanupCurrentRankings() {
  const supabase = new SupabaseService();
  
  try {
    logger.info('Starting cleanup of shopping_rankings_current table...');
    
    // 1. 현재 데이터 분석
    const { data: analysis, error: analysisError } = await supabase.client
      .from('shopping_rankings_current')
      .select('keyword_id, collected_at')
      .order('collected_at', { ascending: false });
      
    if (analysisError) {
      logger.error('Failed to analyze current data:', analysisError);
      return;
    }
    
    // 키워드별로 가장 최신 collected_at 찾기
    const latestByKeyword = new Map<string, string>();
    analysis.forEach(row => {
      const current = latestByKeyword.get(row.keyword_id);
      if (!current || new Date(row.collected_at) > new Date(current)) {
        latestByKeyword.set(row.keyword_id, row.collected_at);
      }
    });
    
    logger.info(`Found ${latestByKeyword.size} keywords with data`);
    
    // 2. 각 키워드별로 최신 데이터만 유지
    for (const [keywordId, latestTime] of latestByKeyword) {
      // 최신 시간이 아닌 데이터 삭제
      const { error: deleteError } = await supabase.client
        .from('shopping_rankings_current')
        .delete()
        .eq('keyword_id', keywordId)
        .neq('collected_at', latestTime);
        
      if (deleteError) {
        logger.error(`Failed to cleanup keyword ${keywordId}:`, deleteError);
      } else {
        logger.info(`Cleaned up old data for keyword ${keywordId}, keeping only ${latestTime}`);
      }
    }
    
    // 3. 결과 확인
    const { count, error: countError } = await supabase.client
      .from('shopping_rankings_current')
      .select('*', { count: 'exact', head: true });
      
    if (!countError) {
      logger.info(`Cleanup completed. Total records remaining: ${count}`);
    }
    
    // 4. 중복 확인은 별도 쿼리로 처리
    logger.info('Cleanup process completed');
    
  } catch (error) {
    logger.error('Cleanup failed:', error);
  }
}

cleanupCurrentRankings();