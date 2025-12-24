# 서버 관리 가이드

이 프로젝트는 **Next.js**로 모든 API를 통합하고, PM2를 사용하여 서버를 관리합니다.

## 🎯 주요 변경사항

✅ **Next.js로 통합**: 모든 API가 하나의 Next.js 서버로 통합되었습니다
- `/api/dashboard/status` - 대시보드 시스템 정보
- `/api/trade/*` - 거래 관련 모든 API
- `/dashboard` - 대시보드 페이지
- `/trade` - 거래 설정 페이지

✅ **Nginx 설정 간소화**: 이제 단일 서버만 프록시하면 됩니다

## 🚀 빠른 시작

### 1. 의존성 설치
```bash
npm install
```

### 2. Next.js 빌드
```bash
npm run build
```

### 3. PM2 설치 (아직 설치하지 않았다면)
```bash
npm install -g pm2
```

### 4. 서버 시작
```bash
chmod +x manage.sh
./manage.sh start
```

### 5. 재부팅 시 자동 시작 설정
```bash
pm2 startup
# 출력된 명령어를 복사해서 실행하세요
pm2 save
```

## 📋 서버 목록

- **nextjs-server**: Next.js 통합 서버 (포트 3000) - 모든 API와 페이지 포함
- **my-bot**: Firebase 봇 (백그라운드 프로세스)

## 🛠️ 관리 명령어

### 기본 명령어
```bash
./manage.sh start          # 모든 서버 시작
./manage.sh stop           # 모든 서버 중지
./manage.sh restart        # 모든 서버 재시작
./manage.sh status         # 서버 상태 확인
```

### 로그 확인
```bash
./manage.sh logs                    # 모든 서버 로그
./manage.sh logs nextjs-server      # Next.js 서버 로그만
./manage.sh logs my-bot             # 봇 로그만
```

### 특정 서버만 재시작
```bash
./manage.sh restart-one nextjs-server
./manage.sh restart-one my-bot
```

### 모니터링
```bash
./manage.sh monitor        # 실시간 모니터링 대시보드
./manage.sh info           # 상세 정보
```

## 🔍 문제 해결

### 서버가 죽었을 때
```bash
# 1. 상태 확인
./manage.sh status

# 2. 특정 서버만 재시작
./manage.sh restart-one [서버이름]

# 3. 로그 확인
./manage.sh logs [서버이름]
```

### 모든 서버 재시작
```bash
./manage.sh restart
```

### PM2 직접 사용
```bash
pm2 list                    # 프로세스 목록
pm2 restart all             # 모두 재시작
pm2 logs                    # 모든 로그
pm2 monit                   # 모니터링
pm2 describe nextjs-server  # Next.js 서버 정보
```

## 📝 Nginx 설정 (간소화됨!)

이제 **단일 Next.js 서버만** 프록시하면 됩니다!

### 간소화된 Nginx 설정 예시:

```nginx
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
```

### 기존 복잡한 설정 제거:
❌ 더 이상 필요 없음:
- `/api/` → `http://127.0.0.1:5050/api/` (제거)
- `/trade-api/` → `http://127.0.0.1:3000/` (제거)
- `/trade/` → 정적 파일 (제거)

✅ 이제 모든 것이 `/`로 통합됨:
- `/api/dashboard/status` - 대시보드 API
- `/api/trade/*` - 거래 API
- `/dashboard` - 대시보드 페이지
- `/trade` - 거래 설정 페이지

### Nginx 재시작
```bash
sudo nginx -t              # 설정 테스트
sudo systemctl restart nginx
```

## 🔄 서버 포트 변경 시

1. `ecosystem.config.js`에서 포트 변경 (기본: 3000)
2. nginx 설정 파일에서 포트 변경
3. 서버 재시작:
   ```bash
   ./manage.sh restart
   sudo systemctl restart nginx
   ```

## 📂 로그 위치

로그는 프로젝트 루트의 `logs/` 디렉토리에 저장됩니다:
- `logs/nextjs-error.log` - Next.js 서버 에러 로그
- `logs/nextjs-out.log` - Next.js 서버 출력 로그
- `logs/my-bot-error.log` - 봇 에러 로그
- `logs/my-bot-out.log` - 봇 출력 로그

## ⚙️ 설정 파일

- `ecosystem.config.js`: PM2 설정 파일
- `manage.sh`: 관리 스크립트

## 💡 팁

1. **서버 상태를 자주 확인**: `./manage.sh status`
2. **로그를 확인하여 문제 파악**: `./manage.sh logs`
3. **재부팅 후 자동 시작**: `pm2 startup` 설정 필수
4. **메모리 사용량 모니터링**: `./manage.sh monitor`

