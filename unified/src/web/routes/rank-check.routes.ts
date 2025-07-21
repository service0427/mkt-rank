import { Router, Request, Response } from 'express';
import { query } from '../../db/postgres';

const router = Router();

interface RankCheckRequest {
  keyword: string;
  code: string;  // MID (product_id)
}

interface RankCheckResponse {
  success: boolean;
  keyword?: string;
  code?: string;
  rank?: number;
  product?: {
    name: string;
    href: string;
    thumbnail: string;
    page: number;
  };
  collected_at?: string;
  error?: string;
}

// 키워드 + MID로 순위 조회
router.get('/api/rank/check', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { keyword, code } = req.query as { keyword?: string; code?: string };

    if (!keyword || !code) {
      return res.status(400).json({
        success: false,
        error: '키워드와 코드(MID)는 필수 파라미터입니다.'
      } as RankCheckResponse);
    }

    // unified_rankings_current에서 조회
    const [ranking] = await query<any>(`
      SELECT 
        urc.rank,
        urc.title,
        urc.link,
        urc.image,
        urc.collected_at,
        usk.keyword
      FROM unified_rankings_current urc
      JOIN unified_search_keywords usk ON urc.keyword_id = usk.id
      WHERE usk.keyword = $1 
      AND urc.product_id = $2
      AND urc.platform = 'naver_shopping'
      ORDER BY urc.collected_at DESC
      LIMIT 1
    `, [keyword, code]);

    if (!ranking) {
      // current에 없으면 detail에서 최신 데이터 조회
      const [detailRanking] = await query<any>(`
        SELECT 
          rank,
          title,
          link,
          image,
          collected_at
        FROM unified_rankings_detail
        WHERE keyword = $1 
        AND product_id = $2
        AND platform = 'naver_shopping'
        AND collected_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        ORDER BY collected_at DESC
        LIMIT 1
      `, [keyword, code]);

      if (!detailRanking) {
        return res.json({
          success: false,
          error: '해당 키워드와 상품에 대한 순위 정보를 찾을 수 없습니다.'
        } as RankCheckResponse);
      }

      // detail 테이블 데이터 사용
      const response: RankCheckResponse = {
        success: true,
        keyword,
        code,
        rank: detailRanking.rank,
        product: {
          name: detailRanking.title,
          href: detailRanking.link,
          thumbnail: detailRanking.image,
          page: Math.ceil(detailRanking.rank / 40) // 네이버 쇼핑은 페이지당 40개
        },
        collected_at: detailRanking.collected_at
      };

      return res.json(response);
    }

    // current 테이블 데이터 사용
    const response: RankCheckResponse = {
      success: true,
      keyword: ranking.keyword,
      code,
      rank: ranking.rank,
      product: {
        name: ranking.title,
        href: ranking.link,
        thumbnail: ranking.image,
        page: Math.ceil(ranking.rank / 40) // 네이버 쇼핑은 페이지당 40개
      },
      collected_at: ranking.collected_at
    };

    return res.json(response);
  } catch (error) {
    console.error('Rank check error:', error);
    return res.status(500).json({
      success: false,
      error: '순위 조회 중 오류가 발생했습니다.'
    } as RankCheckResponse);
  }
});

// POST 방식도 지원
router.post('/api/rank/check', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { keyword, code } = req.body as RankCheckRequest;

    if (!keyword || !code) {
      return res.status(400).json({
        success: false,
        error: '키워드와 코드(MID)는 필수 파라미터입니다.'
      } as RankCheckResponse);
    }

    // unified_rankings_current에서 조회
    const [ranking] = await query<any>(`
      SELECT 
        urc.rank,
        urc.title,
        urc.link,
        urc.image,
        urc.collected_at,
        usk.keyword
      FROM unified_rankings_current urc
      JOIN unified_search_keywords usk ON urc.keyword_id = usk.id
      WHERE usk.keyword = $1 
      AND urc.product_id = $2
      AND urc.platform = 'naver_shopping'
      ORDER BY urc.collected_at DESC
      LIMIT 1
    `, [keyword, code]);

    if (!ranking) {
      // current에 없으면 detail에서 최신 데이터 조회
      const [detailRanking] = await query<any>(`
        SELECT 
          rank,
          title,
          link,
          image,
          collected_at
        FROM unified_rankings_detail
        WHERE keyword = $1 
        AND product_id = $2
        AND platform = 'naver_shopping'
        AND collected_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        ORDER BY collected_at DESC
        LIMIT 1
      `, [keyword, code]);

      if (!detailRanking) {
        return res.json({
          success: false,
          error: '해당 키워드와 상품에 대한 순위 정보를 찾을 수 없습니다.'
        } as RankCheckResponse);
      }

      // detail 테이블 데이터 사용
      const response: RankCheckResponse = {
        success: true,
        keyword,
        code,
        rank: detailRanking.rank,
        product: {
          name: detailRanking.title,
          href: detailRanking.link,
          thumbnail: detailRanking.image,
          page: Math.ceil(detailRanking.rank / 40)
        },
        collected_at: detailRanking.collected_at
      };

      return res.json(response);
    }

    // current 테이블 데이터 사용
    const response: RankCheckResponse = {
      success: true,
      keyword: ranking.keyword,
      code,
      rank: ranking.rank,
      product: {
        name: ranking.title,
        href: ranking.link,
        thumbnail: ranking.image,
        page: Math.ceil(ranking.rank / 40)
      },
      collected_at: ranking.collected_at
    };

    return res.json(response);
  } catch (error) {
    console.error('Rank check error:', error);
    return res.status(500).json({
      success: false,
      error: '순위 조회 중 오류가 발생했습니다.'
    } as RankCheckResponse);
  }
});

export { router as rankCheckRouter };