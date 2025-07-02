#!/bin/bash

# 키워드 동기화 크론 작업 설정 스크립트

echo "=== 키워드 동기화 크론 작업 설정 ==="

# 프로젝트 경로
PROJECT_DIR="/home/techb/mkt-rank"
NODE_PATH=$(which node)

# 크론 작업 추가
CRON_JOB="50,55 * * * * cd $PROJECT_DIR && $NODE_PATH dist/cron-keyword-sync.js >> $PROJECT_DIR/logs/keyword-sync.log 2>&1"

# 현재 크론탭 확인
echo "현재 크론탭 확인:"
crontab -l | grep "cron-keyword-sync" || echo "키워드 동기화 크론 작업이 없습니다."

# 크론 작업 추가
echo ""
echo "새로운 크론 작업 추가:"
echo "$CRON_JOB"

# 사용자에게 확인
read -p "이 크론 작업을 추가하시겠습니까? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]
then
    # 로그 디렉토리 생성
    mkdir -p $PROJECT_DIR/logs
    
    # 크론탭에 추가
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    
    echo "크론 작업이 추가되었습니다."
    echo ""
    echo "크론탭 확인:"
    crontab -l | grep "cron-keyword-sync"
    echo ""
    echo "로그 파일 위치: $PROJECT_DIR/logs/keyword-sync.log"
else
    echo "크론 작업 추가가 취소되었습니다."
fi

echo ""
echo "=== 수동 테스트 명령어 ==="
echo "cd $PROJECT_DIR && node dist/cron-keyword-sync.js"