import dotenv from 'dotenv';
dotenv.config();

import { KeywordService } from './services/keyword/keyword.service';

async function testKeywordCheckFlow() {
  const keywordService = new KeywordService();
  
  console.log('=== 키워드 체크 플로우 테스트 ===\n');
  
  // 테스트할 키워드
  const testKeyword = '전기자전거';
  
  console.log(`1. 키워드 "${testKeyword}" 존재 여부 확인...`);
  const existing = await keywordService.getKeywordByName(testKeyword);
  
  if (existing) {
    console.log(`✅ 이미 등록된 키워드입니다.`);
    console.log(`  ID: ${existing.id}`);
    console.log(`  등록일: ${existing.created_at}`);
    console.log(`  활성화: ${existing.is_active}`);
  } else {
    console.log(`❌ 등록되지 않은 키워드입니다.\n`);
    
    console.log(`2. 새 키워드 생성 시뮬레이션...`);
    console.log(`   네이버 API로 검색량 조회 중...`);
    
    // 실제로 DB에 저장하지 않고 시뮬레이션만
    try {
      // NaverKeywordApiService를 직접 사용해서 테스트
      const { NaverKeywordApiService } = await import('./services/keyword/naver-keyword-api.service');
      const naverApi = new NaverKeywordApiService();
      const searchVolume = await naverApi.analyzeKeyword(testKeyword);
      
      if (searchVolume) {
        console.log(`\n✅ 검색량 조회 성공!`);
        console.log(`  PC 검색량: ${searchVolume.pc.toLocaleString()}`);
        console.log(`  모바일 검색량: ${searchVolume.mobile.toLocaleString()}`);
        console.log(`  총 검색량: ${searchVolume.total.toLocaleString()}`);
        console.log(`  PC 비율: ${searchVolume.pcRatio}%`);
        console.log(`  모바일 비율: ${searchVolume.mobileRatio}%`);
        
        console.log(`\n3. DB에 저장될 데이터 (시뮬레이션):`);
        const dbData = {
          keyword: testKeyword,
          is_active: true,
          pc_count: searchVolume.pc,
          mobile_count: searchVolume.mobile,
          total_count: searchVolume.total,
          pc_ratio: searchVolume.pcRatio,
          mobile_ratio: searchVolume.mobileRatio,
          user_id: null
        };
        console.log(JSON.stringify(dbData, null, 2));
        
        console.log(`\n4. 저장 후 순위 수집이 시작됩니다.`);
        console.log(`   - 네이버 쇼핑 API 호출`);
        console.log(`   - 상위 100개 상품 순위 수집`);
        console.log(`   - shopping_rankings 테이블에 저장`);
        console.log(`   - shopping_rankings_current 테이블 업데이트`);
      }
    } catch (error) {
      console.error('오류 발생:', error);
    }
  }
  
  console.log('\n=== 다중 키워드 체크 테스트 ===\n');
  
  const multipleKeywords = ['노트북', '키보드', '마우스'];
  console.log(`테스트 키워드들: ${multipleKeywords.join(', ')}`);
  
  for (const kw of multipleKeywords) {
    const exists = await keywordService.getKeywordByName(kw);
    console.log(`- ${kw}: ${exists ? '✅ 이미 등록됨' : '❌ 미등록 (새로 추가 가능)'}`);
  }
  
  console.log('\n=== 테스트 완료 ===');
  console.log('실제 API 호출 시에는 위 과정이 자동으로 실행됩니다.');
}

// 실행
testKeywordCheckFlow().catch(console.error);