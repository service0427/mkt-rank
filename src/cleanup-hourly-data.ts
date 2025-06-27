import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

async function cleanupHourlyData() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );
  
  console.log('Starting cleanup of old hourly data...\n');
  
  // 1. First, check how much data we have
  const { count: totalCount } = await supabase
    .from('shopping_rankings_hourly')
    .select('*', { count: 'exact', head: true });
    
  console.log(`Total records before cleanup: ${totalCount}`);
  
  // 2. Delete data older than 24 hours
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
  console.log(`Deleting data older than: ${cutoffTime.toISOString()}`);
  
  const { error: deleteError } = await supabase
    .from('shopping_rankings_hourly')
    .delete()
    .lt('hour', cutoffTime.toISOString());
    
  if (deleteError) {
    console.error('Error deleting old data:', deleteError);
    return;
  }
  
  console.log('Old records deleted successfully');
  
  // 3. Check remaining data
  const { count: remainingCount } = await supabase
    .from('shopping_rankings_hourly')
    .select('*', { count: 'exact', head: true });
    
  console.log(`Total records after cleanup: ${remainingCount}`);
  
  // 4. Show current data distribution
  const { data: recentData } = await supabase
    .from('shopping_rankings_hourly')
    .select('hour')
    .order('hour', { ascending: false })
    .limit(200);
    
  if (recentData) {
    const hourCounts = recentData.reduce((acc: any, item: any) => {
      const hour = new Date(item.hour).toISOString().substring(0, 13);
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});
    
    console.log('\nRemaining data by hour:');
    Object.entries(hourCounts)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([hour, count]) => {
        console.log(`${hour}:00 - ${count} records`);
      });
  }
}

// Add confirmation prompt
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('This will delete old data from shopping_rankings_hourly. Continue? (y/n) ', (answer: string) => {
  if (answer.toLowerCase() === 'y') {
    cleanupHourlyData().then(() => {
      readline.close();
    });
  } else {
    console.log('Cleanup cancelled');
    readline.close();
  }
});