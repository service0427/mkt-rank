import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { logger } from './utils/logger';

async function testSupabaseDebug() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
  
  console.log('Testing Supabase connection with:');
  console.log('URL:', supabaseUrl);
  console.log('Key:', supabaseAnonKey.substring(0, 20) + '...');
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  try {
    // 1. Test basic connection
    console.log('\n1. Testing basic connection...');
    const { data: keywords, error: keywordError } = await supabase
      .from('search_keywords')
      .select('*')
      .limit(1);
      
    if (keywordError) {
      console.error('Error fetching keywords:', keywordError);
    } else {
      console.log('Successfully fetched keywords:', keywords?.length);
    }
    
    // 2. Get first keyword for testing
    console.log('\n2. Getting a real keyword for testing...');
    const { data: firstKeyword } = await supabase
      .from('search_keywords')
      .select('id, keyword')
      .eq('is_active', true)
      .limit(1)
      .single();
      
    if (!firstKeyword) {
      console.log('No active keyword found');
      return;
    }
    
    console.log('Using keyword:', firstKeyword.keyword, 'ID:', firstKeyword.id);
    
    // 3. Test insert to shopping_rankings_current
    console.log('\n3. Testing insert to shopping_rankings_current...');
    const testData = {
      keyword_id: firstKeyword.id,
      product_id: 'TEST-PRODUCT-' + Date.now(),
      rank: 999,
      title: 'Test Product Debug',
      lprice: 10000,
      collected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('shopping_rankings_current')
      .upsert(testData, { onConflict: 'keyword_id,product_id' })
      .select();
      
    if (insertError) {
      console.error('Error inserting to shopping_rankings_current:', insertError);
      console.error('Error details:', JSON.stringify(insertError, null, 2));
    } else {
      console.log('Successfully inserted test data:', insertData);
    }
    
    // 4. Clean up test data
    console.log('\n4. Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('shopping_rankings_current')
      .delete()
      .eq('keyword_id', firstKeyword.id)
      .eq('rank', 999);
      
    if (deleteError) {
      console.error('Error cleaning up:', deleteError);
    } else {
      console.log('Test data cleaned up');
    }
    
    // 5. Check RLS policies
    console.log('\n5. Checking table access...');
    const tables = ['shopping_rankings_current', 'shopping_rankings_hourly', 'shopping_rankings_daily'];
    
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
        
      if (error) {
        console.error(`Error accessing ${table}:`, error.message);
      } else {
        console.log(`${table}: accessible (${count} rows)`);
      }
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testSupabaseDebug();