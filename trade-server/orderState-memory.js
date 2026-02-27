// orderState 파일 기반 관리 모듈 (CommonJS)
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

const DEFAULT_STATE = {
  orders: [],
  command: null,
  commandParams: null,
  tetherPrice: null,
};

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
    console.error('❌ [orderState-memory] 파일 읽기 실패:', err);
    return { ...DEFAULT_STATE };
  }
}

function writeOrderStateToFile(state) {
  try {
    fs.writeFileSync(orderStateFilePath, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('❌ [orderState-memory] 파일 저장 실패:', err);
  }
}

// 파일에서 읽기
function getOrderState() {
  return readOrderStateFromFile();
}

// 파일 읽고 → updater 적용 → 파일에 즉시 저장
function updateOrderState(updater) {
  const current = readOrderStateFromFile();
  let next;
  if (typeof updater === 'function') {
    next = updater(current);
  } else {
    next = { ...current, ...updater };
  }
  writeOrderStateToFile(next);
}

function initializeOrderState() {
  // 호출 시 파일이 없으면 생성
  readOrderStateFromFile();
}

module.exports = {
  getOrderState,
  updateOrderState,
  initializeOrderState,
};

