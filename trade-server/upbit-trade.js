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
const EXCHANGE_RATE_URL = 'https://rate-history.vercel.app/api/rate-history';

// projectRoot는 위에서 이미 정의됨
const tradeServerDir = path.join(projectRoot, 'trade-server');

const ordersFilePath = path.join(tradeServerDir, 'orderState.json');
const cashBalanceLogPath = path.join(tradeServerDir, 'cashBalance.json');
const configFilePath = path.join(tradeServerDir, 'config.json');
const logFilePath = path.join(tradeServerDir, 'trade-logs.txt');

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
    fs.appendFileSync(logFilePath, message);
  } catch (err) {
    // 로그 파일 쓰기 실패해도 계속 진행
  }
  originalLog(...args);
};

console.error = (...args) => {
  const dateString = formatDate();
  const message = `[${dateString}] ERROR: ${args.join(' ')}\n`;
  try {
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

let cashBalance = loadCashBalance();

function loadOrderState() {
  try {
    if (!fs.existsSync(ordersFilePath)) {
      fs.writeFileSync(ordersFilePath, JSON.stringify({ orders: [], command: null }, null, 2));
    }
    const data = fs.readFileSync(ordersFilePath, 'utf8');
    const parsed = JSON.parse(data);
    
    // orders 배열이 없으면 초기화
    if (!Array.isArray(parsed.orders)) {
      return { orders: [], command: null };
    }
    
    return parsed;
  } catch (err) {
    console.error(err);
    return { orders: [], command: null };
  }
}

function saveOrderState(state) {
  fs.writeFileSync(ordersFilePath, JSON.stringify(state));
}

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
  // history가 없으면 초기화
  if (!balance.history) {
    balance.history = [];
  }
  if (balance.total == null) {
    balance.total = 0;
  }
  fs.writeFileSync(cashBalanceLogPath, JSON.stringify(balance, null, 2));
}

function saveConfig(config) {
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
}

async function getAccountInfo() {
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

    if (response.status === 200) {
      return response.data;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching account info:', error.message);
    return null;
  }
}

async function sellTether(price, volume) {
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

    if (response.status === 201) {
      console.log('지정가 매도 주문 성공:', response.data);
      return response.data;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error('Error placing limit sell order:', error.response?.data || error.message);
    return null;
  }
}

async function buyTether(price, volume) {
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

    if (response.status === 201) {
      //console.log('지정가 매수 주문 성공:', response.data);
      return response.data;
    } else {
      console.error(`❌ 매수 주문 API 응답 에러: HTTP ${response.status}`, response.data);
      return null;
    }
  } catch (error) {
    const errorData = error.response?.data;
    console.error('❌ 매수 주문 실패 (401 등):');
    if (errorData) {
      console.error(`   Upbit 응답 상세: ${JSON.stringify(errorData)}`);
    } else {
      console.error(`   에러 메시지: ${error.message}`);
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
  switch (orderState.command) {
    case 'clearAllOrders':
      console.log('초기화 필요: 모든 주문 취소 시작');
      for (const order of orderState.orders) {
        if (order.status === 'buy_ordered') {
          await cancelOrder(order.buyUuid);
        } else if (order.status === 'sell_ordered') {
          await cancelOrder(order.sellUuid);
        }
      }
      orderState.orders = [];
      orderState.command = null;
      orderState.commandParams = null;
      saveOrderState(orderState);
      console.log('모든 주문 취소 완료');
      break;
      
    case 'clearOrders':
      console.log('선택 주문 취소 시작');
      const orderIdsToClear = orderState.commandParams;
      if (!Array.isArray(orderIdsToClear) || orderIdsToClear.length === 0) {
        console.log('⚠️ clearOrders 명령에 유효한 주문 ID가 없습니다.');
        orderState.command = null;
        orderState.commandParams = null;
        saveOrderState(orderState);
        break;
      }
      
      // commandParams에 지정된 주문 ID들만 취소 및 제거
      const ordersToCancel = orderState.orders.filter(o => orderIdsToClear.includes(o.id));
      for (const order of ordersToCancel) {
        if (order.status === 'buy_ordered') {
          await cancelOrder(order.buyUuid);
        } else if (order.status === 'sell_ordered') {
          await cancelOrder(order.sellUuid);
        }
      }
      
      // 취소한 주문들을 orderState에서 제거
      orderState.orders = orderState.orders.filter(o => !orderIdsToClear.includes(o.id));
      orderState.command = null;
      orderState.commandParams = null;
      saveOrderState(orderState);
      console.log(`선택 주문 취소 완료: ${ordersToCancel.length}개 주문`);
      break;
      
    default:
      break;
  }
}

async function cancelOrder(orderedUuid) {
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

    if (response.status === 200) {
      //console.log('주문 취소 성공:', response.data);
      return response.data;
    } else {
      console.error(`❌ 주문 취소 API 응답 에러: HTTP ${response.status}`, response.data);
      return null;
    }
  } catch (error) {
    const errorData = error.response?.data;

    // 이미 취소된 주문이면 성공으로 간주하고 진행
    if (errorData?.error?.name === 'canceled_order') {
      console.log(`ℹ️ [upbit-trade] 이미 취소된 주문입니다. (ID: ${orderedUuid})`);
      return { uuid: orderedUuid, state: 'done' };
    }

    console.error('❌ 주문 취소 실패 (401 등):');
    if (errorData) {
      console.error(`   Upbit 응답 상세: ${JSON.stringify(errorData)}`);
    } else {
      console.error(`   에러 메시지: ${error.message}`);
    }
    return null;
  }
}

async function checkOrderedData(orderedUuid) {
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

    if (response.status === 200) {
      //console.log('주문 상태 확인 성공:', JSON.stringify(response.data));
      return response.data;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error('Error checking ordered data:', error.message);
    return null;
  }
}

async function getActiveOrders() {
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

    if (response.status === 200) {
      return response.data;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching active orders:', error.message);
    return null;
  }
}

async function getExchangeRate() {
  try {
    // API 호출
    const response = await axios.get(EXCHANGE_RATE_URL);
    if (response.status === 200) {
      // 날짜가 가장 최근인 환율을 찾기 response.data의 key는 날짜 형식
      const latestDate = Object.keys(response.data).sort().pop();
      const latestRate = response.data[latestDate];
      return latestRate;
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

function needToCancelOrder(orderedData, expactedBuyPrice, expactedSellPrice, config, allocatedAmount) {

  if (orderedData.side === 'bid') { 
    const volume = calcuratedVolume(config.isTradeByMoney, expactedBuyPrice, allocatedAmount);
    if (parseFloat(orderedData.volume) != parseFloat(volume)) {
      console.log(`매수 일 경우 주문할 수량이 다르면 취소: 주문 물량 ${volume}, 대기 물량 ${orderedData.volume}`);
      return true;
    }
  }

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

function calcuratedVolume(isTradeByMoney, targetUSDTPrice, avaliableMoney) {
  if (isTradeByMoney == false) {
    return tradeAmount;
  }

  let volume = avaliableMoney / targetUSDTPrice;
  // 소숫점 이하 절삭 (정수 수량으로 주문)
  volume = Math.floor(volume);
  return volume;
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
      tradeAmount: 100000,
      buyThreshold: 0.5,
      sellThreshold: 2.5,
      isTradeByMoney: true
    };
  }
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

  // 기존 상태 네이밍 마이그레이션 (buy_waiting/sell_waiting → buy_pending/buy_ordered/sell_pending/sell_ordered)
  let needsMigration = false;
  if (Array.isArray(orderState.orders)) {
    for (const order of orderState.orders) {
      if (order.status === 'buy_waiting') {
        order.status = order.buyUuid ? 'buy_ordered' : 'buy_pending';
        needsMigration = true;
      } else if (order.status === 'sell_waiting') {
        order.status = order.sellUuid ? 'sell_ordered' : 'sell_pending';
        needsMigration = true;
      }
    }
    if (needsMigration) {
      saveOrderState(orderState);
      console.log('✅ 상태 네이밍 마이그레이션 완료');
    }
  }

  // command 처리 (clearAllOrders 또는 clearOrders)
  await handleCommand(orderState);

  const buyThreshold = config.buyThreshold ?? 0.5;  
  const sellThreshold = config.sellThreshold ?? 2.5;

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

    // 주문 가격은 정수(원 단위)로 맞춤
    const expactedBuyPrice = Math.round(rate * (1 + buyThreshold / 100));
    const expactedSellPrice = Math.round(rate * (1 + sellThreshold / 100));

    // 김치 프리미엄 계산
    const kimchiPremium = ((tetherPrice - rate)/rate) * 100;

    // 다중 주문 처리: 각 주문의 상태 확인 및 업데이트
    for (const order of orderState.orders) {
      // 매수 주문 대기 중인 주문 체크 (업비트에 주문 넣은 상태)
      if (order.status === 'buy_ordered') {
        const orderedData = await checkOrderedData(order.buyUuid);
        if (orderedData == null) {
          console.log(`[주문 ${order.id}] 주문 상태 확인 실패`);
          continue;
        }

        switch (orderedData.state) {
          case 'done':
            // 매수 체결 → 매도 대기 상태로 전환
            console.log(`[주문 ${order.id}] 매수 주문 처리됨: ${orderedData.price}원, 수량: ${orderedData.volume}`);
            order.status = 'sell_pending';
            order.buyPrice = orderedData.price;
            order.volume = parseFloat(orderedData.volume);
            // sellThreshold가 없으면 현재 config에서 가져와서 저장
            if (order.sellThreshold == null) {
              order.sellThreshold = sellThreshold;
            }

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
            // 가격 변동 체크 및 취소 필요 여부 확인
            if (needToCancelOrder(orderedData, expactedBuyPrice, expactedSellPrice, config, order.allocatedAmount || 0)) {
              const cancelResponse = await cancelOrder(order.buyUuid);
              if (cancelResponse) {
                console.log(`[주문 ${order.id}] 주문 취소 성공 ${order.buyUuid}`);
                orderState.orders = orderState.orders.filter(o => o.id !== order.id);
                saveOrderState(orderState);
              } else {
                console.log(`[주문 ${order.id}] 주문 취소 실패`);
              }
            }
            break;
        }
      }

      // 매도 주문 대기 중인 주문 체크 (업비트에 주문 넣은 상태)
      if (order.status === 'sell_ordered') {
        const orderedData = await checkOrderedData(order.sellUuid);
        if (orderedData == null) {
          console.log(`[주문 ${order.id}] 주문 상태 확인 실패`);
          continue;
        }

        switch (orderedData.state) {
          case 'done':
            // 매도 체결 → 완료 처리
            console.log(`[주문 ${order.id}] 매도 주문 처리됨: ${orderedData.price}원, 수량: ${orderedData.volume}`);
            order.status = 'completed';
            order.sellPrice = orderedData.price;

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
            // 가격 변동 체크 및 취소 필요 여부 확인
            if (needToCancelOrder(orderedData, expactedBuyPrice, expactedSellPrice, config, order.allocatedAmount || 0)) {
              const cancelResponse = await cancelOrder(order.sellUuid);
              if (cancelResponse) {
                console.log(`[주문 ${order.id}] 주문 취소 성공 ${order.sellUuid}`);
                orderState.orders = orderState.orders.filter(o => o.id !== order.id);
                saveOrderState(orderState);
              } else {
                console.log(`[주문 ${order.id}] 주문 취소 실패`);
              }
            }
            break;
        }
      }
    }

    updateCashBalnce(orderState, tetherPrice, accountInfo);
    
    console.log(`현재 테더: ${tetherPrice}원, 환율: ${rate}원, 김프: ${kimchiPremium.toFixed(2)}%, 매수가 ${expactedBuyPrice} 원, 매도가 ${expactedSellPrice} 원`);

    // 매도 대기 중인 주문에 대해 매도 주문 생성 (sell_pending → sell_ordered)
    for (const order of orderState.orders) {
      if (order.status === 'sell_pending') {
        const volumeToSell = parseFloat(order.volume);
        // sellThreshold가 없으면 현재 config에서 가져와서 저장
        if (order.sellThreshold == null) {
          order.sellThreshold = sellThreshold;
        }
        console.log(`[주문 ${order.id}] 김치 ${sellThreshold.toFixed(1)}% 에, ${expactedSellPrice} 원에 ${volumeToSell} 매도 주문 걸기`);
        const sellOrder = await sellTether(expactedSellPrice, volumeToSell);
        if (sellOrder) {
          console.log(`[주문 ${order.id}] 매도 주문 성공, UUID: ${sellOrder.uuid}`);
          order.sellUuid = sellOrder.uuid;
          order.sellPrice = sellOrder.price;
          order.status = 'sell_ordered'; // sell_pending → sell_ordered
          saveOrderState(orderState);
        }
        break; // 한 번에 하나씩만 처리
      }
    }

    // 웹에서 추가한 매수 작업 처리 (buy_pending → buy_ordered)
    for (const order of orderState.orders) {
      if (order.status === 'buy_pending') {
        // 웹에서 추가한 작업의 allocatedAmount 사용
        const allocatedAmount = order.allocatedAmount || config.tradeAmount;
        
        // 수량 계산
        let volumeToBuy;
        if (config.isTradeByMoney == true) {
          volumeToBuy = calcuratedVolume(true, expactedBuyPrice, allocatedAmount);
        } else {
          volumeToBuy = Math.floor(allocatedAmount); // 수량으로 매매하는 경우
        }
        
        if (volumeToBuy > 0) {
          console.log(`[주문 ${order.id}] 매수 주문 생성: 김치 ${buyThreshold.toFixed(1)}% 에, ${expactedBuyPrice} 원에 ${volumeToBuy} 매수 주문 걸기 (투자금액: ${allocatedAmount}원)`);
          const buyOrder = await buyTether(expactedBuyPrice, volumeToBuy);
          if (buyOrder) {
            order.buyUuid = buyOrder.uuid;
            order.buyPrice = buyOrder.price;
            order.volume = buyOrder.volume;
            order.status = 'buy_ordered'; // buy_pending → buy_ordered
            // buyThreshold가 없으면 현재 config에서 가져와서 저장
            if (order.buyThreshold == null) {
              order.buyThreshold = buyThreshold;
            }
            // sellThreshold가 없으면 현재 config에서 가져와서 저장
            if (order.sellThreshold == null) {
              order.sellThreshold = sellThreshold;
            }
            console.log(`[주문 ${order.id}] 매수 주문 성공, UUID: ${buyOrder.uuid}, 투자금액: ${allocatedAmount}원`);
            saveOrderState(orderState);
          }
        }
        break; // 한 번에 하나씩만 처리
      }
    }
  }
}

function updateCashBalnce(orderState, tetherPrice, accountInfo = null) {
  let isUpdated = false;

  // getAccountInfo()에서 가져온 실제 계정 잔액 사용
  let availableMoney;
  if (accountInfo && Array.isArray(accountInfo)) {
    const krwAccount = accountInfo.find(asset => asset.currency === 'KRW');
    if (krwAccount) {
      // 매수 대기 중인 주문들의 allocatedAmount 합계 (사용 중인 금액) - pending과 ordered 모두 포함
      const buyWaitingAmount = orderState.orders
        .filter(o => o.status === 'buy_pending' || o.status === 'buy_ordered')
        .reduce((sum, order) => sum + (order.allocatedAmount || 0), 0);
      
      // 매수 체결 후 매도 대기 중인 주문들의 매수 금액 (사용 중인 금액) - pending과 ordered 모두 포함
      const sellWaitingBuyAmount = orderState.orders
        .filter(o => o.status === 'sell_pending' || o.status === 'sell_ordered')
        .reduce((sum, order) => {
          if (order.buyPrice && order.volume) {
            return sum + (parseFloat(order.buyPrice) * parseFloat(order.volume));
          }
          return sum + (order.allocatedAmount || 0);
        }, 0);
      
      // 실제 계정 잔액에서 사용 중인 금액을 뺀 나머지
      availableMoney = parseFloat(krwAccount.balance) - buyWaitingAmount - sellWaitingBuyAmount;
    } else {
      // KRW 계정을 찾을 수 없으면 기존 로직 사용
      availableMoney = orderState.orders.reduce((sum, order) => {
        return sum + (order.allocatedAmount || 0);
      }, 0);
    }
  } else {
    // accountInfo가 없으면 기존 로직 사용
    availableMoney = orderState.orders.reduce((sum, order) => {
      return sum + (order.allocatedAmount || 0);
    }, 0);
  }
  
  if (cashBalance.availableMoney != availableMoney) {
    cashBalance.availableMoney = availableMoney;
    isUpdated = true;
  }
  
  // 매도 대기 중인 주문들의 테더 합계 계산 - pending과 ordered 모두 포함
  const sellWaitingOrders = orderState.orders.filter(o => o.status === 'sell_pending' || o.status === 'sell_ordered');
  const sellWaitingUsdt = sellWaitingOrders.reduce((sum, order) => sum + (parseFloat(order.volume) || 0), 0);
  
  let availableUsdt;
  // getAccountInfo()에서 가져온 실제 계정 잔액 사용
  if (accountInfo && Array.isArray(accountInfo)) {
    const usdtAccount = accountInfo.find(asset => asset.currency === 'USDT');
    if (usdtAccount) {
      // 실제 계정 잔액에서 매도 대기 중인 테더를 뺀 나머지
      availableUsdt = parseFloat(usdtAccount.balance) - sellWaitingUsdt;
    } else {
      // USDT 계정을 찾을 수 없으면 기존 로직 사용
      availableUsdt = sellWaitingUsdt;
    }
  } else {
    // accountInfo가 없으면 기존 로직 사용
    availableUsdt = sellWaitingUsdt;
  }
  
  if (cashBalance.availableUsdt != availableUsdt) {
    cashBalance.availableUsdt = availableUsdt;
    isUpdated = true;
  }
  
  // 총 평가 금액 계산
  let total;
  // 실제 계정 잔액 + 보유 테더 평가액
  if (accountInfo && Array.isArray(accountInfo)) {
    const krwAccount = accountInfo.find(asset => asset.currency === 'KRW');
    const usdtAccount = accountInfo.find(asset => asset.currency === 'USDT');
    const krwBalance = krwAccount ? parseFloat(krwAccount.balance) : 0;
    const usdtBalance = usdtAccount ? parseFloat(usdtAccount.balance) : 0;
    total = krwBalance + usdtBalance * tetherPrice;
  } else {
    // accountInfo가 없으면 기존 로직 사용
    const totalAllocatedAmount = orderState.orders.reduce((sum, order) => {
      return sum + (order.allocatedAmount || 0);
    }, 0);
    total = totalAllocatedAmount + availableUsdt * tetherPrice;
  }
  
  if (cashBalance.total != total) {
    cashBalance.total = total;
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
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10초 대기
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
  loop: loop
};

module.exports = upbitTradeModule;
console.log('✅ [upbit-trade] module.exports 설정 완료');

// 직접 실행 시에만 루프 시작 (Node.js에서 단독 실행할 때만 적용)
if (typeof require !== 'undefined' && require.main === module) {
  loop();
}

//main();
