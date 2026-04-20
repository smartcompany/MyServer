// 필수 모듈 먼저 로드
const path = require('path');
const fs = require('fs');

console.log('📦 [upbit-trade] 모듈 로드 시작...');

// 프로젝트 루트: instrumentation.js에서 이미 process.chdir()로 설정했으므로 process.cwd() 사용
const projectRoot = process.cwd();

// 디버깅: 경로 정보 출력
console.log('🔍 [upbit-trade] 디버깅 정보:');
console.log(`   process.cwd(): ${process.cwd()}`);
console.log(`   .env 파일 경로: ${path.join(projectRoot, '.env')}`);
console.log(`   .env 파일 존재: ${fs.existsSync(path.join(projectRoot, '.env'))}`);

// 환경 변수 로드 전 상태
console.log(`   로드 전 UPBIT_ACC_KEY: ${process.env.UPBIT_ACC_KEY ? '존재' : '없음'}`);
console.log(`   로드 전 UPBIT_SEC_KEY: ${process.env.UPBIT_SEC_KEY ? '존재' : '없음'}`);

// 환경 변수 로드 (프로젝트 루트의 .env 파일 사용)
const envPath = path.join(projectRoot, '.env');
console.log(`🔍 .env 경로 확인: ${envPath}`);
const dotenv = require('dotenv');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.error(`   ❌ .env 파일 로드 실패: ${envResult.error.message}`);
} else {
  console.log(`   ✅ .env 파일 로드 성공`);
  if (envResult.parsed) {
    console.log(`   로드된 키 개수: ${Object.keys(envResult.parsed).length}`);
  }
}

const axios = require('axios');
const cheerio = require('cheerio');
const querystring = require('querystring');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const moment = require('moment-timezone');

// filepath: /path/to/file
// 업비트 API 키 설정
const ACCESS_KEY = process.env.UPBIT_ACC_KEY;
const SECRET_KEY = process.env.UPBIT_SEC_KEY; 

// 환경 변수 확인
console.log(`   로드 후 UPBIT_ACC_KEY: ${ACCESS_KEY ? `존재 (길이: ${ACCESS_KEY.length})` : '없음'}`);
console.log(`   로드 후 UPBIT_SEC_KEY: ${SECRET_KEY ? `존재 (길이: ${SECRET_KEY.length})` : '없음'}`);

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error('❌ 업비트 API 키가 설정되지 않았습니다.');
  console.error('   UPBIT_ACC_KEY와 UPBIT_SEC_KEY 환경 변수를 확인하세요.');
  console.error(`   프로젝트 루트: ${projectRoot}`);
  console.error(`   .env 파일 경로: ${envPath}`);
} 
const SERVER_URL = 'https://api.upbit.com';
const NAVER_EXCHANGE_RATE_URL = 'https://finance.naver.com/marketindex/exchangeDailyQuote.naver?marketindexCd=FX_USDKRW';

// projectRoot는 위에서 이미 정의됨
const tradeServerDir = path.join(projectRoot, 'trade-server');

const ordersFilePath = path.join(tradeServerDir, 'orderState.json');
const cashBalanceLogPath = path.join(tradeServerDir, 'cashBalance.json');
const configFilePath = path.join(tradeServerDir, 'config.json');
const logFilePath = path.join(tradeServerDir, 'trade-logs.txt');

// 로그 파일 최대 크기 (바이트). 넘으면 백업 후 새 파일 생성.
// 2MB 정도면 라즈베리파이에서도 무리 없이 읽을 수 있음.
const MAX_LOG_SIZE_BYTES = 2 * 1024 * 1024;

const backupLogsDir = path.join(tradeServerDir, 'backup_logs');

function rotateLogIfNeeded() {
  try {
    if (!fs.existsSync(logFilePath)) return;
    const stat = fs.statSync(logFilePath);
    if (!stat || typeof stat.size !== 'number') return;
    if (stat.size < MAX_LOG_SIZE_BYTES) return;

    if (!fs.existsSync(backupLogsDir)) {
      fs.mkdirSync(backupLogsDir, { recursive: true });
    }

    const ts = moment().tz('Asia/Seoul').format('YYYYMMDD_HHmmss');
    const backupPath = path.join(backupLogsDir, `trade-logs-${ts}.txt`);

    // 기존 로그 파일을 backup_logs 폴더로 이동
    fs.renameSync(logFilePath, backupPath);
  } catch (err) {
    // 로테이션 실패해도 서비스는 계속 진행
    originalError?.('❌ [upbit-trade][logRotate] 실패:', err.message);
  }
}

// log.js 대신 직접 로그 함수 구현 (경로 문제 해결)
const formatDate = () => {
  return moment().tz("Asia/Seoul").format("YYYY-MM-DD HH:mm:ss");
};

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const dateString = formatDate();
  const message = `[${dateString}] ${args.join(' ')}\n`;
  try {
    rotateLogIfNeeded();
    fs.appendFileSync(logFilePath, message);
  } catch (err) {
    // 로그 파일 쓰기 실패해도 계속 진행
  }
  originalLog(...args);
};

console.error = (...args) => {
  const dateString = formatDate();
  const message = `[${dateString}] ERROR : ${args.join(' ')}\n`;
  try {
    rotateLogIfNeeded();
    fs.appendFileSync(logFilePath, message);
  } catch (err) {
    // 로그 파일 쓰기 실패해도 계속 진행
  }
  originalError(...args);
};

const OrderType = {
  BUY: 'buy',
  SELL: 'sell',
};

// orderState 파일 경로: 이 파일과 동일한 trade-server 디렉토리 기준
const orderStateFilePath = path.join(__dirname, 'orderState.json');

