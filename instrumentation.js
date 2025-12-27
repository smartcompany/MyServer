// Next.js 서버 시작 시 자동으로 실행되는 파일
// Next.js 13+ App Router에서 지원

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';

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
      const instrumentationRequire = createRequire(import.meta.url);
      const fs = instrumentationRequire('fs');
      
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
      
      // 작업 디렉토리를 프로젝트 루트로 변경
      process.chdir(projectRoot);
      console.log(`📁 [instrumentation] 변경 후 process.cwd(): ${process.cwd()}`);
      
      // 파일 경로 확인
      const upbitTradePath = join(projectRoot, 'trade-server', 'upbit-trade.js');
      console.log(`📁 [instrumentation] upbitTradePath: ${upbitTradePath}`);
      
      // 파일 존재 확인
      if (!fs.existsSync(upbitTradePath)) {
        throw new Error(`파일이 존재하지 않습니다: ${upbitTradePath}`);
      }
      
      // 파일 읽기 권한 확인
      try {
        fs.accessSync(upbitTradePath, fs.constants.R_OK);
      } catch (err) {
        throw new Error(`파일 읽기 권한이 없습니다: ${upbitTradePath}`);
      }
      
      console.log(`📁 [instrumentation] 파일 존재 확인: true`);
      console.log(`📁 [instrumentation] 파일 크기: ${fs.statSync(upbitTradePath).size} bytes`);
      
      // 절대 경로를 resolve로 정규화
      const resolvedPath = resolve(upbitTradePath);
      console.log(`📁 [instrumentation] resolve된 경로: ${resolvedPath}`);
      
      // 절대 경로를 URL로 변환
      const upbitTradeURL = pathToFileURL(resolvedPath).href;
      console.log(`📁 [instrumentation] import() 시도: ${upbitTradeURL}`);
      
      // dynamic import 사용 (Next.js/Webpack 환경에서 가장 안전함)
      // CommonJS 모듈을 import하면 module.exports가 default에 담깁니다.
      const upbitModule = await import(upbitTradeURL);
      const upbitTrade = upbitModule.default || upbitModule;
      
      console.log(`✅ [instrumentation] 모듈 로드 성공, 타입: ${typeof upbitTrade}`);

      if (upbitTrade && typeof upbitTrade.start === 'function') {
        console.log('🚀 Upbit Trade 루프 시작...');
        upbitTrade.start();
      } else {
        console.log('⚠️  upbit-trade.js 모듈에서 start 함수를 찾을 수 없습니다.');
        console.log('   upbitTrade 내용:', JSON.stringify(upbitTrade));
      }
    } catch (error) {
      console.error('❌ Upbit Trade 루프 시작 실패:', error);
      console.error('   에러 메시지:', error.message);
      console.error('   스택:', error.stack);
    }  
}
