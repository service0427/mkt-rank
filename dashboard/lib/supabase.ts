import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Type definitions
export interface SearchKeyword {
  id: string
  user_id: string | null
  keyword: string
  pc_count: number
  mobile_count: number
  total_count: number
  pc_ratio: number
  mobile_ratio: number
  is_active: boolean
  last_collected_at: string | null
  searched_at: string
  created_at: string
  updated_at: string
}

export interface ShoppingRankingLatest {
  keyword_id: string
  product_id: string
  rank: number
  title: string
  link: string
  image: string
  lprice: number
  mall_name: string
  brand?: string
  category1: string
  category2: string
  collected_at: string
  created_at: string
}

export interface KeywordStatistics {
  keyword_id: string
  total_products: number
  unique_products_24h: number
  unique_products_7d: number
  avg_price: number
  min_price: number
  max_price: number
  last_collected_at: string
  updated_at: string
}