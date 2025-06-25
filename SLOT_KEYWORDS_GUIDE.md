# Slot Keywords 기능 가이드

## 개요
`slots` 테이블의 `input_data` (JSONB) 필드에서 키워드를 자동으로 추출하여 검색 키워드로 사용하는 기능입니다.

## 설정 방법

### 1. 환경 변수 설정
`.env` 파일에 다음 설정을 추가:

```bash
# Slot Keywords 기능 활성화 (기본값: false)
ENABLE_SLOT_KEYWORDS=true

# JSONB에서 추출할 필드명 (콤마로 구분)
SLOT_KEYWORD_FIELDS=product_name,search_term,keyword
```

### 2. 중첩 필드 지원
JSONB 내부의 중첩된 필드도 접근 가능:

```bash
# 점(.)으로 중첩 필드 표현
SLOT_KEYWORD_FIELDS=product.name,meta.keywords,tags.primary
```

예시 JSONB 데이터:
```json
{
  "product": {
    "name": "나이키 에어맥스"
  },
  "meta": {
    "keywords": "운동화"
  },
  "tags": {
    "primary": "스니커즈"
  }
}
```

## 동작 방식

### 1. 키워드 추출 프로세스
```
slots 테이블 → is_active=true인 row 조회
    ↓
input_data (JSONB) → 설정된 필드명에서 값 추출
    ↓
중복 제거 → 고유한 키워드 목록 생성
    ↓
기존 search_keywords와 병합
```

### 2. 우선순위
- `search_keywords` 테이블의 키워드가 우선
- 동일한 키워드가 있으면 slots에서 추출한 것은 무시
- slots 키워드는 기본 priority=0

### 3. 키워드 식별
slots에서 추출된 키워드는 다음 정보를 포함:
- `source: 'slot'` - 출처 표시
- `slot_id` - 원본 slot ID
- `field_name` - 추출된 필드명

## 테스트 방법

### 1. 기능 테스트
```bash
# 환경 변수 설정 확인 및 테스트
npm run test:slot-keywords

# 또는
npx tsx src/test-slot-keywords.ts
```

### 2. 실제 동작 확인
```bash
# Queue 시스템 실행
npm run dev:queue

# 모니터링 대시보드에서 키워드 확인
http://localhost:3001/monitor
```

## 활성화/비활성화

### 비활성화 (기본값)
```bash
ENABLE_SLOT_KEYWORDS=false
```
- slots 테이블을 조회하지 않음
- 기존 search_keywords만 사용

### 활성화
```bash
ENABLE_SLOT_KEYWORDS=true
```
- 매번 키워드 조회 시 slots 테이블도 확인
- 동적으로 키워드 추가

## 주의사항

1. **성능 고려**
   - slots 테이블이 크면 조회 시간 증가
   - 적절한 인덱스 필요 (is_active, input_data)

2. **데이터 검증**
   - JSONB 필드가 없거나 null인 경우 무시
   - 문자열이 아닌 값은 무시
   - 빈 문자열은 무시

3. **중복 처리**
   - 여러 slot에서 동일한 키워드 추출 시 하나만 사용
   - search_keywords와 중복 시 search_keywords 우선

## 로그 확인

```bash
# 로그에서 slot 키워드 관련 메시지 확인
tail -f logs/combined.log | grep -i slot

# 주요 로그 메시지
- "SlotKeywordService initialized"
- "Extracted X unique keywords from slots"
- "Merged keywords: X from DB + Y from slots"
```

## 문제 해결

### slots 테이블이 없는 경우
- 자동으로 빈 배열 반환
- 에러 없이 기존 키워드만 사용

### JSONB 필드 접근 실패
- 해당 필드 무시하고 계속 진행
- 로그에 경고 메시지 출력

### 성능이 느린 경우
1. slots 테이블에 인덱스 추가:
```sql
CREATE INDEX idx_slots_active ON slots(is_active) WHERE is_active = true;
CREATE INDEX idx_slots_input_data ON slots USING gin(input_data);
```

2. 필드명을 최소화하여 검색 범위 축소