const DEFAULT_ORDER_STATE = {
  orders: [],
  command: null,
  commandParams: null,
  tetherPrice: null,
};

function readOrderStateFromFile() {
  try {
    if (!fs.existsSync(orderStateFilePath)) {
      fs.writeFileSync(orderStateFilePath, JSON.stringify(DEFAULT_ORDER_STATE, null, 2));
      return { ...DEFAULT_ORDER_STATE };
    }
    const data = fs.readFileSync(orderStateFilePath, 'utf8');
    const parsed = JSON.parse(data);
    return {
      ...DEFAULT_ORDER_STATE,
      ...parsed,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    };
  } catch (err) {
    return { ...DEFAULT_ORDER_STATE };
  }
}

function writeOrderStateToFile(state) {
  try {
    fs.writeFileSync(orderStateFilePath, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('❌ [upbit-trade][orderState] 파일 저장 실패:', {
      path: orderStateFilePath,
      error: err.message,
    });
  }
}

function loadOrderState() {
  return readOrderStateFromFile();
}

function saveOrderState(state) {
  writeOrderStateToFile(state);
}

let cashBalance = loadCashBalance();

function loadCashBalance () {
  let cashData;
  
  try {
    const data = fs.readFileSync(cashBalanceLogPath, 'utf8');
    cashData = JSON.parse(data);
    // history가 없으면 초기화
    if (!cashData.history) {
      cashData.history = [];
    }
    if (cashData.total == null) {
      cashData.total = 0;
    }
  } catch (err) {
    console.error(err);
    cashData = { history: [], total: 0, availableMoney: 0, availableUsdt: 0 };
    fs.writeFileSync(cashBalanceLogPath, JSON.stringify(cashData, null, 2));
  }

  return cashData;
}

function saveCashBalance (balance) {
  fs.writeFileSync(cashBalanceLogPath, JSON.stringify(balance, null, 2));
}

function saveConfig(config) {
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
}

async function getAccountInfo() {
  const start = Date.now();
  try {
    // JWT 생성
    const payload = {
      access_key: ACCESS_KEY,
      nonce: uuid.v4(),
    };
    const token = jwt.sign(payload, SECRET_KEY);

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    const response = await axios.get(`${SERVER_URL}/v1/accounts`, { headers });
    const duration = Date.now() - start;
    //console.log('⏱️ [Upbit][getAccountInfo] 응답 시간(ms):', duration);

    if (response.status === 200) {
      return response.data;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - start;
    console.error('❌ [Upbit][getAccountInfo] 실패, duration(ms)=', duration, 'message=', error.message);
    return null;
  }
}

async function sellTether(price, volume) {
  const start = Date.now();
  try {
    // 지정가 매도 주문 데이터
    const orderData = {
      market: 'KRW-USDT', // 테더 시장
      side: 'ask',        // 매도
      // 주문 가격은 정수(원 단위)로 보냄
      price: Math.round(Number(price)),
      volume: Number(volume.toFixed(1)),     // 매도 수량 (USDT)
      ord_type: 'limit',  // 지정가 주문
    };

    const token = makeEncryptToken(orderData);
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    const response = await axios.post(`${SERVER_URL}/v1/orders`, orderData, { headers });
    const duration = Date.now() - start;

    if (response.status === 201) {
      console.log('지정가 매도 주문 성공:', response.data, '⏱️ duration(ms)=', duration);
      return response.data;
    } else {
      console.error(`❌ [Upbit][sellTether] 응답 에러: HTTP ${response.status}`, response.data, '⏱️ duration(ms)=', duration);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - start;
    console.error('❌ [Upbit][sellTether] 실패:', error.response?.data || error.message, '⏱️ duration(ms)=', duration);
    return null;
  }
}

async function buyTether(price, volume) {
  const start = Date.now();
  try {
    // 지정가 매수 주문 데이터
    const orderData = {
      market: 'KRW-USDT', // 테더 시장
      side: 'bid',        // 매수
      // 주문 가격은 정수(원 단위)로 보냄
      price: Math.round(Number(price)),
      volume: Number(volume.toFixed(1)),     // 매수 수량 (USDT)
      ord_type: 'limit',  // 지정가 주문
    };

    const token = makeEncryptToken(orderData);
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    const response = await axios.post(`${SERVER_URL}/v1/orders`, orderData, { headers });
    const duration = Date.now() - start;

    if (response.status === 201) {
      console.log('지정가 매수 주문 성공:', response.data, '⏱️ duration(ms)=', duration);
      return response.data;
    } else {
      console.error(`❌ [Upbit][buyTether] 응답 에러: HTTP ${response.status}`, response.data, '⏱️ duration(ms)=', duration);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - start;
    const errorData = error.response?.data;
    console.error('❌ [Upbit][buyTether] 실패 (401 등):', errorData || error.message, '⏱️ duration(ms)=', duration);
    return null;
  }
}

/**
 * 취소 후 재주문 API (가격/수량만 변경, 동일 주문 유지)
 * @param {string} prevOrderUuid - 취소할 주문 UUID
 * @param {{ new_ord_type: string, new_price: string, new_volume?: string }} params - new_ord_type, new_price 필수. new_volume 생략 시 'remain_only'
 * @returns {Promise<{ uuid: string, new_order_uuid: string, ... } | null>} 성공 시 응답 객체, 실패 시 null
 */
async function cancelAndNewOrder(prevOrderUuid, params) {
  const start = Date.now();
  try {
    const body = {
      prev_order_uuid: prevOrderUuid,
      new_ord_type: params.new_ord_type,
      new_price: params.new_price,
      new_volume: params.new_volume != null ? params.new_volume : 'remain_only',
    };

    console.log('[Upbit][cancelAndNewOrder] 요청 바디:', JSON.stringify(body));

    const token = makeEncryptToken(body);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const response = await axios.post(`${SERVER_URL}/v1/orders/cancel_and_new`, body, { headers });
    const duration = Date.now() - start;

    // Upbit 문서에는 201로 표기되어 있지만, 실제로는 200도 반환될 수 있으므로 둘 다 성공으로 처리
    if (response.status === 200 || response.status === 201) {
      console.log('[Upbit][cancelAndNewOrder] 취소 후 재주문 성공:', response.data?.new_order_uuid, '⏱️ duration(ms)=', duration);
      return response.data;
    }
    console.error(`❌ [Upbit][cancelAndNewOrder] 응답 에러: HTTP ${response.status}`, response.data, '⏱️ duration(ms)=', duration);
    return null;
  } catch (error) {
    const duration = Date.now() - start;
    const errorData = error.response?.data;
    console.error('❌ [Upbit][cancelAndNewOrder] 실패:', errorData || error.message, '⏱️ duration(ms)=', duration);
    if (errorData) {
      console.error('[Upbit][cancelAndNewOrder] 오류 응답 전체:', JSON.stringify(errorData));
    }
    return null;
  }
}

function makeEncryptToken(orderData) {
  const queryStr = querystring.encode(orderData);
  const queryHash = crypto.createHash('sha512').update(queryStr).digest('hex');

  // JWT 생성
  const payload = {
    access_key: ACCESS_KEY,
    nonce: uuid.v4(),
    query_hash: queryHash,
    query_hash_alg: 'SHA512',
  };
  const token = jwt.sign(payload, SECRET_KEY);
  return token;
}

// command 처리 함수 (clearAllOrders 또는 clearOrders)
async function handleCommand(orderState) {
  if (!orderState || !orderState.command) {
    //console.log('⏭️ [upbit-trade][handleCommand] 처리할 command 없음 → 바로 리턴');
    return;
  }

  switch (orderState.command) {
    case 'clearAllOrders':
      console.log('초기화 필요: 모든 주문 취소 시작');
      for (const order of orderState.orders) {
        if (order.status === 'buy_ordered' || order.status === 'sell_ordered') {
          await cancelOrder(order.uuid);
        }
      }
      orderState.orders = [];
      orderState.command = null;
      orderState.commandParams = null;
      saveOrderState(orderState);
      break;
      
    case 'clearOrders':
      const orderIdsToClear = orderState.commandParams;
            
      // commandParams에 지정된 주문 ID들만 취소 및 제거
      console.log(`commandParams: ${JSON.stringify(orderIdsToClear)}`);
      const ordersToCancel = [];
      for (const order of orderState.orders) {
        const isMatch = orderIdsToClear.includes(order.id);
        console.log(
          `ID 비교: order.id="${order.id}", orderIdsToClear.includes=${isMatch}, orderIdsToClear=${JSON.stringify(
            orderIdsToClear,
          )}`,
        );
        if (isMatch) {
          ordersToCancel.push(order);
        }
      }
      const successfullyCanceled = [];
      
      for (const order of ordersToCancel) {
        console.log(`주문 ${order.id} 취소/삭제 시작`);
        console.log(`주문 상태: ${order.status}`);
        console.log(`주문 UUID: ${order.uuid}`);
        let cancelResult = null;
        if (order.status === 'buy_ordered' || order.status === 'sell_ordered') {
          cancelResult = await cancelOrder(order.uuid);
        } else if (order.status === 'buy_pending' || order.status === 'sell_pending') {
          // Limit Order 전 상태: 거래소에 주문 없음 → API 호출 없이 리스트에서만 제거
          cancelResult = { removed: true };
        }
        
        // 취소 성공 또는 pending 제거인 경우만 제거 대상에 추가
        // cancelOrder는 성공 시 response.data 반환, 이미 취소된 경우 { uuid, state: 'done' } 반환, 실패 시 null 반환
        if (cancelResult != null) {
          successfullyCanceled.push(order.id);
        } else {
          console.log(`⚠️ [주문 ${order.id}] 주문 취소 실패 - orderState에서 제거하지 않음`);
        }
      }
      
      // 취소 성공한 주문들만 orderState에서 제거
      orderState.orders = orderState.orders.filter(o => !successfullyCanceled.includes(o.id));
      orderState.command = null;
      orderState.commandParams = null;
      saveOrderState(orderState);
      break;
      
    default:
      break;
  }
}

async function cancelOrder(orderedUuid) {
  const start = Date.now();
  try {
    console.log(`주문 취소 할 ID: ${orderedUuid}`);
    const queryData = {
      uuid: orderedUuid, // 취소할 주문의 UUID
    };

    const token = makeEncryptToken(queryData);
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    // 주문 취소 API 호출
    const response = await axios.delete(`${SERVER_URL}/v1/order`, {
      headers, 
      params: queryData
    });
    const duration = Date.now() - start;

    if (response.status === 200) {
      console.log('주문 취소 성공:', response.data, '⏱️ duration(ms)=', duration);
      return response.data;
    } else {
      console.error(`❌ [Upbit][cancelOrder] 응답 에러: HTTP ${response.status}`, response.data, '⏱️ duration(ms)=', duration);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - start;
    const errorData = error.response?.data;

    // 이미 취소된 주문이면 성공으로 간주하고 진행
    if (errorData?.error?.name === 'canceled_order') {
      console.log(`ℹ️ [upbit-trade] 이미 취소된 주문입니다. (ID: ${orderedUuid})`);
      return { uuid: orderedUuid, state: 'done' };
    }

    console.error('❌ [Upbit][cancelOrder] 실패 (401 등): duration(ms)=', duration);
    if (errorData) {
      console.error(`   Upbit 응답 상세: ${JSON.stringify(errorData)}`);
    } else {
      console.error(`   에러 메시지: ${error.message}`);
    }
    return null;
  }
}

async function checkOrderedData(orderedUuid) {
  const start = Date.now();
  try {
    console.log(`주문 상태 확인: ${orderedUuid}`);
    const queryData = {
      uuid: orderedUuid,
    };

    const token = makeEncryptToken(queryData);
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    const response = await axios.get(`${SERVER_URL}/v1/order`, {
      headers,
      params: queryData
    });
    const duration = Date.now() - start;

    if (response.status === 200) {
      //console.log('[Upbit][checkOrderedData] 주문 상태 확인 성공, ⏱️ duration(ms)=', duration);
      return response.data;
    } else {
      console.error(`❌ [Upbit][checkOrderedData] 응답 에러: HTTP ${response.status}`, response.data, '⏱️ duration(ms)=', duration);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - start;
    const errorData = error.response?.data;
    
    // 취소된 주문이거나 존재하지 않는 주문이면 cancel 상태로 반환
    if (errorData?.error?.name === 'canceled_order' || errorData?.error?.name === 'order_not_found') {
      console.log(`ℹ️ [checkOrderedData] 주문이 취소되었거나 존재하지 않습니다. (ID: ${orderedUuid}), ⏱️ duration(ms)=${duration}`);
      return { uuid: orderedUuid, state: 'cancel' };
    }
    
    console.error('❌ [Upbit][checkOrderedData] 실패:', error.message, '⏱️ duration(ms)=', duration);
    return null;
  }
}

async function getActiveOrders() {
  const start = Date.now();
  try {
    const payload = {
      access_key: ACCESS_KEY,
      nonce: uuid.v4(),
    };
    const token = jwt.sign(payload, SECRET_KEY);

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    // 활성화된 주문 조회 API 호출
    const response = await axios.get(`${SERVER_URL}/v1/orders`, { headers });
    const duration = Date.now() - start;

    if (response.status === 200) {
      //console.log('[Upbit][getActiveOrders] 활성 주문 조회 성공, ⏱️ duration(ms)=', duration);
      return response.data;
    } else {
      console.error(`❌ [Upbit][getActiveOrders] 응답 에러: HTTP ${response.status}`, response.data, '⏱️ duration(ms)=', duration);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - start;
    console.error('❌ [Upbit][getActiveOrders] 실패:', error.message, '⏱️ duration(ms)=', duration);
    return null;
  }
}

async function getExchangeRate() {
  try {
    // 네이버 환율 페이지에서 직접 스크래핑
    const response = await axios.get(`${NAVER_EXCHANGE_RATE_URL}&page=1`);
    if (response.status === 200) {
      const $ = cheerio.load(response.data);
      const rows = $('table.tbl_exchange tbody tr');
      
      // 첫 번째 행이 오늘 날짜의 최신 환율
      if (rows.length > 0) {
        const firstRow = rows.first();
        const tds = firstRow.find('td');
        const rateStr = $(tds[1]).text().trim().replace(/,/g, '');
        const rate = parseFloat(rateStr);
        
        if (!isNaN(rate)) {
          return rate;
        } else {
          console.error('Error: 환율 파싱 실패 - 숫자로 변환할 수 없음:', rateStr);
          return null;
        }
      } else {
        console.error('Error: 환율 데이터를 찾을 수 없음');
        return null;
      }
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching exchange rate:', error.message);
    return null;
  }
}

async function getTetherPrice() {
  try {
    // API 호출 URL
    const url = `${SERVER_URL}/v1/ticker`;

    // 요청 파라미터: 테더 시장 (KRW-USDT)
    const params = {
      markets: 'KRW-USDT',
    };

    // API 호출
    const response = await axios.get(url, { params });

    if (response.status === 200) {
      const tickerData = response.data[0]; // 첫 번째 데이터 (KRW-USDT)
      return tickerData.trade_price;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching Tether price:', error.message);
    return null;
  }
}

function formatNumber(num) {
  const formattedNum = floorToHalf(num);
  return formattedNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function floorToHalf(num) {
  return Math.floor(num * 2) / 2;
}

function needToCancelOrder(orderedData, expactedBuyPrice, expactedSellPrice) {
  if (orderedData.side === 'bid') { 
    if (orderedData.price == expactedBuyPrice) {
      console.log(`매수 대기 중 주문할 가격과 동일: ${orderedData.price}`);
      return false;
    } else {
      console.log(`매수 대기 중 주문할 가격 변동: ${orderedData.price} > ${expactedBuyPrice}`);
      return true;
    }
  }

  if (orderedData.side === 'ask') {
    if (orderedData.price == expactedSellPrice) {
      console.log(`매도 대기 중 주문할 가격과 동일: ${orderedData.price}`);
      return false;
    } else {
      console.log(`매도 대기 중 주문할 가격 변동: ${orderedData.price} > ${expactedSellPrice}`);
      return true;
    }
  }

  return false;
}

function setSellPending(order, volume, price) {
  order.status = 'sell_pending';
  order.volume = Number(volume);
  order.price = price != null ? Number(price) : null;
}

function setBuyPending(order, volume, price) {
  order.status = 'buy_pending';
  order.volume = Number(volume);
  order.price = price != null ? Number(price) : null;
}

function setSellOrdered(order, uuid, price, volume) {
  order.uuid = uuid;
  order.price = Number(price);
  order.volume = Number(volume);
  order.status = 'sell_ordered';
}

function setBuyOrdered(order, uuid, price, volume) {
  order.uuid = uuid;
  order.price = Number(price);
  order.volume = Number(volume);
  order.status = 'buy_ordered';
}

function loadConfig() {
  try {
    const data = fs.readFileSync(configFilePath, 'utf8');
    const config = JSON.parse(data);
    // 기본값 설정
    return config;
  } catch (err) {
    console.error('설정 파일 읽기 실패:', err);
    return {
      isTrading: false,
      buyThreshold: 0.5,
      sellThreshold: 2.5,
      isTradeByMoney: true
    };
  }
}


async function processBuyOrder(order, orderState, rate) {
  const cashBalance = loadCashBalance();
  const buyThreshold = order.buyThreshold;
  const sellThreshold = order.sellThreshold;
  if (buyThreshold == null || sellThreshold == null) {
    console.log(`[주문 ${order.id}] buyThreshold, sellThreshold 설정 없음`);
    return false; // 처리 실패
  }

  const expactedBuyPrice = Math.round(rate * (1 + buyThreshold / 100));
  const expactedSellPrice = Math.round(rate * (1 + sellThreshold / 100));
  

  const orderedData = await checkOrderedData(order.uuid);
  if (orderedData == null) {
    console.log(`[주문 ${order.id}] 주문 상태 확인 실패`);
    return false; // 처리 실패
  }

  switch (orderedData.state) {
    case 'done':
      // 매수 체결 → 매도 대기 상태로 전환
      console.log(`매수 주문 처리됨: ${orderedData.price}원, 수량: ${orderedData.volume} [주문 ${order.id}]`);
      
      // 테더 매도로 전환 (수량과 예상 매도 가격 전달)
      setSellPending(order, orderedData.volume, expactedSellPrice);

      cashBalance.history.push({ 
        type: 'buy',
        date: new Date(), 
        price: orderedData.price,
        volume: orderedData.volume 
      });
      saveCashBalance(cashBalance);
      saveOrderState(orderState);
      break;
    case 'cancel':
      // 외부에서 취소된 경우 주문 제거
      console.log(`[주문 ${order.id}] 주문이 외부에서 취소됨`);
      orderState.orders = orderState.orders.filter(o => o.id !== order.id);
      saveOrderState(orderState);
      break;
    case 'wait':
      // 부분 체결 로그 (전량 체결 시에는 'done'으로 처리되므로 여기선 대기 중이거나 일부만 체결된 경우)
      const buyExecuted = parseFloat(orderedData.executed_volume || 0);
      if (buyExecuted > 0) {
        console.log(`[주문 ${order.id}] 매수 부분 체결: ${buyExecuted}/${orderedData.volume} (대기 중)`);
      }

      // 가격 변동 체크 및 취소 필요 여부 확인 → 취소 없이 가격만 변경 (cancel_and_new)
      if (needToCancelOrder(orderedData, expactedBuyPrice, expactedSellPrice)) {
        const newPrice = Math.round(expactedBuyPrice);
        const cancelNewResponse = await cancelAndNewOrder(order.uuid, {
          new_ord_type: 'limit',
          new_price: String(newPrice),
          new_volume: 'remain_only',
        });
        if (cancelNewResponse && cancelNewResponse.new_order_uuid) {
          console.log(`[주문 ${order.id}] 가격 변동 반영 (cancel_and_new) → ${newPrice}원, 새 UUID: ${cancelNewResponse.new_order_uuid}`);
          order.uuid = cancelNewResponse.new_order_uuid;
          order.price = newPrice;
          saveOrderState(orderState);
        } else {
          console.log(`[주문 ${order.id}] cancel_and_new 실패`);
        }
      }
      break;
  }
  
  return true; // 처리 완료
}

async function processSellOrder(order, orderState, rate) {
  const cashBalance = loadCashBalance();
  const buyThreshold = order.buyThreshold;
  const sellThreshold = order.sellThreshold;
  
  if (buyThreshold == null || sellThreshold == null) {
    console.log(`[주문 ${order.id}] buyThreshold, sellThreshold 설정 없음`);
    return false; // 처리 실패
  }

  // 주문 가격은 정수(원 단위)로 맞춤
  const expactedBuyPrice = Math.round(rate * (1 + buyThreshold / 100));
  const expactedSellPrice = Math.round(rate * (1 + sellThreshold / 100));

  const orderedData = await checkOrderedData(order.uuid);
  if (orderedData == null) {
    console.log(`[주문 ${order.id}] 주문 상태 확인 실패`);
    return false; // 처리 실패
  }

  // 주문 상태: 'done' = 전량 체결 완료 시에만 매도 처리함. 부분 체결은 state가 'wait'으로 유지됨.
  switch (orderedData.state) {
    case 'done':
      // 매도 체결 → 완료 처리
      console.log(`[주문 ${order.id}] 매도 주문 처리됨: ${orderedData.price}원, 수량: ${orderedData.volume}`);
      // 매도 금액을 수량으로 변환하여 매수 (매도 금액 / 김프 계산 가격)
      // 매도 체결 금액 = orderedData.volume * orderedData.price
      // 이 금액으로 매수할 수량 = 매도 금액 / expactedBuyPrice (김프 계산 가격)
      const sellAmount = orderedData.volume * orderedData.price;  // 매도 금액
      const buyVolume = Math.floor(sellAmount / expactedBuyPrice);
      setBuyPending(order, buyVolume, expactedBuyPrice);

      cashBalance.history.push({ 
        type: 'sell',
        date: new Date(), 
        price: orderedData.price,
        volume: orderedData.volume 
      });
      saveCashBalance(cashBalance);
      saveOrderState(orderState);
      break;
    case 'cancel':
      // 외부에서 취소된 경우 주문 제거
      console.log(`[주문 ${order.id}] 주문이 외부에서 취소됨`);
      orderState.orders = orderState.orders.filter(o => o.id !== order.id);
      saveOrderState(orderState);
      break;
    case 'wait':
      // 부분 체결 로그 (전량 체결 시에는 'done'으로 처리되므로 여기선 대기 중이거나 일부만 체결된 경우)
      const sellExecuted = parseFloat(orderedData.executed_volume || 0);
      if (sellExecuted > 0) {
        console.log(`[주문 ${order.id}] 매도 부분 체결: ${sellExecuted}/${orderedData.volume} (대기 중)`);
      }

      // 가격 변동 체크 및 취소 필요 여부 확인 → 취소 없이 가격만 변경 (cancel_and_new)
      if (needToCancelOrder(orderedData, expactedBuyPrice, expactedSellPrice)) {
        try {
          const newPrice = Math.round(expactedSellPrice);
          console.log(`[주문 ${order.id}] 매도 가격 변경 시도 (cancel_and_new) → ${newPrice}원, 기존 UUID: ${order.uuid}`);
          const cancelNewResponse = await cancelAndNewOrder(order.uuid, {
            new_ord_type: 'limit',
            new_price: String(newPrice),
            new_volume: 'remain_only',
          });
          if (cancelNewResponse && cancelNewResponse.new_order_uuid) {
            console.log(`[주문 ${order.id}] 매도 가격 변동 반영 (cancel_and_new) → ${newPrice}원, 새 UUID: ${cancelNewResponse.new_order_uuid}`);
            order.uuid = cancelNewResponse.new_order_uuid;
            order.price = newPrice;
            saveOrderState(orderState);
          } else {
            console.log(`[주문 ${order.id}] 매도 cancel_and_new 실패 (응답 없음 또는 new_order_uuid 없음)`);
          }
        } catch (e) {
          console.error(`[주문 ${order.id}] 매도 cancel_and_new 호출 중 예외 발생:`, e.message);
        }
      }
      break;
  }
  
  return true; // 처리 완료
}

async function processPendingOrders(orderState, rate, tetherPrice) {
  for (const order of orderState.orders) {
    // 매도 대기 중인 주문에 대해 매도 주문 생성 (sell_pending → sell_ordered)
    const buyThreshold = order.buyThreshold;
    const sellThreshold = order.sellThreshold;

    if (buyThreshold == null || sellThreshold == null || tetherPrice == null) {
      console.log(`[주문 ${order.id}] 매수 또는 매도 기준 프리미엄 설정 없거나 테더 가격 없음`);
      return false; // 처리 실패
    }

    let expactedBuyPrice = Math.round(rate * (1 + buyThreshold / 100));
    let expactedSellPrice = Math.round(rate * (1 + sellThreshold / 100));
    
    // 매수 가격은 현재 테더 가격보다 낮아야 함 (현재가가 최고값)
    if (expactedBuyPrice > tetherPrice) {
      expactedBuyPrice = tetherPrice;
    }
    
    // 매도 가격은 현재 테더 가격보다 높아야 함 (현재가가 최저값)
    if (expactedSellPrice < tetherPrice) {
      expactedSellPrice = tetherPrice;
    }
    
    if (order.status === 'sell_pending') {
      // volume은 이미 수량으로 계산되어 있음
      const volumeToSell = order.volume;
      
      if (volumeToSell > 0) {
        console.log(`[주문 ${order.id}] 김치 ${sellThreshold.toFixed(1)}% 에, ${expactedSellPrice} 원에 ${volumeToSell} 매도 주문 걸기`);
        const sellOrder = await sellTether(expactedSellPrice, volumeToSell);
        if (sellOrder) {
          console.log(`[주문 ${order.id}] 매도 주문 성공, UUID: ${sellOrder.uuid}`);
          setSellOrdered(order, sellOrder.uuid, sellOrder.price, sellOrder.volume); 
          saveOrderState(orderState);
        }
      }
    }
    
    // 웹에서 추가한 매수 작업 처리 (buy_pending → buy_ordered)
    if (order.status === 'buy_pending') {
      // volume은 이미 수량으로 계산되어 있음
      const volumeToBuy = order.volume;
      
      if (volumeToBuy > 0) {
        console.log(`[주문 ${order.id}] 매수 주문 생성: 김치 ${buyThreshold.toFixed(1)}% 에, ${expactedBuyPrice} 원에 ${volumeToBuy} 매수 주문 걸기`);
        const buyOrder = await buyTether(expactedBuyPrice, volumeToBuy);
        if (buyOrder) {
          setBuyOrdered(order, buyOrder.uuid, buyOrder.price, buyOrder.volume); 
          console.log(`[주문 ${order.id}] 매수 주문 성공, UUID: ${buyOrder.uuid}`);
          saveOrderState(orderState);
        }
      }
    }
  }
}

// stopTradingTimes 체크 함수
function isInStopTradingTime(config) {
  if (!config.stopTradingTimes || !Array.isArray(config.stopTradingTimes) || config.stopTradingTimes.length === 0) {
    return false;
  }

  const now = moment().tz("Asia/Seoul");
  const currentTime = now.format("HH:mm:ss");
  const currentDate = now.format("YYYY-MM-DD");

  for (const timeRange of config.stopTradingTimes) {
    const startTime = timeRange.start;
    const endTime = timeRange.end;

    // endTime이 startTime보다 작으면 다음날까지 (예: 23:00-01:00)
    if (endTime < startTime) {
      // 현재 시간이 startTime 이후이거나 endTime 이전이면 중지 시간
      if (currentTime >= startTime || currentTime <= endTime) {
        return true;
      }
    } else {
      // 일반적인 경우 (예: 08:00-09:00)
      if (currentTime >= startTime && currentTime <= endTime) {
        return true;
      }
    }
  }

  return false;
}

// 계정 정보 및 시장 정보 로그 출력 함수
async function logAccountAndMarketInfo() {
  const accountInfo = await getAccountInfo();
  if (accountInfo) {
    console.log('========= 코인 및 현금 정보 ===========');
    accountInfo.forEach((asset) => {
      if (asset.currency !== 'KRW' && asset.currency !== 'USDT') {
        return; // KRW와 USDT를 제외한 다른 자산은 출력하지 않음
      }

      console.log(
        `종목: ${asset.currency}, 잔고: ${Number(asset.balance).toFixed(1)}, 평균 매수가: ${Number(asset.avg_buy_price).toFixed(1)}`
      );
    });
    console.log('-----------------------------------');

    const rate = await getExchangeRate();
    const tetherPrice = await getTetherPrice();

    // 김치 프리미엄 계산
    const kimchiPremium = ((tetherPrice - rate)/rate) * 100;

    console.log(`현재 테더: ${tetherPrice}원, 환율: ${rate}원, 김프: ${kimchiPremium.toFixed(2)}%`);
    
    return { accountInfo, rate, tetherPrice, kimchiPremium };
  }
  return null;
}

// 모든 활성 주문 취소 함수
async function cancelAllActiveOrders(orderState) {
  console.log('[거래 중지] 모든 활성 주문 취소 시작');
  
  const activeOrders = orderState.orders.filter(
    order => order.status === 'buy_ordered' || order.status === 'sell_ordered'
  );

  if (activeOrders.length === 0) {
    console.log('[거래 중지] 취소할 활성 주문이 없습니다');
    return;
  }

  console.log(`[거래 중지] ${activeOrders.length}개의 활성 주문 취소 중...`);
  
  let canceledCount = 0;
  
  for (const order of activeOrders) {
    try {
      console.log(`[거래 중지] 주문 ${order.id} 취소 중 (UUID: ${order.uuid})`);
      const cancelResult = await cancelOrder(order.uuid);
      
      if (cancelResult != null) {
        // 취소 성공 시 상태를 pending으로 되돌림 (재개 시 다시 주문을 걸 수 있도록)
        if (order.status === 'buy_ordered') {
          order.status = 'buy_pending';
          order.uuid = null; // UUID 제거 (새로운 주문을 걸 때 다시 생성됨)
          console.log(`[거래 중지] 주문 ${order.id} 취소 성공 → buy_pending 상태로 복원`);
        } else if (order.status === 'sell_ordered') {
          order.status = 'sell_pending';
          order.uuid = null; // UUID 제거 (새로운 주문을 걸 때 다시 생성됨)
          console.log(`[거래 중지] 주문 ${order.id} 취소 성공 → sell_pending 상태로 복원`);
        }
        canceledCount++;
      } else {
        console.log(`[거래 중지] 주문 ${order.id} 취소 실패`);
      }
    } catch (error) {
      console.error(`[거래 중지] 주문 ${order.id} 취소 중 에러:`, error.message);
    }
  }

  // 상태 변경사항 저장
  saveOrderState(orderState);
  
  console.log(`[거래 중지] 주문 취소 완료: ${canceledCount}/${activeOrders.length}개 주문 취소 성공 (pending 상태로 복원됨)`);
}

async function trade() {
  const prevConfig = loadConfig();
  const config = loadConfig();

  let orderState = loadOrderState();
  
  if (prevConfig.isTrading == true) {
    if (config.isTrading == false) {
      console.log('트레이딩 중지');
    }
  } else {
    if (config.isTrading == true) {
      console.log('트레이딩 시작');
    }
  }

  if (config.isTrading == false) { 
    return; 
  }

  // stopTradingTimes 체크
  if (isInStopTradingTime(config)) {
    // 중지 시간대: 계정 및 시장 정보 로그 출력
    console.log('⏸️ [거래 중지 시간대] 거래가 중지된 시간대입니다.');
    await logAccountAndMarketInfo();
    
    // 중지 시간대: 모든 활성 주문 취소
    const hasActiveOrders = orderState.orders.some(
      order => order.status === 'buy_ordered' || order.status === 'sell_ordered'
    );
    
    if (hasActiveOrders) {
      await cancelAllActiveOrders(orderState);
    }
    
    console.log('중지 시간대에는 거래 로직 실행하지 않음');
    return;
  }

  // command 처리 (clearAllOrders 또는 clearOrders)
  await handleCommand(orderState);

  // 계정 정보 및 시장 정보 로그 출력
  const marketInfo = await logAccountAndMarketInfo();
  if (!marketInfo) {
    return;
  }
  
  const { accountInfo, rate, tetherPrice, kimchiPremium } = marketInfo;

  // 다중 주문 처리: 각 주문의 상태 확인 및 업데이트
  for (const order of orderState.orders) {
    // 매수 주문 대기 중인 주문 체크 (업비트에 주문 넣은 상태)
    if (order.status === 'buy_ordered') {
      await processBuyOrder(order, orderState, rate);
      continue; // 다음 주문으로
    }

    // 매도 주문 대기 중인 주문 체크 (업비트에 주문 넣은 상태)
    if (order.status === 'sell_ordered') {
      await processSellOrder(order, orderState, rate);
      continue; // 다음 주문으로
    }
  }

  updateCashBalnce(orderState, accountInfo, tetherPrice);

  // 매도 대기 또는 매수 대기 주문 처리 (sell_pending → sell_ordered, buy_pending → buy_ordered)
  await processPendingOrders(orderState, rate, tetherPrice);

  // 현재 테더 가격을 orderState에 저장 (요약/웹에서 재사용)
  orderState.tetherPrice = tetherPrice;
  saveOrderState(orderState);
}

function updateCashBalnce(orderState, accountInfo, tetherPrice) {
  let isUpdated = false;

  const krwAccount = accountInfo.find(asset => asset.currency === 'KRW');
  const usdtAccount = accountInfo.find(asset => asset.currency === 'USDT');

  // KRW 또는 USDT 계정이 없으면 0으로 처리하고 계속 진행
  const availableMoney = krwAccount ? parseFloat(krwAccount.balance) : 0;
  const availableUsdt = usdtAccount ? parseFloat(usdtAccount.balance) : 0;

  if (krwAccount == null) {
    console.log('[updateCashBalnce] KRW 계정이 없습니다. 0원으로 처리합니다.');
  }
  if (usdtAccount == null) {
    console.log('[updateCashBalnce] USDT 계정이 없습니다. 0으로 처리합니다.');
  }

  const buyWaitingAmount = orderState.orders
        .filter(o => o.status === 'buy_pending' || o.status === 'buy_ordered')
        .reduce((sum, order) => {
          if (order.status === 'buy_ordered' && order.price) {
            // buy_ordered 상태이고 price가 있으면 volume * price
            return sum + ((order.volume || 0) * order.price);
          } else if (order.status === 'buy_pending' && order.buyThreshold != null && tetherPrice) {
            // buy_pending 상태일 때는 예상 가격 계산 (volume * expactedBuyPrice)
            const expactedBuyPrice = Math.round(tetherPrice * (1 + order.buyThreshold / 100));
            return sum + ((order.volume || 0) * expactedBuyPrice);
          }
          return sum;
        }, 0);
  
  const krwBalance = availableMoney + buyWaitingAmount;

  // 매도 대기 중인 주문들의 테더 합계 계산 - pending과 ordered 모두 포함
  const sellWaitingOrders = orderState.orders.filter(o => o.status === 'sell_pending' || o.status === 'sell_ordered');
  const sellWaitingUsdt = sellWaitingOrders.reduce((sum, order) => {
    // volume은 항상 수량
    return sum + (parseFloat(order.volume) || 0);
  }, 0);
  const usdtBalance = availableUsdt + sellWaitingUsdt;

  // 전체 원화 평가 금액
  if (cashBalance.krwBalance != krwBalance) {
    cashBalance.krwBalance = krwBalance;
    isUpdated = true;
  }

  // 전체 테더 평가 금액
  if (cashBalance.usdtBalance != usdtBalance) {
    cashBalance.usdtBalance = usdtBalance;
    isUpdated = true;
  }
  
  // 매수 가능 현금 잔액
  if (cashBalance.availableMoney != availableMoney) {
    cashBalance.availableMoney = availableMoney;
    isUpdated = true;
  }
   
  // 매도 가능 테더 잔액
  if (cashBalance.availableUsdt != availableUsdt) {
    cashBalance.availableUsdt = availableUsdt;
    isUpdated = true;
  }
  
  if (isUpdated) {
    saveCashBalance(cashBalance);
  }
}

async function getActiveOrder(uuid) {
  console.log(`활성화된 주문 UUID 찾기: ${uuid}`);
  const orders = await getActiveOrders();
  let activeOrder = null;
  if (orders) {
    console.log('현재 활성화된 주문:');
    orders.forEach((order) => {
      let orderType = "";
      if (order.side == 'bid')
        orderType = "매수";
      else if (order.side == 'ask')
        orderType = "매도";

      console.log(`주문 UUID: ${order.uuid}, ${orderType} 상태: ${order.state}, 가격: ${order.price}, 수량: ${order.volume}`);
      // 주문 상태 재차 확인 
      if (order.uuid === uuid) {
        activeOrder = order;
      }
    });
  }

  console.log(`활성화된 테스트 주문: ${activeOrder ? activeOrder.uuid : '없음'}`);
  return activeOrder;
}

let tradeLoopInterval = null;
let isLoopRunning = false;

async function loop() {
  console.log('upbit-trade loop 시작');
  while (true) {
    try {
      await trade();
    } catch (e) {
      console.error('Loop error:', e);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000)); // 3초 대기 (config/삭제 반영 속도)

  }
}

// 모듈로 export하여 Next.js에서 사용 가능하도록
// 항상 module.exports를 설정 (createRequire 사용 시 require.main 판정이 부정확할 수 있음)
const upbitTradeModule = {
  start: () => {
    if (!isLoopRunning) {
      isLoopRunning = true;
      console.log('✅ [upbit-trade] 트레이딩 루프 시작 요청');
      loop();
    } else {
      console.log('ℹ️ [upbit-trade] 트레이딩 루프가 이미 실행 중입니다.');
    }
  },
  stop: () => {
    isLoopRunning = false;
    console.log('🛑 [upbit-trade] 트레이딩 루프 중지 요청');
  },
  trade: trade,
  loop: loop,
  getTetherPrice: getTetherPrice
};

module.exports = upbitTradeModule;
console.log('✅ [upbit-trade] module.exports 설정 완료');

// 직접 실행 시에만 루프 시작 (Node.js에서 단독 실행할 때만 적용)
if (typeof require !== 'undefined' && require.main === module) {
  loop();
}

//main();
