#!/bin/bash

# 4개월 롤링 윈도우 백업 스크립트
# 매월 1일 실행하여 4개월 이전 데이터를 백업하고 삭제

# 환경 변수 설정
DB_NAME="${LOCAL_PG_DATABASE:-mkt_rank_local}"
DB_USER="${LOCAL_PG_USER:-$USER}"
DB_HOST="${LOCAL_PG_HOST:-localhost}"
DB_PORT="${LOCAL_PG_PORT:-5432}"
BACKUP_PATH="${BACKUP_PATH:-/tmp/backup/shopping_rankings}"

# 백업 디렉토리 생성
mkdir -p "$BACKUP_PATH"

# 날짜 계산
CURRENT_DATE=$(date +%Y-%m-%d)
FOUR_MONTHS_AGO=$(date -d "4 months ago" +%Y-%m-%d)
BACKUP_MONTH=$(date -d "4 months ago" +%Y_%m)
PARTITION_NAME="shopping_rankings_${BACKUP_MONTH}"

echo "Starting backup process for partition: $PARTITION_NAME"
echo "Backup date range: Data older than $FOUR_MONTHS_AGO"

# 파티션 존재 확인
PARTITION_EXISTS=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT COUNT(*) FROM information_schema.tables 
    WHERE table_name = '$PARTITION_NAME';
")

if [ "$PARTITION_EXISTS" -eq 0 ]; then
    echo "Partition $PARTITION_NAME does not exist. Nothing to backup."
    exit 0
fi

# 백업 파일명
BACKUP_FILE="${BACKUP_PATH}/${PARTITION_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"

# 데이터 개수 확인
ROW_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT COUNT(*) FROM $PARTITION_NAME;
")

echo "Found $ROW_COUNT rows to backup"

# 백업 시작 기록
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    UPDATE backup_metadata 
    SET status = 'running', backup_started_at = CURRENT_TIMESTAMP
    WHERE backup_month = '$FOUR_MONTHS_AGO'::DATE
    AND status = 'pending';
"

# 백업 실행
echo "Starting backup to: $BACKUP_FILE"
pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
    --table=$PARTITION_NAME \
    --no-owner \
    --no-privileges \
    --verbose \
    | gzip > "$BACKUP_FILE"

# 백업 성공 확인
if [ $? -eq 0 ]; then
    FILE_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
    echo "Backup completed successfully. File size: $FILE_SIZE bytes"
    
    # 백업 완료 기록
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
        UPDATE backup_metadata 
        SET status = 'completed', 
            backup_completed_at = CURRENT_TIMESTAMP,
            file_size = $FILE_SIZE,
            row_count = $ROW_COUNT
        WHERE backup_month = '$FOUR_MONTHS_AGO'::DATE
        AND status = 'running';
    "
    
    # 파티션 삭제
    echo "Dropping partition: $PARTITION_NAME"
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
        DROP TABLE IF EXISTS $PARTITION_NAME;
    "
    
    # 새 파티션 생성 (4개월 후)
    echo "Creating new partition for future data"
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
        SELECT create_monthly_partition((CURRENT_DATE + INTERVAL '4 months')::DATE);
    "
    
    echo "Backup and cleanup completed successfully"
else
    echo "Backup failed!"
    
    # 백업 실패 기록
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
        UPDATE backup_metadata 
        SET status = 'failed', 
            error_message = 'pg_dump failed'
        WHERE backup_month = '$FOUR_MONTHS_AGO'::DATE
        AND status = 'running';
    "
    
    exit 1
fi

# 오래된 백업 파일 정리 (1년 이상)
echo "Cleaning up old backup files..."
find "$BACKUP_PATH" -name "*.sql.gz" -mtime +365 -delete

echo "Backup process completed"