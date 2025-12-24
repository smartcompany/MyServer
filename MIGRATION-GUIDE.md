# Next.js 통합 마이그레이션 가이드

## 🎯 변경 사항 요약

모든 API와 페이지가 **Next.js**로 통합되었습니다!

### 이전 구조 (복잡함)
- Flask 서버 (포트 5050) - 대시보드 API
- Express 서버 (포트 3000) - 거래 API
- 정적 HTML 파일들
- Nginx에서 여러 프록시 설정 필요

### 새로운 구조 (간단함)
- **단일 Next.js 서버 (포트 3000)** - 모든 것 포함
- Nginx는 단일 프록시만 필요

## 📋 API 경로 변경

### 대시보드 API
- 이전: `http://localhost:5050/api/status`
- 현재: `http://localhost:3000/api/dashboard/status`

### 거래 API
- 이전: `http://localhost:3000/login`
- 현재: `http://localhost:3000/api/trade/login`

- 이전: `http://localhost:3000/config`
- 현재: `http://localhost:3000/api/trade/config`

- 이전: `http://localhost:3000/logs`
- 현재: `http://localhost:3000/api/trade/logs`

- 이전: `http://localhost:3000/cashBalance`
- 현재: `http://localhost:3000/api/trade/cashBalance`

### 페이지 경로
- 이전: `/` (정적 파일)
- 현재: `/dashboard` (Next.js 페이지)

- 이전: `/trade/` (정적 파일)
- 현재: `/trade` (Next.js 페이지)

## 🚀 마이그레이션 단계

### 1. 의존성 설치
```bash
npm install
```

### 2. Next.js 빌드
```bash
npm run build
```

### 3. 기존 서버 중지
```bash
./manage.sh stop
# 또는
pm2 stop all
pm2 delete all
```

### 4. 새 서버 시작
```bash
./manage.sh start
```

### 5. Nginx 설정 업데이트

기존 nginx 설정을 다음과 같이 간소화:

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

**제거할 설정:**
- `location /api/` 블록 (더 이상 필요 없음)
- `location /trade-api/` 블록 (더 이상 필요 없음)
- `location /trade/` 정적 파일 블록 (더 이상 필요 없음)

### 6. Nginx 재시작
```bash
sudo nginx -t
sudo systemctl restart nginx
```

## 🔄 기존 코드 업데이트 필요

프론트엔드 코드에서 API 경로를 업데이트해야 합니다:

### JavaScript/HTML 파일
```javascript
// 이전
fetch('/trade-api/login', { ... })

// 현재
fetch('/api/trade/login', { ... })
```

### 대시보드
```javascript
// 이전
fetch('/api/status')

// 현재
fetch('/api/dashboard/status')
```

## ✅ 확인 사항

1. **서버 상태 확인**
   ```bash
   ./manage.sh status
   ```
   - `nextjs-server`가 실행 중이어야 함
   - `my-bot`이 실행 중이어야 함

2. **로그 확인**
   ```bash
   ./manage.sh logs nextjs-server
   ```

3. **페이지 접근 테스트**
   - `http://your-domain/dashboard` - 대시보드
   - `http://your-domain/trade` - 거래 설정
   - `http://your-domain/api/dashboard/status` - API 테스트

## 🐛 문제 해결

### 빌드 실패
```bash
# 의존성 재설치
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 포트 충돌
```bash
# 포트 3000이 사용 중인지 확인
lsof -i :3000

# ecosystem.config.js에서 포트 변경
```

### API 404 에러
- Nginx 설정이 올바른지 확인
- Next.js 서버가 실행 중인지 확인
- API 경로가 `/api/`로 시작하는지 확인

## 📝 참고

- 모든 API는 Next.js App Router의 `app/api/` 디렉토리에 있습니다
- 페이지는 `app/` 디렉토리에 있습니다
- 정적 파일은 `public/` 디렉토리에 배치할 수 있습니다

