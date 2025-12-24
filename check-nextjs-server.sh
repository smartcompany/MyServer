#!/bin/bash

# Next.js 서버 상태 확인 스크립트

SERVER="smart@smartzero.duckdns.org"

echo "🔍 Next.js 서버 상태 확인 중..."
echo ""

ssh $SERVER << 'ENDSSH'
REMOTE_PATH=$(pwd)
cd "$REMOTE_PATH"

echo "📊 PM2 프로세스 상태:"
pm2 list | grep -E "(nextjs|NAME)" || echo "PM2 프로세스 없음"
echo ""

echo "🔌 포트 3000 사용 중인 프로세스:"
sudo lsof -i :3000 2>/dev/null || echo "포트 3000: 사용 중인 프로세스 없음"
echo ""

echo "🧪 Next.js 서버 응답 테스트:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/api/trade/auth-check || echo "서버 응답 없음"
echo ""

echo "📝 Next.js 빌드 확인:"
if [ -d ".next" ]; then
    echo "✅ .next 디렉토리 존재"
    ls -la .next | head -5
else
    echo "❌ .next 디렉토리 없음 (빌드 필요)"
fi
echo ""

echo "📋 PM2 로그 (최근 20줄):"
pm2 logs nextjs-server --lines 20 --nostream 2>/dev/null || echo "로그 없음"
ENDSSH

echo ""
echo "✅ 확인 완료!"

