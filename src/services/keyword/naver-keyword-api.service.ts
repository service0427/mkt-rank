import axios from 'axios';
import { logger } from '../../utils/logger';

interface KeywordData {
  relKeyword: string;
  monthlyPcQcCnt: string | number;
  monthlyMobileQcCnt: string | number;
}

interface KeywordAnalysisResult {
  keyword: string;
  pc: number;
  mobile: number;
  total: number;
  pcRatio: number;
  mobileRatio: number;
}

export class NaverKeywordApiService {
  private apiKey: string;
  private secretKey: string;
  private customerId: string;
  private apiUrl: string;

  constructor() {
    // 환경변수에서 가져오거나 기본값 사용
    this.apiKey = process.env.NAVER_API_KEY || '0100000000db57c189722558fdb78bcd217cc1264ec3a6996a052fbe8acdc340355ba7184e';
    this.secretKey = process.env.NAVER_SECRET_KEY || 'AQAAAADbV8GJciVY/beLzSF8wSZOujhTQPaIWfyg+62v+W/MqA==';
    this.customerId = process.env.NAVER_CUSTOMER_ID || '1417905';
    this.apiUrl = 'https://api.naver.com/keywordstool';
  }

  async analyzeKeyword(keyword: string): Promise<KeywordAnalysisResult | null> {
    try {
      const trimmedKeyword = keyword.trim().replace(/\s/g, '');
      
      const timestamp = String(Date.now());
      const signature = this.generateSignature(timestamp, 'GET', '/keywordstool');
      
      const response = await axios.get(this.apiUrl, {
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': this.apiKey,
          'X-Customer': this.customerId,
          'X-Signature': signature
        },
        params: {
          hintKeywords: trimmedKeyword,
          showDetail: '1'
        }
      });

      if (response.data?.keywordList?.length > 0) {
        // 정확히 일치하는 키워드 찾기
        const exactMatch = response.data.keywordList.find(
          (k: KeywordData) => k.relKeyword === trimmedKeyword
        );
        
        if (exactMatch) {
          const pc = exactMatch.monthlyPcQcCnt === '< 10' ? 1 : Number(exactMatch.monthlyPcQcCnt);
          const mobile = exactMatch.monthlyMobileQcCnt === '< 10' ? 1 : Number(exactMatch.monthlyMobileQcCnt);
          const total = pc + mobile;
          
          return {
            keyword: exactMatch.relKeyword,
            pc,
            mobile,
            total,
            pcRatio: total > 0 ? Math.round((pc / total) * 10000) / 100 : 0,
            mobileRatio: total > 0 ? Math.round((mobile / total) * 10000) / 100 : 0
          };
        }
      }
      
      // 정확한 매치가 없으면 기본값 반환
      return {
        keyword: trimmedKeyword,
        pc: 0,
        mobile: 0,
        total: 0,
        pcRatio: 0,
        mobileRatio: 0
      };
    } catch (error) {
      logger.error(`Failed to analyze keyword ${keyword}:`, error);
      // API 오류시에도 기본값으로 생성 가능하도록
      return {
        keyword: keyword,
        pc: 0,
        mobile: 0,
        total: 0,
        pcRatio: 0,
        mobileRatio: 0
      };
    }
  }

  private generateSignature(timestamp: string, method: string, path: string): string {
    // 네이버 API 시그니처 생성 로직
    // 실제 구현은 네이버 API 문서에 따라 해야 함
    const crypto = require('crypto');
    const message = `${timestamp}.${method}.${path}`;
    return crypto.createHmac('sha256', this.secretKey)
      .update(message)
      .digest('base64');
  }
}