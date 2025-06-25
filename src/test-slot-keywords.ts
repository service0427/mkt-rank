import { SlotKeywordService } from './services/keyword/slot-keyword.service';
import { KeywordService } from './services/keyword/keyword.service';
import { logger } from './utils/logger';

const testSlotKeywords = async () => {
  console.log('Testing Slot Keywords Feature...\n');
  
  // 현재 설정 확인
  console.log('Environment Variables:');
  console.log(`ENABLE_SLOT_KEYWORDS: ${process.env.ENABLE_SLOT_KEYWORDS}`);
  console.log(`SLOT_KEYWORD_FIELDS: ${process.env.SLOT_KEYWORD_FIELDS}\n`);

  // SlotKeywordService 테스트
  const slotService = new SlotKeywordService();
  console.log(`Slot keywords enabled: ${slotService.isEnabled()}\n`);

  if (slotService.isEnabled()) {
    try {
      console.log('Fetching keywords from slots...');
      const slotKeywords = await slotService.getSlotKeywords();
      console.log(`Found ${slotKeywords.length} keywords from slots:`);
      slotKeywords.forEach(sk => {
        console.log(`  - "${sk.keyword}" (from slot ${sk.slotId}, field: ${sk.fieldName})`);
      });
    } catch (error) {
      console.error('Error fetching slot keywords:', error);
    }
  } else {
    console.log('Slot keywords are disabled. Set ENABLE_SLOT_KEYWORDS=true to enable.\n');
  }

  // KeywordService 테스트 (병합된 결과)
  console.log('\n--- Testing merged keywords ---');
  const keywordService = new KeywordService();
  
  try {
    const allKeywords = await keywordService.getActiveKeywords();
    console.log(`Total active keywords: ${allKeywords.length}`);
    
    // 소스별로 분류
    const dbKeywords = allKeywords.filter(k => !k.source || k.source !== 'slot');
    const slotKeywords = allKeywords.filter(k => k.source === 'slot');
    
    console.log(`  - From DB: ${dbKeywords.length}`);
    console.log(`  - From Slots: ${slotKeywords.length}`);
    
    if (slotKeywords.length > 0) {
      console.log('\nSlot-based keywords:');
      slotKeywords.slice(0, 5).forEach(k => {
        console.log(`  - "${k.keyword}" (${k.field_name})`);
      });
      if (slotKeywords.length > 5) {
        console.log(`  ... and ${slotKeywords.length - 5} more`);
      }
    }
  } catch (error) {
    console.error('Error fetching keywords:', error);
  }

  process.exit(0);
};

testSlotKeywords().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});