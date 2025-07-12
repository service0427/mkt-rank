import axios, { AxiosInstance, AxiosError } from 'axios';
import { BaseSearchProvider } from './base.provider';
import { SearchResponse, SearchResult, ApiError } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

// 쿠팡 API 응답 타입
interface CoupangProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  isRocket: boolean;
  isRocketFresh?: boolean;
  isRocketGlobal?: boolean;
  vendor: string;
  deliveryInfo: string;
  ratingScore?: number;
  ratingCount?: number;
  discountRate?: number;
  originalPrice?: number;
  categoryName?: string;
  brandName?: string;
  rank?: number;
}

interface CoupangSearchResponse {
  rCode: string;
  rMessage: string;
  rData: {
    totalCount: number;
    products: CoupangProduct[];
  };
}

export class CoupangProvider extends BaseSearchProvider {
  protected providerName = 'Coupang';
  protected apiUrl: string;
  private apiKey: string;
  private axiosInstance: AxiosInstance;

  constructor() {
    super();
    this.apiUrl = config.coupang?.apiUrl || process.env.COUPANG_API_URL || '';
    this.apiKey = config.coupang?.apiKey || process.env.COUPANG_API_KEY || '';
    
    if (!this.apiUrl) {
      throw new Error('Coupang API URL is not configured');
    }

    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
  }

  /**
   * Search products on Coupang
   */
  async search(keyword: string, page: number = 1): Promise<SearchResponse> {
    const startTime = Date.now();
    const itemsPerPage = 100; // 쿠팡은 최대 100개까지 가능

    try {
      logger.info(`[${this.providerName}] Searching for keyword: ${keyword}, page: ${page}`);

      const response = await this.axiosInstance.post<CoupangSearchResponse>('/search', {
        keyword: keyword,
        limit: itemsPerPage,
        page: page,
        sorter: 'scoreDesc' // 쿠팡 랭킹순
      });

      const searchTime = Date.now() - startTime;

      // API 응답 검증
      if (response.data.rCode !== '0000') {
        throw new Error(`Coupang API Error: ${response.data.rMessage}`);
      }

      const { totalCount, products } = response.data.rData;

      // 쿠팡 응답을 표준 포맷으로 변환
      const results: SearchResult[] = products.map((product, index) => ({
        productId: product.productId,
        title: this.cleanTitle(product.productName),
        link: product.productUrl,
        image: product.productImage,
        lprice: product.productPrice,
        hprice: product.originalPrice || product.productPrice,
        mallName: product.vendor,
        productType: product.isRocket ? '3' : '1', // 3: 로켓배송, 1: 일반
        brand: product.brandName || '',
        maker: '', // 쿠팡은 제조사 정보 없음
        category1: product.categoryName || '',
        category2: '',
        category3: '',
        category4: '',
        // 쿠팡 특화 필드를 metadata에 저장
        metadata: {
          isRocket: product.isRocket,
          isRocketFresh: product.isRocketFresh,
          isRocketGlobal: product.isRocketGlobal,
          deliveryInfo: product.deliveryInfo,
          ratingScore: product.ratingScore,
          ratingCount: product.ratingCount,
          discountRate: product.discountRate,
          rank: (page - 1) * itemsPerPage + index + 1
        }
      }));

      logger.info(
        `[${this.providerName}] Search completed in ${searchTime}ms. Found ${results.length} results.`
      );

      return {
        success: true,
        totalCount,
        results,
        searchTime,
        metadata: {
          provider: this.providerName,
          page,
          itemsPerPage,
        },
      };
    } catch (error) {
      return this.handleSearchError(error as Error, keyword);
    }
  }

