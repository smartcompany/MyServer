import path from 'path';
import fs from 'fs';

// 프로젝트 루트 경로 찾기 (Next.js 빌드 환경에서도 올바른 경로 사용)
export function getProjectRoot() {
  const cwd = process.cwd();
  
  // .next가 경로에 있으면 프로젝트 루트로 이동
  if (cwd.includes('.next')) {
    const projectRoot = cwd.split('.next')[0];
    // 프로젝트 루트 확인 (package.json 또는 next.config.js 존재 여부)
    if (fs.existsSync(path.join(projectRoot, 'package.json')) || 
        fs.existsSync(path.join(projectRoot, 'next.config.js'))) {
      return projectRoot;
    }
  }
  
  // 현재 디렉토리에서 위로 올라가며 프로젝트 루트 찾기
  let currentDir = cwd;
  while (currentDir !== '/' && currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) || 
        fs.existsSync(path.join(currentDir, 'next.config.js'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  
  // 프로젝트 루트를 찾지 못한 경우 에러
  throw new Error(`프로젝트 루트를 찾을 수 없습니다. 현재 작업 디렉토리: ${cwd}`);
}

// trade-server 디렉토리의 파일 경로 생성
export function getTradeServerPath(filename) {
  const projectRoot = getProjectRoot();
  const filePath = path.join(projectRoot, 'trade-server', filename);
  return filePath;
}

