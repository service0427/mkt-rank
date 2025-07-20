// 유지보수 스케줄러
import * as cron from 'node-cron';
import { query } from '../db/postgres';

class MaintenanceScheduler {
  constructor() {
    this.setupSchedules();
  }

  private setupSchedules() {
    // 매일 자정: daily/hourly 데이터 정리
    cron.schedule('0 0 * * *', async () => {
      console.log('Running daily cleanup...');
      try {
        await query('SELECT cleanup_daily_rankings()');
        await query('SELECT cleanup_hourly_rankings()');
        console.log('Daily cleanup completed');
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    });

    // 매월 1일 자정: 파티션 관리
    cron.schedule('0 0 1 * *', async () => {
      console.log('Running monthly partition management...');
      try {
        await query('SELECT manage_partitions()');
        console.log('Partition management completed');
      } catch (error) {
        console.error('Partition management error:', error);
      }
    });

    console.log('Maintenance scheduler started');
  }
}

// 스케줄러 시작
new MaintenanceScheduler();

export default MaintenanceScheduler;