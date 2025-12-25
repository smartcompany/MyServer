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
echo "📦 의존성 확인 중..."
npm install --production

echo ""
echo "🔨 Next.js 빌드 중..."
npm run build

echo ""
echo "🔄 서버 재시작 중..."
pm2 restart nextjs-server 2>/dev/null || pm2 start ecosystem.config.js
pm2 save

echo ""
echo "📊 서버 상태:"
pm2 list | grep nextjs-server

echo ""
echo "✅ 완료!"
ENDSSH

echo ""
echo "🎉 Git pull 및 재시작 완료!"

