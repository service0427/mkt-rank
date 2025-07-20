// MySQL AD_SLOTS 순위 동기화 전용 모듈
import mysql from 'mysql2/promise';
import { query } from '../db/postgres';
import cron from 'node-cron';


interface RankingData {
  keyword: string;
  product_id: string;
  rank: number;
  title?: string;
  link?: string;
  image?: string;
  lprice?: number;
  mall_name?: string;
  collected_at: Date;
}

export class MySQLAdSlotsSyncService {
  private mysqlConfig: any;
  private connection: mysql.Connection | null = null;

  constructor(mysqlConfig: any) {
    this.mysqlConfig = mysqlConfig;
  }

  async start() {
    console.log('Starting MySQL AD_SLOTS Sync Service...');
    
    // 매 시간마다 동기화 실행
    cron.schedule('0 * * * *', async () => {
      console.log('Starting hourly AD_SLOTS sync...');
      await this.syncAdSlotsRankings();
    });

    // 즉시 한번 실행
    await this.syncAdSlotsRankings();
  }

  private async connect() {
    if (!this.connection) {
      this.connection = await mysql.createConnection({
        host: this.mysqlConfig.host,
        port: this.mysqlConfig.port,
        user: this.mysqlConfig.user,
        password: this.mysqlConfig.password,
        database: this.mysqlConfig.database
      });
    }
  }

