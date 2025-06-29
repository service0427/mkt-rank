import dotenv from 'dotenv';
dotenv.config();

import { NaverKeywordApiService } from './services/keyword/naver-keyword-api.service';

async function testNaverKeywordApi() {
  const naverApi = new NaverKeywordApiService();
  
  console.log('=== 네이버 키워드 API 테스트 시작 ===\n');
  
  // 테스트할 키워드들
  const testKeywords = [
    '아이폰15',
    '갤럭시S24',
    '맥북프로',
    '에어팟',
    '테스트키워드없는거'
  ];
  
  for (const keyword of testKeywords) {
    console.log(`\n키워드 분석 중: "${keyword}"`);
    console.log('-'.repeat(50));
    
    try {
      const result = await naverApi.analyzeKeyword(keyword);
      
      if (result) {
        console.log('✅ 분석 성공!');
        console.log(`  키워드: ${result.keyword}`);
        console.log(`  PC 검색량: ${result.pc.toLocaleString()}`);
        console.log(`  모바일 검색량: ${result.mobile.toLocaleString()}`);
        console.log(`  총 검색량: ${result.total.toLocaleString()}`);
        console.log(`  PC 비율: ${result.pcRatio}%`);
        console.log(`  모바일 비율: ${result.mobileRatio}%`);
        
        // DB에 저장될 데이터 미리보기
        console.log('\n  📊 DB에 저장될 데이터:');
        console.log(`  {`);
        console.log(`    keyword: "${keyword}",`);
        console.log(`    is_active: true,`);
        console.log(`    pc_count: ${result.pc},`);
        console.log(`    mobile_count: ${result.mobile},`);
        console.log(`    total_count: ${result.total},`);
        console.log(`    pc_ratio: ${result.pcRatio},`);
        console.log(`    mobile_ratio: ${result.mobileRatio},`);
        console.log(`    user_id: null`);
        console.log(`  }`);
      } else {
        console.log('❌ 분석 실패: 결과가 없습니다.');
      }
    } catch (error) {
      console.log('❌ 오류 발생:', error);
    }
    
    // API 호출 간격
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n=== 테스트 완료 ===');
}

// 실행
testNaverKeywordApi().catch(console.error);