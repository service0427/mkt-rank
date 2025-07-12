import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { SlotKeywordService } from './slot-keyword.service';
import { NaverKeywordApiService } from './naver-keyword-api.service';

export interface Keyword {
  id: string;
  keyword: string;
  is_active: boolean;
  priority?: number;
  created_at: string;
  updated_at: string;
  // Slot 키워드 추가 필드
  source?: 'db' | 'slot';
  slot_id?: string;
  field_name?: string;
}

export class KeywordService {
  private slotKeywordService: SlotKeywordService;
  private naverKeywordApiService: NaverKeywordApiService;

  constructor() {
    this.slotKeywordService = new SlotKeywordService();
    this.naverKeywordApiService = new NaverKeywordApiService();
  }

  async getActiveKeywords(type: string = 'shopping'): Promise<Keyword[]> {
    try {
      const { data, error } = await supabase
        .from('search_keywords')
        .select('*')
        .eq('is_active', true)
        .eq('type', type);

      if (error) {
        throw error;
      }

      const dbKeywords = data || [];

      // Slot keywords 병합 (설정이 활성화된 경우)
      const mergedKeywords = await this.slotKeywordService.getMergedKeywords(dbKeywords);
      
      return mergedKeywords;
    } catch (error) {
      logger.error(`Failed to fetch active keywords for type ${type}:`, error);
      throw error;
    }
  }

  async getKeywordByName(keyword: string): Promise<Keyword | null> {
    try {
      const { data, error } = await supabase
        .from('search_keywords')
        .select('*')
        .eq('keyword', keyword)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Failed to fetch keyword ${keyword}:`, error);
      throw error;
    }
  }

  async getKeywordByNameAndType(keyword: string, type: string): Promise<Keyword | null> {
    try {
      const { data, error } = await supabase
        .from('search_keywords')
        .select('*')
        .eq('keyword', keyword)
        .eq('type', type)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Failed to fetch keyword ${keyword} with type ${type}:`, error);
      throw error;
    }
  }

  async getKeywordById(id: string): Promise<Keyword | null> {
    try {
      const { data, error } = await supabase
        .from('search_keywords')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Failed to fetch keyword by id ${id}:`, error);
      throw error;
    }
  }

  async createKeyword(keyword: string, type: string = 'shopping'): Promise<Keyword> {
    try {
      // 네이버 API로 검색량 가져오기
      const searchVolume = await this.naverKeywordApiService.analyzeKeyword(keyword);
      
      const { data, error } = await supabase
        .from('search_keywords')
        .insert({ 
          keyword, 
          type,
          is_active: true,
          pc_count: searchVolume?.pc || 0,
          mobile_count: searchVolume?.mobile || 0,
          total_count: searchVolume?.total || 0,
          pc_ratio: searchVolume?.pcRatio || 0,
          mobile_ratio: searchVolume?.mobileRatio || 0,
          user_id: null
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info(`Created new keyword: ${keyword}`);
      return data;
    } catch (error) {
      logger.error(`Failed to create keyword ${keyword}:`, error);
      throw error;
    }
  }

  async updateKeywordPriority(id: string, priority: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('search_keywords')
        .update({ priority, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        throw error;
      }

      logger.info(`Updated priority for keyword ${id} to ${priority}`);
    } catch (error) {
      logger.error(`Failed to update keyword priority:`, error);
      throw error;
    }
  }

  async toggleKeywordActive(id: string, isActive: boolean): Promise<void> {
    try {
      const { error } = await supabase
        .from('search_keywords')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        throw error;
      }

      logger.info(`Toggled keyword ${id} active status to ${isActive}`);
    } catch (error) {
      logger.error(`Failed to toggle keyword active status:`, error);
      throw error;
    }
  }
}