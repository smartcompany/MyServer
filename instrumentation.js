// Next.js 서버 시작 시 자동으로 실행되는 파일
// Next.js 13+ App Router에서 지원

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 서버 사이드에서만 실행
    try {
      const upbitTrade = require('./trade-server/upbit-trade.js');
      
      if (upbitTrade && upbitTrade.start) {
        console.log('🚀 Upbit Trade 루프 시작...');
        upbitTrade.start();
      } else {
        console.log('⚠️  upbit-trade.js 모듈을 찾을 수 없거나 start 함수가 없습니다.');
      }
    } catch (error) {
      console.error('❌ Upbit Trade 루프 시작 실패:', error);
    }
  }
}

