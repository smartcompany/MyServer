#!/bin/bash

# Git hooks 설정 스크립트

echo "🔧 Git hooks 설정 중..."

# .githooks 디렉토리가 있는지 확인
if [ ! -d ".githooks" ]; then
    echo "❌ .githooks 디렉토리가 없습니다."
    exit 1
fi

# post-merge hook을 실행 가능하게 만들기
chmod +x .githooks/post-merge

# Git hooks 디렉토리를 설정
git config core.hooksPath .githooks

echo "✅ Git hooks 설정 완료!"
echo ""
echo "📝 이제 git pull을 하면 자동으로:"
echo "   1. npm install 실행"
echo "   2. npm run build 실행"
echo "   3. PM2 서버 재시작"
echo ""
echo "🧪 테스트: git pull"

