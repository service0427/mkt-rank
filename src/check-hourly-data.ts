import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

async function checkHourlyData() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );
  
  console.log('Checking shopping_rankings_hourly data distribution...\n');
  
  // 1. Check data count by hour
  const { data: hourlyCount, error: countError } = await supabase
    .from('shopping_rankings_hourly')
    .select('hour, keyword_id', { count: 'exact' })
    .order('hour', { ascending: false })
    .limit(500);
    
  if (countError) {
    console.error('Error fetching hourly data:', countError);
    return;
  }
  
  // Group by hour
  const hourGroups = hourlyCount.reduce((acc: any, item: any) => {
    const hour = new Date(item.hour).toISOString().substring(0, 13);
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {});
  
  console.log('Records per hour (last 10 hours):');
  Object.entries(hourGroups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 10)
    .forEach(([hour, count]) => {
      console.log(`${hour}:00 - ${count} records`);
    });
    
  // 2. Check if old data exists (older than 24 hours)
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count: oldCount } = await supabase
    .from('shopping_rankings_hourly')
    .select('*', { count: 'exact', head: true })
    .lt('hour', cutoffTime.toISOString());
    
  console.log(`\nRecords older than 24 hours: ${oldCount}`);
  
  // 3. Check unique constraint
  console.log('\nChecking for duplicate entries...');
  const { data: sample } = await supabase
    .from('shopping_rankings_hourly')
    .select('keyword_id, product_id, hour')
    .limit(10);
    
  if (sample && sample.length > 0) {
    console.log('Sample entry:', {
      keyword_id: sample[0].keyword_id.substring(0, 8) + '...',
      product_id: sample[0].product_id,
      hour: sample[0].hour
    });
  }
}

checkHourlyData();