// Supabase 테이블 타입 정의

export interface Campaign {
  id: number;
  group_id?: string;
  service_type: string;
  campaign_name: string;
  status: string;
  description: string;
  detailed_description?: string;
  logo: string;
  efficiency?: number;
  min_quantity: number;
  unit_price: number;
  additional_logic?: number;
  created_at?: string;
  updated_at?: string;
  deadline?: string;
  mat_id?: string;
  add_info?: Record<string, any>;
  rejected_reason?: string;
  slot_type?: string;
  guarantee_days?: number;
  is_guarantee?: boolean;
  guarantee_count?: number;
  target_rank?: number;
  is_negotiable?: boolean;
  min_guarantee_price?: number;
  max_guarantee_price?: number;
  guarantee_unit?: string;
  refund_settings?: Record<string, any>;
  guarantee_period?: number;
  ranking_field_mapping?: Record<string, string>;
}

export interface SearchKeyword {
  id: string;
  user_id?: string;
  keyword: string;
  pc_count: number;
  mobile_count: number;
  total_count: number;
  pc_ratio: number;
  mobile_ratio: number;
  searched_at?: string;
  is_active?: boolean;
}

export interface ShoppingRankingCurrent {
  keyword_id: string;
  product_id: string;
  rank: number;
  prev_rank?: number;
  title: string;
  lprice: number;
  image?: string;
  mall_name?: string;
  brand?: string;
  category1?: string;
  category2?: string;
  link?: string;
  collected_at: string;
  updated_at?: string;
}