  /**
   * Handle search errors with Coupang-specific error codes
   */
  protected handleSearchError(error: Error, keyword: string): SearchResponse {
    const searchTime = Date.now();
    let errorMessage = error.message;
    let errorCode: string | undefined;

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      if (axiosError.response) {
        errorCode = axiosError.response.status.toString();
        
        switch (axiosError.response.status) {
          case 401:
            errorMessage = 'Coupang API 인증 실패';
            break;
          case 403:
            errorMessage = 'Coupang API 접근 권한 없음';
            break;
          case 429:
            errorMessage = 'Coupang API 요청 한도 초과';
            break;
          case 500:
          case 502:
          case 503:
            errorMessage = 'Coupang 서버 오류';
            break;
          default:
            errorMessage = `Coupang API 오류: ${axiosError.response.status}`;
        }
      } else if (axiosError.code === 'ECONNABORTED') {
        errorMessage = 'Coupang API 요청 시간 초과';
        errorCode = 'TIMEOUT';
      } else if (axiosError.code === 'ENOTFOUND') {
        errorMessage = 'Coupang API 서버를 찾을 수 없음';
        errorCode = 'NETWORK_ERROR';
      }
    }

    logger.error(`[${this.providerName}] Search failed for keyword: ${keyword}`, {
      error: errorMessage,
      code: errorCode,
      keyword,
    });

    return {
      success: false,
      totalCount: 0,
      results: [],
      searchTime,
      error: new ApiError(errorMessage, errorCode ? parseInt(errorCode) : undefined, this.providerName),
    };
  }

  /**
   * 제목 정리 (HTML 태그 제거 등)
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/<[^>]*>/g, '') // HTML 태그 제거
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /**
   * 쿠팡 특화 메서드 - 로켓배송 상품만 검색
   */
  async searchRocketDelivery(keyword: string, page: number = 1): Promise<SearchResponse> {
    const response = await this.search(keyword, page);
    
    if (response.success) {
      // 로켓배송 상품만 필터링
      response.results = response.results.filter(
        result => result.metadata?.isRocket === true
      );
      response.totalCount = response.results.length;
    }
    
    return response;
  }

  /**
   * 쿠팡 특화 메서드 - 카테고리별 검색
   */
  async searchByCategory(keyword: string, categoryId: string, page: number = 1): Promise<SearchResponse> {
    try {
      const response = await this.axiosInstance.post<CoupangSearchResponse>('/search', {
        keyword: keyword,
        categoryId: categoryId,
        limit: 100,
        page: page,
        sorter: 'scoreDesc'
      });

      // 나머지는 일반 search와 동일하게 처리
      return this.transformResponse(response.data, keyword, page);
    } catch (error) {
      return this.handleSearchError(error as Error, keyword);
    }
  }

  /**
   * 응답 변환 헬퍼 메서드
   */
  private transformResponse(
    data: CoupangSearchResponse, 
    _keyword: string, 
    page: number
  ): SearchResponse {
    if (data.rCode !== '0000') {
      throw new Error(`Coupang API Error: ${data.rMessage}`);
    }

    const { totalCount, products } = data.rData;
    const itemsPerPage = 100;

    const results: SearchResult[] = products.map((product, index) => ({
      productId: product.productId,
      title: this.cleanTitle(product.productName),
      link: product.productUrl,
      image: product.productImage,
      lprice: product.productPrice,
      hprice: product.originalPrice || product.productPrice,
      mallName: product.vendor,
      productType: product.isRocket ? '3' : '1',
      brand: product.brandName || '',
      maker: '',
      category1: product.categoryName || '',
      category2: '',
      category3: '',
      category4: '',
      metadata: {
        isRocket: product.isRocket,
        isRocketFresh: product.isRocketFresh,
        isRocketGlobal: product.isRocketGlobal,
        deliveryInfo: product.deliveryInfo,
        ratingScore: product.ratingScore,
        ratingCount: product.ratingCount,
        discountRate: product.discountRate,
        rank: (page - 1) * itemsPerPage + index + 1
      }
    }));

    return {
      success: true,
      totalCount,
      results,
      searchTime: 0,
      metadata: {
        provider: this.providerName,
        page,
        itemsPerPage,
      },
    };
  }
}