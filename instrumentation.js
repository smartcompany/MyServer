// Next.js 서버 시작 시 자동으로 실행되는 파일
// Next.js 13+ App Router에서 지원

export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    console.log('✅ Next.js 서버 시작 (instrumentation)');
     
    try {
      const path = await import('path');
      const fs = await import('fs');
      
      // 프로젝트 루트 찾기 (__dirname은 빌드된 위치이므로 process.cwd() 기준으로 탐색)
      let projectRoot = process.cwd();
      
      // 만약 .next 내부에서 실행 중이라면 루트로 이동
      if (projectRoot.includes('.next')) {
        projectRoot = projectRoot.split('.next')[0];
      }

      // 작업 디렉토리를 프로젝트 루트로 변경 (upbit-trade.js 내부 경로 해결을 위해)
      process.chdir(projectRoot);
      console.log(`📁 작업 디렉토리 설정: ${process.cwd()}`);

      const upbitTradePath = path.join(projectRoot, 'trade-server', 'upbit-trade.js');
      
      if (!fs.existsSync(upbitTradePath)) {
        console.error(`❌ upbit-trade.js 파일을 찾을 수 없습니다: ${upbitTradePath}`);
        return;
      }

      // Webpack 번들링을 피하기 위해 eval('require') 사용
      // 이렇게 하면 런타임에 실제 파일 시스템에서 모듈을 로드합니다.
      const nativeRequire = eval('require');
      const upbitTrade = nativeRequire(upbitTradePath);
      
      if (upbitTrade && typeof upbitTrade.start === 'function') {
        console.log('🚀 Upbit Trade 루프 시작 중...');
        upbitTrade.start();
      } else {
        console.error('❌ upbit-trade.js 모듈에 start 함수가 없습니다.');
      }
    } catch (error) {
      console.error('❌ instrumentation 등록 중 에러 발생:', error.message);
      console.error(error.stack);
    }  
}
