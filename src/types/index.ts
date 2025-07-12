// Database types
export interface SearchKeyword {
  id: string;
  user_id: string | null;
  keyword: string;
  pc_count: number;
  mobile_count: number;
  total_count: number;
  pc_ratio: number;
  mobile_ratio: number;
  searched_at: string;
}

export interface ShoppingRanking {
  id?: string;
  keyword_id: string;
  keyword_name: string;
  product_id: string;
  title: string;
  link: string;
  image: string;
  lprice: number;
  hprice?: number;
  mall_name: string;
  product_type: number;
  brand?: string;
  maker?: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
  rank: number;
  collected_at: Date | string;
  created_at?: Date | string;
}

// Alias for compatibility
export type Keyword = SearchKeyword;

export interface ApiUsage {
  id: string;
  provider: string;
  endpoint: string;
  keyword_id: string;
  request_count: number;
  response_time_ms: number;
  success: boolean;
  error_message?: string;
  created_at: string;
}

// Search provider types
export interface SearchResult {
  productId: string;
  title: string;
  link: string;
  image: string;
  lprice: number;
  hprice?: number;
  mallName: string;
  productType: string;
  brand?: string;
  maker?: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
  metadata?: any; // 쿠팡 등 플랫폼별 추가 데이터
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  totalCount: number;
  searchTime?: number;
  metadata?: any;
  error?: ApiError;
}

export interface SearchProvider {
  search(keyword: string, page?: number): Promise<SearchResponse>;
}

// Service types
export interface RankingData {
  keyword: SearchKeyword;
  results: SearchResult[];
  collectedAt: Date;
}

// API Key Management
export interface NaverApiKey {
  clientId: string;
  clientSecret: string;
  usageCount?: number;
  lastUsed?: Date;
}

// Scheduler types
export interface SchedulerOptions {
  cronExpression: string;
  timezone?: string;
}

// Error types
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public provider?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public operation?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}