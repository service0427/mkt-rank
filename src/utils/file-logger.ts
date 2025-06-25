import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';

export class FileLogger {
  private logDir: string;
  private logFile: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
    
    // Create daily log file
    const today = format(new Date(), 'yyyy-MM-dd');
    this.logFile = path.join(this.logDir, `execution-${today}.log`);
  }

  private ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(event: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} | ${event} | ${JSON.stringify(data || {})}\n`;
    
    try {
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  logSchedulerStart() {
    this.log('SCHEDULER_START', {
      time: new Date().toISOString(),
      timezone: 'Asia/Seoul',
      expectedInterval: process.env.SCHEDULE_INTERVAL,
    });
  }

  logCollectionStart(keywordCount: number) {
    this.log('COLLECTION_START', {
      keywordCount,
      startTime: new Date().toISOString(),
    });
  }

  logCollectionEnd(successCount: number, errorCount: number, duration: number) {
    this.log('COLLECTION_END', {
      successCount,
      errorCount,
      duration,
      endTime: new Date().toISOString(),
    });
  }

  logKeywordProcessed(keyword: string, success: boolean, duration: number) {
    this.log('KEYWORD_PROCESSED', {
      keyword,
      success,
      duration,
      processedAt: new Date().toISOString(),
    });
  }

  logSchedulerSkipped(reason: string) {
    this.log('SCHEDULER_SKIPPED', {
      reason,
      skippedAt: new Date().toISOString(),
    });
  }

  logError(error: any, context?: string) {
    this.log('ERROR', {
      message: error.message || error,
      stack: error.stack,
      context,
      errorAt: new Date().toISOString(),
    });
  }

  getLogFilePath(): string {
    return this.logFile;
  }

  getTodayLogs(): string[] {
    try {
      const content = fs.readFileSync(this.logFile, 'utf-8');
      return content.split('\n').filter(line => line.trim());
    } catch (error) {
      return [];
    }
  }
}