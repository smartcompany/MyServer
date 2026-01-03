// orderState 메모리 기반 관리 모듈
import fs from 'fs';
import { getTradeServerPath } from './utils';

const orderStateFilePath = getTradeServerPath('orderState.json');

// 전역 메모리 객체 (CommonJS 모듈과 공유)
if (typeof global.orderStateMemory === 'undefined') {
  global.orderStateMemory = {
    orderState: null,
    saveTimer: null
  };
}

// 메모리에 orderState 유지 (전역 객체 사용)
const SAVE_DELAY = 500; // 500ms debounce

// 초기화: 파일에서 로드
function initOrderState() {
  try {
    if (!fs.existsSync(orderStateFilePath)) {
      global.orderStateMemory.orderState = { orders: [], command: null, commandParams: null };
      saveOrderStateToFile();
      return;
    }
    const data = fs.readFileSync(orderStateFilePath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed.orders)) {
      global.orderStateMemory.orderState = { orders: [], command: null, commandParams: null };
    } else {
      global.orderStateMemory.orderState = {
        orders: parsed.orders || [],
        command: parsed.command || null,
        commandParams: parsed.commandParams || null
      };
    }
    console.log(`✅ [orderState] 메모리 초기화 완료: ${global.orderStateMemory.orderState.orders.length}개 주문`);
  } catch (err) {
    console.error('❌ [orderState] 초기화 실패:', err);
    global.orderStateMemory.orderState = { orders: [], command: null, commandParams: null };
  }
}

// null 값을 제거하는 함수 (재귀적으로 객체와 배열 처리)
function removeNullValues(obj) {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeNullValues(item)).filter(item => item !== undefined);
  }
  
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = removeNullValues(obj[key]);
        if (value !== undefined && value !== null) {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }
  
  return obj;
}

// 파일에 저장 (debounce)
function saveOrderStateToFile() {
  if (!global.orderStateMemory.orderState) return;
  
  try {
    // null 값을 제거한 후 저장
    const cleanedState = removeNullValues(global.orderStateMemory.orderState);
    fs.writeFileSync(orderStateFilePath, JSON.stringify(cleanedState, null, 2));
  } catch (err) {
    console.error('❌ [orderState] 파일 저장 실패:', err);
  }
}

// 메모리에서 읽기
export function getOrderState() {
  if (!global.orderStateMemory.orderState) {
    initOrderState();
  }
  return global.orderStateMemory.orderState;
}

// 메모리 업데이트 + 파일 저장 (debounce)
export function updateOrderState(updater) {
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
export function saveOrderStateImmediately() {
  if (global.orderStateMemory.saveTimer) {
    clearTimeout(global.orderStateMemory.saveTimer);
    global.orderStateMemory.saveTimer = null;
  }
  saveOrderStateToFile();
}

// 초기화 함수 (서버 시작 시 호출)
export function initializeOrderState() {
  initOrderState();
}

// 초기화 실행
initializeOrderState();

// CommonJS 지원 (upbit-trade.js에서 사용)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getOrderState,
    updateOrderState,
    saveOrderStateImmediately,
    initializeOrderState
  };
}

