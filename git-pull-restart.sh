#!/bin/bash

# Git pull + 자동 재시작 스크립트

SERVER="smart@smartzero.duckdns.org"

echo "🔄 Git pull 및 자동 재시작..."
echo ""

ssh $SERVER << 'ENDSSH'
REMOTE_PATH=$(pwd)
cd "$REMOTE_PATH"

echo "📥 Git pull 중..."
git pull origin main

echo ""
# 변경된 파일 확인
CHANGED_FILES=$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD 2>/dev/null || echo "")

# package.json이나 package-lock.json이 변경되었는지 확인
if echo "$CHANGED_FILES" | grep -qE "(package\.json|package-lock\.json)"; then
    echo "📦 의존성 파일 변경됨, 설치 중..."
    npm install --production
else
    echo "ℹ️  의존성 파일 변경 없음, 설치 스킵"
fi

echo ""
# 빌드가 필요한 파일이 변경되었는지 확인
# app/ 디렉토리, next.config.js, package.json 변경 시에만 빌드 필요
# 정적 파일(trade-web/, dashboard/static/ 등)은 빌드 불필요
if echo "$CHANGED_FILES" | grep -qE "(^app/|^next\.config\.js|^package\.json)"; then
    echo "🔨 빌드 필요한 파일 변경됨, 빌드 중..."
    npm run build
else
    echo "ℹ️  빌드 필요한 파일 변경 없음, 빌드 스킵 (정적 파일만 변경된 경우 재시작만)"
fi

echo ""
echo "🔄 서버 재시작 중..."
pm2 delete nextjs-server 2>/dev/null
pm2 start npm --name nextjs-server -- start
pm2 save

echo ""
echo "📊 서버 상태:"
pm2 list | grep nextjs-server

echo ""
echo "✅ 완료!"
ENDSSH

echo ""
echo "🎉 Git pull 및 재시작 완료!"

