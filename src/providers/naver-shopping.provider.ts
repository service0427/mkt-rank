import axios, { AxiosInstance } from 'axios';
import { BaseSearchProvider } from './base.provider';
import { SearchResponse, SearchResult } from '../types';
import { config } from '../config';

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
  private axiosInstance: AxiosInstance;

  constructor() {
    super();
    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'X-Naver-Client-Id': config.naver.clientId,
        'X-Naver-Client-Secret': config.naver.clientSecret,
      },
      timeout: 30000, // 30 seconds timeout
    });
  }

  async search(keyword: string, page: number = 1): Promise<SearchResponse> {
    this.validateParameters(keyword, page);
    this.logRequest(keyword, page);

    try {
      const display = config.search.itemsPerPage;
      const start = (page - 1) * display + 1;

      const response = await this.axiosInstance.get<NaverSearchResponse>('', {
        params: {
          query: keyword,
          display,
          start,
          sort: 'sim', // Sort by relevance
        },
      });

      const { items, total } = response.data;
      const results = this.transformResults(items);

      this.logResponse(keyword, results.length, total);

      return {
        results,
        totalCount: total,
      };
    } catch (error) {
      this.handleError(error, keyword);
    }
  }

  private transformResults(items: NaverSearchItem[]): SearchResult[] {
    return items.map((item) => ({
      productId: item.productId,
      title: this.cleanHtml(item.title),
      link: item.link,
      image: item.image,
      price: parseInt(item.lprice, 10),
      mallName: item.mallName,
      category1: item.category1,
      category2: item.category2,
      category3: item.category3,
      category4: item.category4,
    }));
  }

  private cleanHtml(text: string): string {
    // Remove HTML tags and decode HTML entities
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}