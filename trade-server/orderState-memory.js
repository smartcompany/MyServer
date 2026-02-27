// orderState 메모리 기반 관리 모듈 (CommonJS)
const fs = require('fs');
const path = require('path');

// 프로젝트 루트 찾기
function getProjectRoot() {
  const cwd = process.cwd();
  let currentDir = cwd;
  while (currentDir !== '/' && currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return cwd;
}

const projectRoot = getProjectRoot();
const orderStateFilePath = path.join(projectRoot, 'trade-server', 'orderState.json');

// 메모리에 orderState 유지 (전역 객체 사용 - ES6 모듈과 공유)
if (typeof global.orderStateMemory === 'undefined') {
  global.orderStateMemory = {
    orderState: null,
    saveTimer: null
  };
}
const SAVE_DELAY = 500; // 500ms debounce

// 초기화: 파일에서 로드
function initOrderState() {
  try {
    if (!fs.existsSync(orderStateFilePath)) {
      global.orderStateMemory.orderState = { orders: [], command: null, commandParams: null, tetherPrice: null };
      saveOrderStateToFile();
      return;
    }
    const data = fs.readFileSync(orderStateFilePath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed.orders)) {
      global.orderStateMemory.orderState = { orders: [], command: null, commandParams: null, tetherPrice: null };
    } else {
      global.orderStateMemory.orderState = {
        orders: parsed.orders || [],
        command: parsed.command || null,
        commandParams: parsed.commandParams || null,
        tetherPrice: parsed.tetherPrice || null
      };
    }
    console.log(`✅ [orderState-memory] 메모리 초기화 완료: ${global.orderStateMemory.orderState.orders.length}개 주문`);
  } catch (err) {
    console.error('❌ [orderState-memory] 초기화 실패:', err);
    global.orderStateMemory.orderState = { orders: [], command: null, commandParams: null };
  }
}

// 파일에 저장 (debounce)
function saveOrderStateToFile() {
  if (!global.orderStateMemory.orderState) return;
  
  try {
    fs.writeFileSync(orderStateFilePath, JSON.stringify(global.orderStateMemory.orderState, null, 2));
  } catch (err) {
    console.error('❌ [orderState-memory] 파일 저장 실패:', err);
  }
}

// 메모리에서 읽기
function getOrderState() {
  if (!global.orderStateMemory.orderState) {
    initOrderState();
  }
  return global.orderStateMemory.orderState;
}

// 메모리 업데이트 + 파일 저장 (debounce)
function updateOrderState(updater) {
  if (!global.orderStateMemory.orderState) {
    initOrderState();
  }
  
  // updater는 함수 또는 객체
  if (typeof updater === 'function') {
    global.orderStateMemory.orderState = updater(global.orderStateMemory.orderState);
  } else {
    global.orderStateMemory.orderState = { ...global.orderStateMemory.orderState, ...updater };
  }
  
  // debounce: 이전 타이머 취소하고 새로 설정
  if (global.orderStateMemory.saveTimer) {
    clearTimeout(global.orderStateMemory.saveTimer);
  }
  global.orderStateMemory.saveTimer = setTimeout(() => {
    saveOrderStateToFile();
    global.orderStateMemory.saveTimer = null;
  }, SAVE_DELAY);
}

// 즉시 파일에 저장 (중요한 변경 시)
function saveOrderStateImmediately() {
  if (global.orderStateMemory.saveTimer) {
    clearTimeout(global.orderStateMemory.saveTimer);
    global.orderStateMemory.saveTimer = null;
  }
  saveOrderStateToFile();
}

// 초기화 함수 (서버 시작 시 호출)
function initializeOrderState() {
  initOrderState();
}

// 초기화 실행
initializeOrderState();

module.exports = {
  getOrderState,
  updateOrderState,
  saveOrderStateImmediately,
  initializeOrderState
};