  private async disconnect() {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  async syncAdSlotsRankings() {
    const startTime = Date.now();
    console.log('=== AD_SLOTS 순위 동기화 시작 ===');

    try {
      await this.connect();

      // 1. 활성화된 AD_SLOTS 조회
      const [adSlots] = await this.connection!.execute<any[]>(`
        SELECT 
          ad_slot_id,
          work_keyword,
          price_compare_mid,
          product_mid,
          seller_mid,
          store_start_rank,
          store_rank,
          price_start_rank,
          price_rank
        FROM ad_slots
        WHERE status = 'ACTIVE' 
        AND is_active = 1
        AND work_keyword IS NOT NULL
        AND (product_mid IS NOT NULL OR price_compare_mid IS NOT NULL OR seller_mid IS NOT NULL)
      `);

      console.log(`총 ${adSlots.length}개의 AD_SLOTS 발견`);

      let updatedCount = 0;
      let newStartRankCount = 0;

      for (const slot of adSlots) {
        // 사용할 MID 결정 (우선순위: product_mid > price_compare_mid > seller_mid)
        const mid = slot.product_mid || slot.price_compare_mid || slot.seller_mid;
        if (!mid) continue;

        // Unified에서 해당 키워드와 MID의 최신 순위 조회
        const rankingData = await this.getLatestRanking(slot.work_keyword, mid);

        if (rankingData) {
          // 시작 순위 설정 (최초 1회만)
          const isFirstRank = !slot.store_start_rank || slot.store_start_rank === 0;
          const startRank = isFirstRank ? rankingData.rank : slot.store_start_rank;
          
          // 순위 변동 계산 (양수: 상승, 음수: 하락, 0: 동일)
          const rankDiff = startRank - rankingData.rank;

          // MySQL 업데이트
          await this.connection!.execute(`
            UPDATE ad_slots 
            SET 
              store_rank = ?,
              store_start_rank = ?,
              store_rank_diff = ?,
              rank_check_date = CURDATE(),
              updated_at = NOW()
            WHERE ad_slot_id = ?
          `, [
            rankingData.rank,
            startRank,
            rankDiff,
            slot.ad_slot_id
          ]);

          if (isFirstRank) {
            newStartRankCount++;
            console.log(`[새로운 시작 순위] ${slot.work_keyword} (MID: ${mid}) - 시작순위: ${startRank}`);
          }

          updatedCount++;

          // 상세 로그 (순위 변동이 있는 경우만)
          if (slot.store_rank && slot.store_rank !== rankingData.rank) {
            console.log(`[순위 변동] ${slot.work_keyword} (MID: ${mid}): ${slot.store_rank}위 → ${rankingData.rank}위 (시작대비: ${rankDiff > 0 ? '+' : ''}${rankDiff})`);
          }
        } else {
          // 순위 정보를 찾을 수 없는 경우
          console.log(`[순위 없음] ${slot.work_keyword} (MID: ${mid})`);
        }
      }

      console.log(`=== 동기화 완료 ===`);
      console.log(`- 총 처리: ${adSlots.length}개`);
      console.log(`- 업데이트: ${updatedCount}개`);
      console.log(`- 신규 시작순위: ${newStartRankCount}개`);
      console.log(`- 소요시간: ${Date.now() - startTime}ms`);

    } catch (error) {
      console.error('AD_SLOTS 동기화 중 오류 발생:', error);
    } finally {
      await this.disconnect();
    }
  }

  private async getLatestRanking(keyword: string, productId: string): Promise<RankingData | null> {
    try {
      // unified_rankings_current에서 조회 (없으면 detail에서 최신 데이터 조회)
      let [ranking] = await query<any>(`
        SELECT 
          keyword, product_id, rank, title, link, image, 
          lprice, mall_name, collected_at
        FROM unified_rankings_current
        WHERE keyword = $1 
        AND product_id = $2
        AND platform = 'naver_shopping'
        ORDER BY collected_at DESC
        LIMIT 1
      `, [keyword, productId]);

      // current 테이블에 없으면 detail에서 최신 데이터 조회
      if (!ranking) {
        [ranking] = await query<any>(`
          SELECT 
            keyword, product_id, rank, title, link, image,
            lprice, mall_name, collected_at
          FROM unified_rankings_detail
          WHERE keyword = $1 
          AND product_id = $2
          AND platform = 'naver_shopping'
          AND collected_at >= CURRENT_TIMESTAMP - INTERVAL '2 hours'
          ORDER BY collected_at DESC
          LIMIT 1
        `, [keyword, productId]);
      }

      return ranking || null;
    } catch (error) {
      console.error(`순위 조회 오류 (${keyword}, ${productId}):`, error);
      return null;
    }
  }

  // 수동 동기화 트리거
  async triggerSync(): Promise<{ success: boolean; message: string }> {
    try {
      await this.syncAdSlotsRankings();
      return { success: true, message: 'AD_SLOTS 동기화가 완료되었습니다.' };
    } catch (error) {
      return { success: false, message: `동기화 실패: ${error}` };
    }
  }

  // 통계 조회
  async getStats(): Promise<any> {
    try {
      await this.connect();

      const [stats] = await this.connection!.execute<any[]>(`
        SELECT 
          COUNT(*) as total_slots,
          COUNT(CASE WHEN store_rank IS NOT NULL AND store_rank > 0 THEN 1 END) as ranked_slots,
          COUNT(CASE WHEN store_start_rank IS NOT NULL AND store_start_rank > 0 THEN 1 END) as with_start_rank,
          COUNT(CASE WHEN store_rank_diff > 0 THEN 1 END) as improved_slots,
          COUNT(CASE WHEN store_rank_diff < 0 THEN 1 END) as declined_slots,
          COUNT(CASE WHEN store_rank_diff = 0 THEN 1 END) as stable_slots,
          AVG(CASE WHEN store_rank > 0 THEN store_rank END) as avg_rank,
          MIN(CASE WHEN store_rank > 0 THEN store_rank END) as best_rank,
          MAX(CASE WHEN store_rank > 0 THEN store_rank END) as worst_rank
        FROM ad_slots
        WHERE status = 'ACTIVE' 
        AND is_active = 1
        AND work_keyword IS NOT NULL
      `);

      await this.disconnect();
      return stats[0];
    } catch (error) {
      console.error('통계 조회 오류:', error);
      return null;
    }
  }
}

// 단독 실행 시
if (require.main === module) {
  const mysqlConfig = {
    host: process.env.TOP_MYSQL_HOST || 'localhost',
    port: parseInt(process.env.TOP_MYSQL_PORT || '3306'),
    user: process.env.TOP_MYSQL_USER || 'root',
    password: process.env.TOP_MYSQL_PASSWORD || '',
    database: process.env.TOP_MYSQL_DATABASE || 'top_db'
  };

  const syncService = new MySQLAdSlotsSyncService(mysqlConfig);
  
  syncService.start().then(() => {
    console.log('MySQL AD_SLOTS Sync Service started');
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down MySQL AD_SLOTS Sync Service...');
    process.exit(0);
  });
}