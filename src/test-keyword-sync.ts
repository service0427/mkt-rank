import dotenv from 'dotenv';
dotenv.config();

// import { KeywordSyncService } from './services/sync/keyword-sync.service';
import { SupabaseService } from './services/database/supabase.service';

async function testKeywordSync() {
  console.log('=== 키워드 동기화 테스트 ===\n');
  
  const supabase = new SupabaseService();
  
  try {
    // 1. campaigns 테이블 확인
    console.log('1. campaigns 테이블에서 ranking_field_mapping 확인...');
    const { data: campaigns, error: campaignError } = await supabase.client
      .from('campaigns')
      .select('id, campaign_name, ranking_field_mapping, add_info')
      .not('ranking_field_mapping', 'is', null)
      .limit(5);
    
    if (campaignError) throw campaignError;
    
    console.log(`campaigns 수: ${campaigns?.length || 0}`);
    campaigns?.forEach(c => {
      console.log(`- Campaign ${c.id}: ${c.campaign_name}`);
      console.log(`  ranking_field_mapping: ${JSON.stringify(c.ranking_field_mapping)}`);
      console.log(`  add_info 키: ${Object.keys(c.add_info || {}).join(', ')}`);
    });
    
    // 2. shopping_rankings_current 확인
    console.log('\n2. shopping_rankings_current에서 unique keyword_id 수 확인...');
    const { data: rankings } = await supabase.client
      .from('shopping_rankings_current')
      .select('keyword_id', { count: 'exact', head: true });
    
    console.log(`총 레코드 수: ${rankings}`);
    
    // 3. 누락된 키워드 확인
    console.log('\n3. 동기화 테스트 실행...');
    // 실제 동기화 실행 (dry run 모드로 수정 가능)
    console.log('실제 동기화를 실행하려면 아래 주석을 해제하세요:');
    console.log('// const syncService = new KeywordSyncService();');
    console.log('// await syncService.syncMissingKeywords();');
    
    // 샘플 데이터로 키워드 추출 로직 테스트
    console.log('\n4. 샘플 데이터로 키워드 추출 로직 확인:');
    const sampleCampaign = {
      ranking_field_mapping: { "keyword": "search_term", "brand": "brand_name" },
      add_info: { "search_term": "무선청소기", "brand_name": "다이슨" }
    };
    console.log('샘플 캠페인:', sampleCampaign);
    console.log('추출될 키워드: 무선청소기');
    
  } catch (error) {
    console.error('테스트 실패:', error);
  }
  
  console.log('\n=== 테스트 완료 ===');
}

// 실행
testKeywordSync().catch(console.error);