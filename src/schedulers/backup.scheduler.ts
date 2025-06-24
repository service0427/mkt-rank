import { CronJob } from 'cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { LocalPostgresService } from '../services/database/local-postgres.service';

const execAsync = promisify(exec);

export class BackupScheduler {
  private job: CronJob;
  private localDb: LocalPostgresService;

  constructor() {
    this.localDb = new LocalPostgresService();
    
    // 매월 1일 새벽 3시에 실행
    const cronExpression = process.env.BACKUP_CRON_EXPRESSION || '0 0 3 1 * *';
    
    this.job = new CronJob(
      cronExpression,
      this.runBackup.bind(this),
      null,
      false,
      process.env.TIMEZONE || 'Asia/Seoul'
    );
  }

  async start(): Promise<void> {
    logger.info('Starting backup scheduler');
    
    // 백업 메타데이터 준비
    await this.prepareBackupMetadata();
    
    this.job.start();
    logger.info('Backup scheduler started');
  }

  stop(): void {
    logger.info('Stopping backup scheduler');
    this.job.stop();
  }

  private async runBackup(): Promise<void> {
    logger.info('Starting monthly backup process');
    
    try {
      // 백업 스크립트 실행
      const scriptPath = '/Users/choijinho/app/study3/techb_search/mkt-rank/scripts/backup-old-data.sh';
      const { stdout, stderr } = await execAsync(`bash ${scriptPath}`);
      
      if (stdout) {
        logger.info('Backup output:', stdout);
      }
      
      if (stderr) {
        logger.error('Backup stderr:', stderr);
      }
      
      logger.info('Monthly backup completed successfully');
    } catch (error: any) {
      logger.error('Monthly backup failed:', error);
      
      // 실패 기록
      await this.recordBackupFailure(error.message);
    }
  }

  private async prepareBackupMetadata(): Promise<void> {
    try {
      // 4개월 전 날짜 계산
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
      fourMonthsAgo.setDate(1);
      fourMonthsAgo.setHours(0, 0, 0, 0);
      
      // 백업 메타데이터 사전 생성
      await this.localDb.pool.query(`
        INSERT INTO backup_metadata (backup_month, file_path, backup_started_at, status)
        VALUES ($1, $2, CURRENT_TIMESTAMP, 'pending')
        ON CONFLICT DO NOTHING
      `, [
        fourMonthsAgo,
        `/backup/shopping_rankings/shopping_rankings_${fourMonthsAgo.getFullYear()}_${String(fourMonthsAgo.getMonth() + 1).padStart(2, '0')}.sql.gz`
      ]);
    } catch (error) {
      logger.error('Failed to prepare backup metadata:', error);
    }
  }

  private async recordBackupFailure(errorMessage: string): Promise<void> {
    try {
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
      fourMonthsAgo.setDate(1);
      
      await this.localDb.pool.query(`
        UPDATE backup_metadata 
        SET status = 'failed', 
            error_message = $1,
            backup_completed_at = CURRENT_TIMESTAMP
        WHERE backup_month = $2::DATE
        AND status IN ('pending', 'running')
      `, [errorMessage, fourMonthsAgo]);
    } catch (error) {
      logger.error('Failed to record backup failure:', error);
    }
  }

  /**
   * 수동 백업 실행
   */
  async runManualBackup(): Promise<void> {
    logger.info('Running manual backup');
    await this.runBackup();
  }

  /**
   * 백업 상태 조회
   */
  async getBackupStatus(): Promise<any[]> {
    const result = await this.localDb.pool.query(`
      SELECT 
        backup_month,
        file_path,
        file_size,
        row_count,
        backup_started_at,
        backup_completed_at,
        status,
        error_message
      FROM backup_metadata
      ORDER BY backup_month DESC
      LIMIT 12
    `);
    
    return result.rows;
  }
}