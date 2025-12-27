// Next.js 서버 시작 시 자동으로 실행되는 파일
// Next.js 13+ App Router에서 지원

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        console.log('❌ Next.js 서버 시작 실패');
        return;
    }

    console.log('✅ Next.js 서버 시작');
     
    // 서버 사이드에서만 실행
    try {
      // 프로젝트 루트 찾기: instrumentation.js는 .next/server/에 있으므로
      // .next 디렉토리를 찾아서 그 부모를 프로젝트 루트로 사용
      const fs = require('fs');
      
      // 프로젝트 루트 찾기: instrumentation.js는 .next/server/에 있으므로
      // .next 디렉토리를 찾아서 그 부모를 프로젝트 루트로 사용
      let projectRoot = __dirname;
      const parts = projectRoot.split('/');
      const nextIndex = parts.findIndex(part => part === '.next');
      
      if (nextIndex > 0) {
        // .next 디렉토리의 부모가 프로젝트 루트
        projectRoot = parts.slice(0, nextIndex).join('/');
      } else {
        // .next가 없으면 __dirname에서 위로 올라가며 찾기
        while (projectRoot !== '/' && projectRoot !== dirname(projectRoot)) {
          if (fs.existsSync(join(projectRoot, 'package.json')) || 
              fs.existsSync(join(projectRoot, 'next.config.js'))) {
            break;
          }
          projectRoot = dirname(projectRoot);
        }
      }
      
      console.log(`📁 [instrumentation] __dirname: ${__dirname}`);
      console.log(`📁 [instrumentation] 찾은 projectRoot: ${projectRoot}`);
      
      // 절대 경로로 require (빌드 시 복사되지 않으므로 원본 파일을 직접 로드)
      const upbitTradePath = join(projectRoot, 'trade-server', 'upbit-trade.js');
      console.log(`📁 [instrumentation] upbitTradePath: ${upbitTradePath}`);
      const upbitTrade = require(upbitTradePath);
      
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

