import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import fs from 'fs';

export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // config.json에서 isTrading 상태 확인
    const configFilePath = getTradeServerPath('config.json');
    let isTrading = false;
    
    if (fs.existsSync(configFilePath)) {
      const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      isTrading = config.isTrading || false;
    }

    // Next.js 서버가 실행 중이면 upbit-trade도 실행 중으로 간주
    // (instrumentation.ts에서 자동 시작되므로)
    return Response.json({
      upbitTrade: {
        status: 'integrated',
        running: true, // Next.js 서버 내부에서 실행 중
        isTrading: isTrading, // 실제 트레이딩 활성화 여부
        message: 'Next.js 서버 내부에서 실행 중입니다'
      }
    });
  } catch (error) {
    console.error('프로세스 상태 확인 실패:', error);
    return Response.json({ 
      upbitTrade: {
        status: 'unknown',
        running: false
      }
    });
  }
}

