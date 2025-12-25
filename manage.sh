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
        
        # 프로젝트 디렉토리로 이동
        cd /home/smart/project/home || {
            echo "❌ 프로젝트 디렉토리로 이동 실패: /home/smart/project/home"
            exit 1
        }
        
        # Nginx 상태 확인 및 시작
        if ! systemctl is-active --quiet nginx; then
            echo "📦 Nginx가 실행 중이 아닙니다. 시작 중..."
            sudo systemctl start nginx
            if [ $? -eq 0 ]; then
                echo "✅ Nginx 시작 완료"
            else
                echo "⚠️  Nginx 시작 실패 (권한 문제일 수 있음)"
            fi
        else
            echo "✅ Nginx 이미 실행 중"
        fi
        
        # Next.js 서버 시작 (이미 실행 중인 것들은 모두 삭제 후 새로 시작)
        if pm2 list | grep -q "nextjs-server"; then
            echo "🗑️  기존 nextjs-server 프로세스 삭제 중..."
            pm2 delete nextjs-server 2>/dev/null
            # 여러 개가 있을 수 있으므로 반복 삭제
            while pm2 list | grep -q "nextjs-server"; do
                pm2 delete nextjs-server 2>/dev/null
            done
            echo "✅ 기존 프로세스 삭제 완료"
        fi
        
        echo "🚀 nextjs-server 시작 중..."
        pm2 start npm --name nextjs-server -- start
        pm2 save
        
        echo ""
        echo "✅ PM2 서버가 시작되었습니다."
        echo ""
        echo "📋 서버 상태:"
        pm2 list | grep nextjs-server || echo "⚠️  nextjs-server가 목록에 없습니다"
        echo ""
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
    init-nginx)
        echo "🔧 Nginx 설정 초기화 중..."
        
        NGINX_CONFIG="/etc/nginx/sites-available/default"
        BACKUP_FILE="/etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)"
        
        # 기존 설정 백업
        if [ -f "$NGINX_CONFIG" ]; then
            echo "📦 기존 설정 백업 중: $BACKUP_FILE"
            sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"
            echo "✅ 백업 완료: $BACKUP_FILE"
        fi
        
        # 간소화된 설정 생성
        echo "📝 새로운 Nginx 설정 생성 중..."
        sudo tee "$NGINX_CONFIG" > /dev/null << 'EOF'
server {
    listen 80;
    server_name smartzero.duckdns.org;

    # 모든 요청을 Next.js 서버로 프록시
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
        
        # 설정 테스트
        echo ""
        echo "🧪 Nginx 설정 테스트 중..."
        if sudo nginx -t; then
            echo "✅ Nginx 설정이 올바릅니다."
            echo ""
            echo "⚠️  Nginx를 재시작하려면: sudo systemctl restart nginx"
        else
            echo "❌ Nginx 설정에 오류가 있습니다!"
            echo "백업에서 복원하려면: sudo cp $BACKUP_FILE $NGINX_CONFIG"
            exit 1
        fi
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
        echo "  kill-port      - 포트 3000 사용 중인 프로세스 강제 종료"
        echo "  init-nginx     - Nginx 설정 초기화 (간소화된 설정으로 변경)"
        echo ""
        echo "예시:"
        echo "  ./manage.sh start"
        echo "  ./manage.sh restart-one trade-api"
        echo "  ./manage.sh logs dashboard-api"
        echo "  ./manage.sh init-nginx"
        echo "  ./manage.sh init-nginx"
        ;;
esac

