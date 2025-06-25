import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

export interface SlotKeyword {
  keyword: string;
  source: 'slot';
  slotId: string;
  fieldName: string;
}

export class SlotKeywordService {
  private enabled: boolean;
  private fieldNames: string[];

  constructor() {
    this.enabled = process.env.ENABLE_SLOT_KEYWORDS === 'true';
    this.fieldNames = process.env.SLOT_KEYWORD_FIELDS?.split(',').map(f => f.trim()) || [];
    
    logger.info('SlotKeywordService initialized', {
      enabled: this.enabled,
      fieldNames: this.fieldNames
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async getSlotKeywords(): Promise<SlotKeyword[]> {
    if (!this.enabled) {
      logger.debug('Slot keywords disabled');
      return [];
    }

    if (this.fieldNames.length === 0) {
      logger.warn('No slot keyword fields configured');
      return [];
    }

    try {
      // slots 테이블에서 활성화된 슬롯의 input_data 가져오기
      const { data: slots, error } = await supabase
        .from('slots')
        .select('id, input_data')
        .eq('is_active', true);

      if (error) {
        // 테이블이 존재하지 않는 경우 등의 에러 처리
        logger.warn('Failed to query slots table:', error);
        return [];
      }

      if (!slots || slots.length === 0) {
        logger.info('No active slots found');
        return [];
      }

      const keywords: SlotKeyword[] = [];
      const keywordSet = new Set<string>(); // 중복 제거용

      // 각 슬롯의 input_data에서 키워드 추출
      for (const slot of slots) {
        if (!slot.input_data || typeof slot.input_data !== 'object') {
          continue;
        }

        // 설정된 필드명들에서 값 추출
        for (const fieldName of this.fieldNames) {
          const value = this.getNestedValue(slot.input_data, fieldName);
          
          if (value && typeof value === 'string' && value.trim()) {
            const keyword = value.trim();
            
            // 중복 체크
            if (!keywordSet.has(keyword)) {
              keywordSet.add(keyword);
              keywords.push({
                keyword,
                source: 'slot',
                slotId: slot.id,
                fieldName
              });
            }
          }
        }
      }

      logger.info(`Extracted ${keywords.length} unique keywords from slots`);
      return keywords;

    } catch (error) {
      logger.error('Failed to fetch slot keywords:', error);
      throw error;
    }
  }

  /**
   * JSONB에서 중첩된 필드 값 가져오기
   * 예: "product.name" -> data.product.name
   */
  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }

    return current;
  }

  /**
   * 슬롯 키워드와 기존 키워드 병합
   */
  async getMergedKeywords(existingKeywords: any[]): Promise<any[]> {
    if (!this.enabled) {
      return existingKeywords;
    }

    try {
      const slotKeywords = await this.getSlotKeywords();
      
      // 기존 키워드의 keyword 값들
      const existingKeywordSet = new Set(existingKeywords.map(k => k.keyword));
      
      // 슬롯 키워드 중 기존에 없는 것만 추가
      const newKeywords = slotKeywords
        .filter(sk => !existingKeywordSet.has(sk.keyword))
        .map(sk => ({
          id: `slot_${sk.slotId}_${sk.fieldName}`, // 임시 ID
          keyword: sk.keyword,
          is_active: true,
          priority: 0, // 기본 우선순위
          source: 'slot',
          slot_id: sk.slotId,
          field_name: sk.fieldName
        }));

      const merged = [...existingKeywords, ...newKeywords];
      
      logger.info(`Merged keywords: ${existingKeywords.length} from DB + ${newKeywords.length} from slots = ${merged.length} total`);
      
      return merged;
    } catch (error) {
      logger.error('Failed to merge keywords:', error);
      // 에러 시 기존 키워드만 반환
      return existingKeywords;
    }
  }
}