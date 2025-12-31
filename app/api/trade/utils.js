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

// orderState.json에 초기화 플래그 설정 (모든 주문 취소)
export function needInitForOrderState() {
  const orderStateFilePath = getTradeServerPath('orderState.json');
  if (fs.existsSync(orderStateFilePath)) {
    const data = fs.readFileSync(orderStateFilePath, 'utf8');
    let orderState = JSON.parse(data);
    orderState.command = 'clearAllOrders';
    orderState.commandParams = null;
    fs.writeFileSync(orderStateFilePath, JSON.stringify(orderState, null, 2));
  }
}

// orderState.json에 선택 주문 취소 명령 설정
export function clearOrders(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new Error('주문 ID 배열이 필요합니다');
  }
  
  const orderStateFilePath = getTradeServerPath('orderState.json');
  if (!fs.existsSync(orderStateFilePath)) {
    throw new Error('orderState.json 파일을 찾을 수 없습니다');
  }
  
  const data = fs.readFileSync(orderStateFilePath, 'utf8');
  let orderState = JSON.parse(data);
  orderState.command = 'clearOrders';
  orderState.commandParams = orderIds;
  fs.writeFileSync(orderStateFilePath, JSON.stringify(orderState, null, 2));
}

