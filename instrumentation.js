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
      // createRequire를 사용하여 CommonJS 모듈 로드
      const instrumentationRequire = createRequire(import.meta.url);
      const fs = instrumentationRequire('fs');
      
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
      
      // createRequire를 프로젝트 루트의 package.json 기준으로 생성
      // createRequire는 URL을 받아야 하므로 pathToFileURL로 변환
      const packageJsonPath = join(projectRoot, 'package.json');
      const packageJsonURL = pathToFileURL(packageJsonPath).href;
      const projectRequire = createRequire(packageJsonURL);
      console.log(`📁 [instrumentation] createRequire 생성 완료 (기준: ${packageJsonPath})`);
      
      // 상대 경로로 require (프로젝트 루트 기준)
      const relativePath = './trade-server/upbit-trade.js';
      console.log(`📁 [instrumentation] require 시도: ${relativePath} (프로젝트 루트: ${projectRoot})`);
      
      // require 시도
      const upbitTrade = projectRequire(relativePath);
      
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

