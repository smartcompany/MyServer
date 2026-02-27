// orderState 파일 기반 관리 모듈
import fs from 'fs';
import { getTradeServerPath } from './utils';

const orderStateFilePath = getTradeServerPath('orderState.json');

const DEFAULT_STATE = {
  orders: [],
  command: null,
  commandParams: null,
  tetherPrice: null,
};

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

function readOrderStateFromFile() {
  try {
    if (!fs.existsSync(orderStateFilePath)) {
      fs.writeFileSync(orderStateFilePath, JSON.stringify(DEFAULT_STATE, null, 2));
      return { ...DEFAULT_STATE };
    }
    const data = fs.readFileSync(orderStateFilePath, 'utf8');
    const parsed = JSON.parse(data);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    };
  } catch (err) {
    console.error('❌ [orderState] 파일 읽기 실패:', err);
    return { ...DEFAULT_STATE };
  }
}

// 파일에 저장
function saveOrderStateToFile(state) {
  try {
    const cleanedState = removeNullValues(state);
    console.log('💾 [api][orderState] 파일 저장 시도', {
      path: orderStateFilePath,
      totalOrders: Array.isArray(cleanedState.orders) ? cleanedState.orders.length : 0,
      command: cleanedState.command,
      commandParams: cleanedState.commandParams,
    });
    fs.writeFileSync(orderStateFilePath, JSON.stringify(cleanedState, null, 2));
    console.log('✅ [api][orderState] 파일 저장 성공', {
      path: orderStateFilePath,
    });
  } catch (err) {
    console.error('❌ [api][orderState] 파일 저장 실패:', {
      path: orderStateFilePath,
      error: err.message,
    });
  }
}

// 파일에서 읽기
export function getOrderState() {
  return readOrderStateFromFile();
}

// 파일 읽고 → updater 적용 → 파일에 즉시 저장
export function updateOrderState(updater) {
  const current = readOrderStateFromFile();
  let next;
  if (typeof updater === 'function') {
    next = updater(current);
  } else {
    next = { ...current, ...updater };
  }
  saveOrderStateToFile(next);
}

// 초기화 함수 (서버 시작 시 호출)
export function initializeOrderState() {
  // 파일이 없으면 생성
  readOrderStateFromFile();
}

// CommonJS 지원 (upbit-trade.js에서 사용)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getOrderState,
    updateOrderState,
    initializeOrderState,
  };
}

