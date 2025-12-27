// Next.js 서버 시작 시 자동으로 실행되는 파일
// Next.js 13+ App Router에서 지원

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 서버 사이드에서만 실행
    try {
      // 프로젝트 루트로 작업 디렉토리 변경 (환경 변수 로딩을 위해)
      // instrumentation.js는 .next/server/에 있으므로 프로젝트 루트로 이동
      const projectRoot = join(__dirname, '../..');
      const originalCwd = process.cwd();
      
      console.log(`📁 현재 작업 디렉토리: ${originalCwd}`);
      console.log(`📁 프로젝트 루트: ${projectRoot}`);
      
      process.chdir(projectRoot);
      console.log(`📁 작업 디렉토리 변경: ${process.cwd()}`);
      
      // 환경 변수 확인 (디버깅)
      console.log(`🔑 UPBIT_ACC_KEY 존재: ${!!process.env.UPBIT_ACC_KEY}`);
      console.log(`🔑 UPBIT_SEC_KEY 존재: ${!!process.env.UPBIT_SEC_KEY}`);
      
      const upbitTrade = require('./trade-server/upbit-trade.js');
      
      if (upbitTrade && upbitTrade.start) {
        console.log('🚀 Upbit Trade 루프 시작...');
        upbitTrade.start();
      } else {
        console.log('⚠️  upbit-trade.js 모듈을 찾을 수 없거나 start 함수가 없습니다.');
        console.log('   upbitTrade:', upbitTrade);
      }
    } catch (error) {
      console.error('❌ Upbit Trade 루프 시작 실패:', error);
      console.error('   스택:', error.stack);
    }
  }
}

