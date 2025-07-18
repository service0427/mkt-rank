import axios, { AxiosInstance, AxiosError } from 'axios';
import { BaseSearchProvider } from './base.provider';
import { SearchResponse, SearchResult, ApiError } from '../types';
import { config } from '../config';
import { DbApiKeyManager } from './db-api-key-manager';
import { logger } from '../utils/logger';

interface NaverSearchItem {
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
}

interface NaverSearchResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverSearchItem[];
}

export class NaverShoppingProvider extends BaseSearchProvider {
  protected providerName = 'NaverShopping';
  protected apiUrl = config.naver.apiUrl;
  private apiKeyManager: DbApiKeyManager;

  constructor(apiKeyManager: DbApiKeyManager) {
    super();
    this.apiKeyManager = apiKeyManager;
  }

  private createAxiosInstance(): AxiosInstance {
    const apiKey = this.apiKeyManager.getCurrentKey();
    return axios.create({
      baseURL: this.apiUrl,
      headers: {
        'X-Naver-Client-Id': apiKey.clientId,
        'X-Naver-Client-Secret': apiKey.clientSecret,
      },
      timeout: 30000,
    });
  }

  async search(keyword: string, page: number = 1): Promise<SearchResponse> {
    this.validateParameters(keyword, page);
    this.logRequest(keyword, page);

    let retryCount = 0;
    const maxRetries = Math.min(3, config.naver.apiKeys.length);

    while (retryCount < maxRetries) {
      try {
        await this.apiKeyManager.getNextKey();
        const axiosInstance = this.createAxiosInstance();
        
        const display = config.search.itemsPerPage;
        const start = (page - 1) * display + 1;

        const response = await axiosInstance.get<NaverSearchResponse>('', {
          params: {
            query: keyword,
            display,
            start,
            sort: 'sim',
          },
        });

        const { items, total } = response.data;
        const results = this.transformResults(items);

        this.logResponse(keyword, results.length, total);

        return {
          success: true,
          results,
          totalCount: total,
        };
      } catch (error) {
        if (this.isRateLimitError(error)) {
          const currentKey = this.apiKeyManager.getCurrentKey();
          await this.apiKeyManager.markKeyAsLimited(currentKey);
          retryCount++;
          
          if (retryCount < maxRetries) {
            logger.warn(`Rate limit hit, switching to next API key (retry ${retryCount}/${maxRetries})`);
            await this.sleep(1000); // Wait 1 second before retry
            continue;
          }
        }
        
        this.handleError(error, keyword);
      }
    }

    throw new ApiError('All API keys exhausted', 429, this.providerName);
  }

  private isRateLimitError(error: any): boolean {
    if (error instanceof AxiosError) {
      return error.response?.status === 429 || 
             (error.response?.status === 400 && 
              error.response?.data?.errorCode === 'SE01');
    }
    return false;
  }

  private transformResults(items: NaverSearchItem[]): SearchResult[] {
    return items.map((item) => ({
      productId: item.productId,
      title: this.cleanHtml(item.title),
      link: item.link,
      image: item.image,
      lprice: parseInt(item.lprice, 10),
      hprice: item.hprice ? parseInt(item.hprice, 10) : undefined,
      mallName: item.mallName,
      productType: item.productType,
      brand: item.brand,
      maker: item.maker,
      category1: item.category1,
      category2: item.category2,
      category3: item.category3,
      category4: item.category4,
    }));
  }

  private cleanHtml(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
}