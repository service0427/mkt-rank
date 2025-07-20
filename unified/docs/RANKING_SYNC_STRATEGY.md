# 순위 동기화 전략

## 개요
Unified 서버에서 수집한 순위 정보를 각 서비스(Supabase, MySQL)로 동기화하는 전략입니다.

## 데이터 흐름

```
┌─────────────────────────────────────────────────┐
│           Unified Server (중앙)                  │
│  ┌───────────────────────────────────────────┐  │
│  │ unified_rankings_current (현재 순위)       │  │
│  │ unified_rankings_hourly  (시간별 집계)     │  │
│  │ unified_rankings_daily   (일별 집계)       │  │
│  └───────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────┘
                     │ 순위 동기화
         ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│    Supabase     │     │     MySQL       │
│ (mkt-guide.com) │     │  (top.re.kr)    │
├─────────────────┤     ├─────────────────┤
│ shopping_       │     │ ad_slots +      │
│ rankings_*      │     │ ranking_info    │
└─────────────────┘     └─────────────────┘
```

## 1. Supabase 순위 동기화

### 대상 테이블
- `shopping_rankings_current`
- `shopping_rankings_hourly` 
- `shopping_rankings_daily`

### 동기화 방식
```typescript
// 1. 현재 순위 동기화 (5분마다)
async syncCurrentRankingsToSupabase() {
  // Unified에서 최신 순위 조회
  const rankings = await query(`
    SELECT 
      r.*,
      k.metadata->>'original_id' as supabase_keyword_id
    FROM unified_rankings_current r
    JOIN unified_search_keywords k ON r.keyword_id = k.id
    WHERE k.service_id = $1 
    AND r.collected_at > NOW() - INTERVAL '10 minutes'
  `, [supabaseServiceId]);

  // Supabase로 전송
  await supabaseClient
    .from('shopping_rankings_current')
    .upsert(rankings.map(r => ({
      keyword_id: r.supabase_keyword_id,
      product_id: r.product_id,
      rank: r.rank,
      prev_rank: r.previous_rank,
      title: r.title,
      lprice: r.lprice,
      mall_name: r.mall_name,
      // ... 기타 필드
    })));
}

// 2. 시간별/일별 집계 동기화 (1시간마다)
async syncAggregatedRankings() {
  // 시간별
  // 일별
}
```

## 2. MySQL (AD_SLOTS) 순위 동기화

### 테이블 수정 필요
```sql
-- MySQL에 순위 정보 테이블 추가
CREATE TABLE IF NOT EXISTS ad_slots_rankings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ad_slot_id BIGINT NOT NULL,
  keyword VARCHAR(200) NOT NULL,
  product_mid VARCHAR(100) NOT NULL,
  rank INT NOT NULL,
  previous_rank INT,
  platform VARCHAR(50) NOT NULL,
  collected_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_keyword_mid (keyword, product_mid),
  INDEX idx_collected (collected_at),
  FOREIGN KEY (ad_slot_id) REFERENCES ad_slots(id)
);

-- 또는 ad_slots 테이블에 직접 추가
ALTER TABLE ad_slots 
ADD COLUMN current_rank INT,
ADD COLUMN previous_rank INT,
ADD COLUMN rank_updated_at DATETIME;
```

### 동기화 방식
```typescript
async syncRankingsToMySQL() {
  // AD_SLOTS의 MID 정보 활용
  const adSlots = await mysqlQuery(`
    SELECT id, work_keyword, price_compare_mid, product_mid
    FROM ad_slots
    WHERE status = 'ACTIVE' AND is_active = 1
  `);

  for (const slot of adSlots) {
    // Unified에서 해당 MID의 순위 조회
    const ranking = await query(`
      SELECT rank, previous_rank, collected_at
      FROM unified_rankings_current
      WHERE keyword = $1 
      AND product_id = $2
      AND platform = 'naver_shopping'
      ORDER BY collected_at DESC
      LIMIT 1
    `, [slot.work_keyword, slot.price_compare_mid || slot.product_mid]);

    if (ranking) {
      // MySQL 업데이트
      await mysqlQuery(`
        UPDATE ad_slots 
        SET current_rank = ?, 
            previous_rank = ?,
            rank_updated_at = ?
        WHERE id = ?
      `, [ranking.rank, ranking.previous_rank, ranking.collected_at, slot.id]);
    }
  }
}
```

## 3. 동기화 스케줄

### SyncWorker 수정
```typescript
class RankingSyncWorker {
  async scheduleRankingSync() {
    // 5분마다 현재 순위 동기화
    cron.schedule('*/5 * * * *', async () => {
      await this.syncCurrentRankings();
    });

    // 1시간마다 집계 데이터 동기화
    cron.schedule('0 * * * *', async () => {
      await this.syncAggregatedRankings();
    });
  }

  async syncCurrentRankings() {
    const services = await this.getActiveServices();
    
    for (const service of services) {
      if (service.sync_config?.sync_rankings) {
        switch (service.db_type) {
          case 'supabase':
            await this.syncToSupabase(service);
            break;
          case 'mysql':
            await this.syncToMySQL(service);
            break;
        }
      }
    }
  }
}
```

## 4. 동기화 설정

### unified_services 테이블의 sync_config
```json
{
  "sync_rankings": true,
  "ranking_sync_interval": 5,
  "sync_current": true,
  "sync_hourly": true,
  "sync_daily": true,
  "ranking_platforms": ["naver_shopping", "coupang"],
  "mid_mapping": {
    "use_mid": true,
    "mid_fields": ["price_compare_mid", "product_mid"]
  }
}
```

## 5. 충돌 해결

### 키워드 ID 매핑
- Unified의 keyword_id와 각 서비스의 keyword_id 매핑 필요
- `unified_sync_mappings` 테이블 활용

### MID 기반 매칭 (MySQL)
- AD_SLOTS의 MID와 수집된 product_id 매칭
- 정확한 매칭을 위해 MID 정규화 필요

## 6. 모니터링

### 동기화 로그
```sql
CREATE TABLE unified_ranking_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES unified_services(service_id),
  sync_type VARCHAR(50), -- 'current', 'hourly', 'daily'
  platform VARCHAR(50),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_records INT,
  success_records INT,
  failed_records INT,
  error_details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 상태 확인 API
- `GET /api/sync/ranking-status` - 순위 동기화 상태
- `GET /api/sync/ranking-logs` - 순위 동기화 로그

## 구현 우선순위

1. **Phase 1**: Supabase 현재 순위 동기화
   - shopping_rankings_current 테이블로 실시간 동기화
   - 5분 간격

2. **Phase 2**: MySQL AD_SLOTS 순위 업데이트
   - ad_slots 테이블에 순위 컬럼 추가
   - MID 기반 매칭

3. **Phase 3**: 집계 데이터 동기화
   - 시간별/일별 데이터 동기화
   - 1시간 간격

4. **Phase 4**: 모니터링 및 알림
   - 동기화 실패 알림
   - 대시보드 통계