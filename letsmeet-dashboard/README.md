# LetsMeet Bot Dashboard (Prototype)

로컬에서 봇 계정 선택, 시작/중지, 시뮬레이션 실행을 위한 Next.js 대시보드입니다.

## 기능
- Firebase 사용자 목록 조회(이메일, UID)
- `letsmeet_users` 프로필 정보 조인(이름/신뢰점수/활성여부)
- 봇 계정 선택 저장
- 봇 진행 시작/중지
- 수동 1회 실행(simulate)
- 실행 로그 확인

> 봇 상태/로그는 로컬 파일 `data/bot-state.json`에 저장됩니다.

## 실행

```bash
cd letsmeet-dashboard
npm install
cp .env.example .env.local
npm run dev
```

브라우저: `http://localhost:3100` (개발 시 basePath 미적용)

배포 시 basePath `/letsmeet-dashboard` 사용. 예: `https://smartzero.duckdns.org/letsmeet-dashboard`

## PM2 (라즈베리 파이 등 서버)

### RasberryHomeServer 루트에서 실행 (권장)

기존 호스트에 `/letsmeet-dashboard` 경로로 노출. 루트 `ecosystem.config.cjs`로 메인 서버 + 대시보드 + 시뮬레이터 동시 실행:

```bash
cd /path/to/RasberryHomeServer
npm run build                              # 메인 서버 빌드
cd letsmeet-dashboard && npm run build && cd ..     # 대시보드 빌드
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # 재부팅 시 자동 시작
```

접속: `https://your-host/letsmeet-dashboard`

### 대시보드 단독 실행

```bash
cd letsmeet-dashboard
npm run build
pm2 start ecosystem.config.cjs
```

- `letsmeet-dashboard`: Next.js (모니터링 UI + API, 포트 3100) - 시뮬레이터 폴링 포함 (instrumentation)

환경변수 `.env.local`에 `DASHBOARD_TOKEN` 필요.
basePath 배포 시 URL에 전체 경로 포함: `https://smartzero.duckdns.org/letsmeet-dashboard`

## 환경 변수

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON 문자열 또는 파일 경로)
- `OPENAI_API_KEY` (선택: 봇 모임 문구 AI 생성)
- `DASHBOARD_TOKEN` (필수: API/시뮬레이터 인증)

## API

- `GET /api/users` 사용자 목록
- `GET /api/bot-config` 봇 설정 조회
- `PUT /api/bot-config` 봇 설정 저장
- `POST /api/bot-control/start` 진행 시작
- `POST /api/bot-control/stop` 진행 중지
- `POST /api/bot-control/create-meeting` 선택된 봇 1명으로 모임 1건 실제 생성
- `POST /api/bot-control/simulate` runNow 트리거 (외부) 또는 tick 실행 (pm2 시뮬레이터 내부)
- `GET /api/bot-logs` 로그 조회

## GitHub Actions 크론 연계(다음 단계)

현재 설계 기준으로는, 크론에서 `POST /api/bot-control/simulate`를 주기 호출하면 됩니다.

예시 워크플로(개념):

```yaml
name: Bot Tick
on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:
jobs:
  run-tick:
    runs-on: ubuntu-latest
    steps:
      - name: call dashboard simulate
        run: |
          curl -X POST "https://your-dashboard-domain/api/bot-control/simulate"
```

다음 단계에서 보안 토큰 헤더(`x-dashboard-token`) 검증을 추가하는 것을 권장합니다.
# LetsMeetDashboard
