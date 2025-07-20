import axios, { AxiosInstance } from 'axios';

// 쿠팡 API 응답 타입
interface CoupangProduct {
  id: string;
  name: string;
  href: string;
  thumbnail: string;
  rank: string;
  realRank: number;
  page: number;
}

interface CoupangSearchResponse {
  success: boolean;
  requestId: number;
  data: {
    keyword: string;
    count: number;
    products: CoupangProduct[];
    relatedKeywords?: string[];
    totalPages: number;
    searchUrl: string;
    blocked?: boolean;
    message?: string;
    error?: string;
    failedRequests?: any[];
    timestamp: string;
  };
  agentId: string;
  duration: number;
}

export class CoupangProvider {
  private apiUrl: string;
  private apiKey: string;
  private axiosInstance: AxiosInstance;

  constructor() {
    // Get Coupang API configuration from environment
    this.apiUrl = process.env.COUPANG_API_URL || '';
    this.apiKey = process.env.COUPANG_API_KEY || '';
    
    if (!this.apiUrl) {
      throw new Error('COUPANG_API_URL is not configured');
    }

    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      timeout: 60000, // 60 seconds
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      }
    });
  }

  async getRankings(keyword: string, maxPages: number = 3) {
    const rankings = [];
    const itemsPerPage = 72; // Coupang API limit

    for (let page = 1; page <= maxPages; page++) {
      try {
        console.log(`[Coupang] Fetching page ${page} for keyword: ${keyword}`);
        
        const response = await this.axiosInstance.post<CoupangSearchResponse>('', {
          keyword: keyword,
          page: page,
          limit: itemsPerPage
        });

        // Check if request was successful
        if (!response.data.success) {
          console.error(`Coupang API request failed for ${keyword}`);
          break;
        }

        // Check for network blocking
        if (response.data.data.blocked === true) {
          console.warn(`Coupang network blocked for keyword: ${keyword}`);
          break;
        }

        const { products } = response.data.data;

        // Process products and add to rankings
        for (const product of products) {
          rankings.push({
            keyword,
            rank: product.realRank,
            platform: 'coupang',
            metadata: {
              productId: product.id,
              title: this.cleanTitle(product.name),
              href: product.href,
              thumbnail: product.thumbnail,
              page: product.page
            }
          });
        }

        // If we got less than full page, no more results
        if (products.length < itemsPerPage) {
          break;
        }

        // Add delay between requests
        await this.delay(1000);
      } catch (error) {
        console.error(`Error fetching Coupang page ${page} for ${keyword}:`, error);
        if (axios.isAxiosError(error)) {
          console.error('Response:', error.response?.data);
        }
        break;
      }
    }

    return rankings;
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}