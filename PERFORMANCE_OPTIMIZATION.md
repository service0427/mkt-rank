# 성능 최적화 가이드

## 문제: 대량의 순위 데이터 축적

매 1-3시간마다 키워드별로 100개의 상품 순위를 저장하면:
- 1개 키워드 = 하루 8-24회 수집 = 800-2,400 rows/day
- 100개 키워드 = 80,000-240,000 rows/day
- 1년 = 약 3천만-8천만 rows

## 해결 방안

### 1. 테이블 파티셔닝 (권장)

월별로 테이블을 분할하여 쿼리 성능 향상:

```sql
-- 파티션 테이블 생성
CREATE TABLE shopping_rankings_2025_07 PARTITION OF shopping_rankings_partitioned
  FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
```

### 2. 집계 테이블 활용

실시간 데이터 대신 집계된 데이터로 그래프 표시:

```sql
-- 시간별 평균 순위 조회
SELECT 
  product_id,
  hour,
  avg_rank,
  min_rank,
  max_rank
FROM shopping_rankings_hourly
WHERE keyword_id = ? 
  AND hour >= NOW() - INTERVAL '7 days'
ORDER BY hour DESC;
```

### 3. 데이터 보존 정책

```sql
-- 30일 이상 된 원본 데이터는 자동 삭제
-- 집계 데이터는 90일간 보존
-- 일별 집계는 1년간 보존
```

### 4. 인덱스 최적화

```sql
-- 가장 자주 사용되는 쿼리에 맞춘 인덱스
CREATE INDEX idx_shopping_rankings_keyword_collected 
  ON shopping_rankings(keyword_id, collected_at DESC);
```

### 5. 쿼리 최적화 예시

#### 특정 상품의 순위 변화 추이
```sql
-- 느림 (원본 테이블)
SELECT collected_at, rank
FROM shopping_rankings
WHERE keyword_id = ? AND product_id = ?
ORDER BY collected_at DESC
LIMIT 168; -- 7일 * 24시간

-- 빠름 (집계 테이블)
SELECT hour, avg_rank
FROM shopping_rankings_hourly
WHERE keyword_id = ? AND product_id = ?
  AND hour >= NOW() - INTERVAL '7 days'
ORDER BY hour DESC;
```

#### 상위 10개 상품 추이
```sql
-- 최근 수집된 상위 10개 제품 ID 먼저 찾기
WITH recent_top10 AS (
  SELECT DISTINCT product_id
  FROM shopping_rankings
  WHERE keyword_id = ? 
    AND collected_at = (
      SELECT MAX(collected_at) 
      FROM shopping_rankings 
      WHERE keyword_id = ?
    )
    AND rank <= 10
)
-- 해당 제품들의 7일간 추이
SELECT 
  sr.product_id,
  sr.title,
  sh.hour,
  sh.avg_rank
FROM shopping_rankings_hourly sh
JOIN recent_top10 rt ON sh.product_id = rt.product_id
JOIN shopping_rankings sr ON sr.product_id = sh.product_id
WHERE sh.keyword_id = ?
  AND sh.hour >= NOW() - INTERVAL '7 days'
GROUP BY sr.product_id, sr.title, sh.hour, sh.avg_rank
ORDER BY sh.hour DESC, sh.avg_rank;
```

### 6. Supabase 최적화

#### Row Level Security (RLS) 비활성화
대량 데이터 처리 시 RLS는 성능에 영향을 줄 수 있습니다:

```sql
ALTER TABLE shopping_rankings DISABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_rankings_hourly DISABLE ROW LEVEL SECURITY;
```

#### Connection Pooling
Supabase 클라이언트 설정:

```typescript
const supabase = createClient(url, key, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: false,
  },
  global: {
    fetch: customFetch, // 커넥션 풀링 적용
  },
});
```

### 7. 모니터링

```sql
-- 테이블 크기 확인
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'shopping_rankings%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 인덱스 사용률 확인
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'shopping_rankings'
ORDER BY idx_scan DESC;
```

## 구현 우선순위

1. **즉시 구현**: 적절한 인덱스 생성
2. **1개월 내**: 시간별/일별 집계 테이블 및 스케줄러
3. **3개월 내**: 파티셔닝 (데이터가 많아지면)
4. **필요시**: 읽기 전용 복제본, 캐싱 레이어

## 예상 성능

- 원본 테이블 쿼리: 1-5초 (대량 데이터)
- 집계 테이블 쿼리: 10-100ms
- 그래프 렌더링: 100-500ms