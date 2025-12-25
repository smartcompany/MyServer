#!/bin/bash

# 서버 관리 스크립트
# 사용법: ./manage.sh [명령어]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# PM2가 설치되어 있는지 확인
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2가 설치되어 있지 않습니다."
    echo "설치하려면: npm install -g pm2"
    exit 1
fi

# ecosystem.config.js에서 정의된 앱 이름들
APPS=("nextjs-server")

case "$1" in
    start)
        echo "🚀 서버 시작 중..."
        pm2 start npm --name nextjs-server -- start
        pm2 save
        echo "✅ 서버가 시작되었습니다."
        echo "상태 확인: ./manage.sh status"
        ;;
    stop)
        echo "🛑 서버 중지 중..."
        for app in "${APPS[@]}"; do
            pm2 stop "$app" 2>/dev/null && echo "✅ $app 중지됨" || echo "⚠️  $app 없음"
        done
        echo "✅ 서버 중지 완료"
        ;;
    restart)
        echo "🔄 서버 재시작 중..."
        for app in "${APPS[@]}"; do
            pm2 restart "$app" 2>/dev/null && echo "✅ $app 재시작됨" || echo "⚠️  $app 없음"
        done
        echo "✅ 서버 재시작 완료"
        ;;
    status)
        echo "📊 서버 상태 확인:"
        echo ""
        pm2 list
        echo ""
        echo "상세 정보: ./manage.sh info"
        ;;
    info)
        echo "📋 서버 상세 정보:"
        pm2 describe all
        ;;
    logs)
        if [ -z "$2" ]; then
            echo "📝 모든 서버 로그 (실시간):"
            echo "특정 서버 로그: ./manage.sh logs [서버이름]"
            echo "예: ./manage.sh logs dashboard-api"
            echo ""
            pm2 logs
        else
            echo "📝 $2 서버 로그 (실시간):"
            pm2 logs "$2"
        fi
        ;;
    restart-one)
        if [ -z "$2" ]; then
            echo "❌ 서버 이름을 지정해주세요."
            echo "사용법: ./manage.sh restart-one [서버이름]"
            echo "사용 가능한 서버: dashboard-api, trade-api, my-bot"
            exit 1
        fi
        echo "🔄 $2 서버 재시작 중..."
        pm2 restart "$2"
        echo "✅ $2 서버가 재시작되었습니다."
        ;;
    monitor)
        echo "📊 PM2 모니터링 대시보드 열기..."
        pm2 monit
        ;;
    save)
        echo "💾 현재 PM2 프로세스 목록 저장 중..."
        pm2 save
        echo "✅ 저장되었습니다. 재부팅 시 자동으로 시작됩니다."
        ;;
    delete)
        echo "🗑️  PM2 프로세스 삭제 중..."
        for app in "${APPS[@]}"; do
            pm2 delete "$app" 2>/dev/null && echo "✅ $app 삭제됨" || echo "⚠️  $app 없음"
        done
        echo "✅ 프로세스 삭제 완료"
        ;;
    *)
        echo "📖 서버 관리 스크립트"
        echo ""
        echo "사용법: ./manage.sh [명령어]"
        echo ""
        echo "명령어:"
        echo "  start          - 모든 서버 시작"
        echo "  stop           - 모든 서버 중지"
        echo "  restart        - 모든 서버 재시작"
        echo "  status         - 서버 상태 확인"
        echo "  info           - 서버 상세 정보"
        echo "  logs [서버]    - 로그 보기 (서버 이름 생략 시 전체)"
        echo "  restart-one    - 특정 서버만 재시작"
        echo "  monitor        - PM2 모니터링 대시보드"
        echo "  save           - 현재 설정 저장 (재부팅 시 자동 시작)"
        echo "  delete         - 모든 프로세스 삭제"
        echo ""
        echo "예시:"
        echo "  ./manage.sh start"
        echo "  ./manage.sh restart-one trade-api"
        echo "  ./manage.sh logs dashboard-api"
        ;;
esac

