import { Router, Request, Response } from 'express';
import axios from 'axios';
import { query } from '../../db/postgres';

const router = Router();

interface NaverApiResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: Array<{
    title: string;
    link: string;
    image: string;
    lprice: string;
    hprice: string;
    mallName: string;
    productId: string;
    productType: string;
    brand: string;
    maker: string;
    category1: string;
    category2: string;
    category3: string;
    category4: string;
  }>;
}

// GET /api/naver/search - 네이버 쇼핑 API 직접 호출
router.get('/search', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { keyword, display = 20, start = 1, sort = 'sim' } = req.query;
    
    if (!keyword) {
      return res.status(400).json({ 
        success: false, 
        error: 'keyword parameter is required' 
      });
    }

    // 활성화된 네이버 API 키 가져오기
    const [apiKey] = await query<any>(`
      SELECT client_id, client_secret 
      FROM unified_api_keys 
      WHERE provider = 'naver_shopping' 
      AND is_active = true 
      AND (rate_limit_remaining IS NULL OR rate_limit_remaining > 0)
      ORDER BY last_used_at ASC NULLS FIRST
      LIMIT 1
    `);

    if (!apiKey) {
      return res.status(503).json({ 
        success: false, 
        error: 'No available API keys' 
      });
    }

    // 네이버 쇼핑 API 호출
    const response = await axios.get<NaverApiResponse>('https://openapi.naver.com/v1/search/shop.json', {
      params: {
        query: keyword as string,
        display: parseInt(display as string),
        start: parseInt(start as string),
        sort: sort as string
      },
      headers: {
        'X-Naver-Client-Id': apiKey.client_id,
        'X-Naver-Client-Secret': apiKey.client_secret
      }
    });

    // API 키 사용 기록 업데이트
    await query(`
      UPDATE unified_api_keys 
      SET last_used_at = CURRENT_TIMESTAMP,
          request_count = COALESCE(request_count, 0) + 1
      WHERE client_id = $1
    `, [apiKey.client_id]);

    // 응답에 순위 정보 추가
    const itemsWithRank = response.data.items.map((item: any, index: number) => ({
      ...item,
      rank: (parseInt(start as string) - 1) + index + 1,
      page: Math.ceil(((parseInt(start as string) - 1) + index + 1) / 40)
    }));

    return res.json({
      success: true,
      data: {
        ...response.data,
        items: itemsWithRank,
        keyword: keyword as string,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Naver API error:', error.response?.data || error.message);
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        success: false, 
        error: 'API rate limit exceeded' 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch from Naver API',
      details: error.response?.data || error.message
    });
  }
});

// GET /api/naver/search/:keyword/:productId - 특정 상품의 순위 찾기
router.get('/search/:keyword/:productId', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { keyword, productId } = req.params;
    const maxPages = 10; // 최대 10페이지까지 검색 (400개)
    
    // 활성화된 네이버 API 키 가져오기
    const [apiKey] = await query<any>(`
      SELECT client_id, client_secret 
      FROM unified_api_keys 
      WHERE provider = 'naver_shopping' 
      AND is_active = true 
      AND (rate_limit_remaining IS NULL OR rate_limit_remaining > 0)
      ORDER BY last_used_at ASC NULLS FIRST
      LIMIT 1
    `);

    if (!apiKey) {
      return res.status(503).json({ 
        success: false, 
        error: 'No available API keys' 
      });
    }

    // 페이지별로 검색하면서 특정 상품 찾기
    for (let page = 1; page <= maxPages; page++) {
      const start = (page - 1) * 40 + 1;
      
      const response = await axios.get('https://openapi.naver.com/v1/search/shop.json', {
        params: {
          query: keyword,
          display: 40,
          start: start,
          sort: 'sim'
        },
        headers: {
          'X-Naver-Client-Id': apiKey.client_id,
          'X-Naver-Client-Secret': apiKey.client_secret
        }
      });

      // 해당 상품 찾기
      const itemIndex = response.data.items.findIndex((item: any) => item.productId === productId);
      
      if (itemIndex !== -1) {
        const item = response.data.items[itemIndex];
        const rank = start + itemIndex;
        
        // API 키 사용 기록 업데이트
        await query(`
          UPDATE unified_api_keys 
          SET last_used_at = CURRENT_TIMESTAMP,
              request_count = COALESCE(request_count, 0) + $1
          WHERE client_id = $2
        `, [page, apiKey.client_id]);

        return res.json({
          success: true,
          keyword,
          code: productId,
          rank,
          product: {
            name: item.title.replace(/<[^>]*>/g, ''), // HTML 태그 제거
            href: item.link,
            thumbnail: item.image,
            page,
            lprice: parseInt(item.lprice),
            mallName: item.mallName,
            brand: item.brand,
            category1: item.category1
          },
          collected_at: new Date().toISOString(),
          source: 'naver_api_direct'
        });
      }
    }

    // 상품을 찾지 못한 경우
    return res.json({
      success: false,
      keyword,
      code: productId,
      error: `Product not found in top ${maxPages * 40} results`,
      source: 'naver_api_direct'
    });

  } catch (error: any) {
    console.error('Naver API error:', error.response?.data || error.message);
    
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch from Naver API',
      details: error.response?.data || error.message
    });
  }
});

export { router as naverApiRouter };