#!/bin/bash

# Unified Keyword Management System 배포 스크립트

echo "🚀 Unified System 배포 시작..."

# 1. Git 최신 변경사항 가져오기
echo "📥 Git 변경사항 가져오기..."
git pull origin feature/jicho

# 2. 의존성 설치
echo "📦 의존성 설치..."
npm install

# 3. TypeScript 빌드
echo "🔨 TypeScript 빌드..."
npm run build

# 4. 로그 디렉토리 생성
echo "📁 로그 디렉토리 생성..."
mkdir -p logs

# 5. PM2 프로세스 중지
echo "⏹️  기존 PM2 프로세스 중지..."
pm2 stop unified-web unified-sync 2>/dev/null || true
pm2 delete unified-web unified-sync 2>/dev/null || true

# 6. PM2로 애플리케이션 시작
echo "▶️  PM2로 애플리케이션 시작..."
pm2 start ecosystem.config.js

# 7. PM2 저장 및 startup 설정
echo "💾 PM2 설정 저장..."
pm2 save
pm2 startup

# 8. 상태 확인
echo "✅ 배포 완료! 현재 상태:"
pm2 status

echo "📊 로그 확인 명령어:"
echo "  - 웹 서버 로그: pm2 logs unified-web"
echo "  - 동기화 워커 로그: pm2 logs unified-sync"
echo "  - 전체 로그: pm2 logs"

echo "🌐 웹 인터페이스: http://$(hostname -I | awk '{print $1}'):4000"