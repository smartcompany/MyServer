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
      fs.writeFileSync(ordersFilePath, JSON.stringify({ orders: [], avaliableMoney: null, needInit: false }));
    }
    const data = fs.readFileSync(ordersFilePath, 'utf8');
    const parsed = JSON.parse(data);
    
    // 기존 구조를 새 구조로 마이그레이션
    if (!parsed.orders) {
      const migrated = {
        orders: [],
        avaliableMoney: parsed.avaliableMoney || null,
        needInit: parsed.needInit || false
      };
      
      // 기존 주문이 있으면 마이그레이션
      if (parsed.orderedUuid) {
        migrated.orders.push({
          id: uuid.v4(),
          status: parsed.nextOrder === 'buy' ? 'buy_waiting' : 'sell_waiting',
          buyUuid: parsed.nextOrder === 'buy' ? parsed.orderedUuid : null,
          sellUuid: parsed.nextOrder === 'sell' ? parsed.orderedUuid : null,
          buyPrice: parsed.orderedPrice || null,
          sellPrice: null,
          volume: parsed.orderedVolume || null,
          createdAt: new Date().toISOString()
        });
      }
      
      fs.writeFileSync(ordersFilePath, JSON.stringify(migrated, null, 2));
      return migrated;
    }
    
    return parsed;
  } catch (err) {
    console.error(err);
    return { orders: [], avaliableMoney: null, needInit: false };
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
    cashData = { history: [], total: 0 };
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

function needToCancelOrder(orderedData, expactedBuyPrice, expactedSellPrice, config, avaliableMoney) {

  if (orderedData.side === 'bid') { 
    const volume = calcuratedVolume(config.isTradeByMoney, expactedBuyPrice, avaliableMoney);
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

async function trade() {
  const prevConfig = require('./config');
  delete require.cache[require.resolve('./config')];
  const config = require('./config');

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

  // 초기화 처리: 모든 주문 취소
  if (orderState.needInit) {
    console.log('초기화 필요: 모든 주문 취소 시작');
    for (const order of orderState.orders) {
      if (order.status === 'buy_waiting' && order.buyUuid) {
        await cancelOrder(order.buyUuid);
      } else if (order.status === 'sell_waiting' && order.sellUuid) {
        await cancelOrder(order.sellUuid);
      }
    }
    orderState.orders = [];
    orderState.needInit = false;
    saveOrderState(orderState);
  }
  
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

    if (orderState.avaliableMoney == null || orderState.avaliableMoney == undefined) {
      console.log('처음 사용 가능한 돈이 정의가 안되어 있으니 config 값으로 설정');
      if (config.isTradeByMoney == true) {
        orderState.avaliableMoney = config.tradeAmount
      } else {
        orderState.avaliableMoney = config.tradeAmount * expactedBuyPrice;
      }

      saveOrderState(orderState);
    }

    // 기존 주문들 처리
    const activeOrders = orderState.orders.filter(o => 
      o.status === 'buy_waiting' || o.status === 'sell_waiting'
    );
    
    for (let i = activeOrders.length - 1; i >= 0; i--) {
      const order = activeOrders[i];
      const currentUuid = order.status === 'buy_waiting' ? order.buyUuid : order.sellUuid;
      
      if (!currentUuid) continue;
      
      const orderedData = await checkOrderedData(currentUuid);
      if (orderedData == null) {
        console.log(`주문 상태 확인 실패: ${currentUuid}`);
        continue;
      } 

      switch (orderedData.state) {
        case 'done':
          console.log(`주문 처리됨: ${currentUuid}`);
          try {
            const orderedMoney = (orderedData.volume * orderedData.price);
            
            if (orderedData.side === 'bid') {
              // 매수 체결 → 매도 대기 상태로 전환
              console.log(`매수 주문 처리됨: ${orderedData.price}원, 수량: ${orderedData.volume}`);
              order.status = 'sell_waiting';
              order.buyPrice = orderedData.price;
              order.volume = orderedData.volume;
              order.buyUuid = currentUuid;
              order.sellUuid = null;
              orderState.avaliableMoney -= orderedMoney;

              cashBalance.history.push({ 
                type: 'buy',
                date: new Date(), 
                price: orderedData.price,
                volume: orderedData.volume 
              });
            } else if (orderedData.side === 'ask') {
              // 매도 체결 → 완료 처리
              console.log(`매도 주문 처리됨: ${orderedData.price}원, 수량: ${orderedData.volume}`);
              order.status = 'completed';
              order.sellPrice = orderedData.price;
              order.sellUuid = currentUuid;
              orderState.avaliableMoney += orderedMoney;

              cashBalance.history.push({ 
                type: 'sell',
                date: new Date(), 
                price: orderedData.price,
                volume: orderedData.volume 
              });
              
              // 완료된 주문은 배열에서 제거 (또는 유지하고 표시만)
              // 여기서는 유지하고 상태만 변경
            }
            
            saveCashBalance(cashBalance);
            saveOrderState(orderState);
          } catch (error) {
            console.error('Error processing order:', error);
          }
          break;
        case 'cancel':
          console.log(`주문이 외부에서 취소됨: ${currentUuid}`);
          // 주문 취소 시 해당 주문 제거
          orderState.orders = orderState.orders.filter(o => o.id !== order.id);
          saveOrderState(orderState);
          break;
        case 'wait':
          // 가격 변동 체크 및 취소 필요 여부 확인
          const targetPrice = order.status === 'buy_waiting' ? expactedBuyPrice : expactedSellPrice;
          if (needToCancelOrder(orderedData, expactedBuyPrice, expactedSellPrice, config, orderState.avaliableMoney)) {
            const cancelResponse = await cancelOrder(currentUuid);
            if (cancelResponse) {
              console.log(`주문 취소 성공: ${currentUuid}`);
              // 취소된 주문 제거
              orderState.orders = orderState.orders.filter(o => o.id !== order.id);
              saveOrderState(orderState);
            }
          }
          break;
        default:
      }
    }

    updateCashBalnce(orderState, tetherPrice);
    
    console.log(`현재 테더: ${tetherPrice}원, 환율: ${rate}원, 김프: ${kimchiPremium.toFixed(2)}%, 매수가 ${expactedBuyPrice} 원, 매도가 ${expactedSellPrice} 원`);
    console.log(`활성 주문 수: ${activeOrders.length}`);

    // 매도 대기 중인 주문에 대해 매도 주문 생성
    for (const order of orderState.orders) {
      if (order.status === 'sell_waiting' && !order.sellUuid) {
        const volumeToSell = parseFloat(order.volume);
        console.log(`[주문 ${order.id}] 김치 ${sellThreshold.toFixed(1)}% 에, ${expactedSellPrice} 원에 ${volumeToSell} 매도 주문 걸기`);
        const sellOrder = await sellTether(expactedSellPrice, volumeToSell);
        if (sellOrder) {
          console.log(`[주문 ${order.id}] 매도 주문 성공, UUID: ${sellOrder.uuid}`);
          order.sellUuid = sellOrder.uuid;
          order.sellPrice = sellOrder.price;
          saveOrderState(orderState);
        }
        break; // 한 번에 하나씩만 처리
      }
    }

    // 새로운 매수 주문 생성 (매수 대기 중인 주문이 없고, 사용 가능한 금액이 있을 때)
    const buyWaitingCount = orderState.orders.filter(o => o.status === 'buy_waiting').length;
    const sellWaitingCount = orderState.orders.filter(o => o.status === 'sell_waiting').length;
    
    // 매수 주문이 없고, 사용 가능한 금액이 있으면 새 주문 생성
    if (buyWaitingCount === 0 && orderState.avaliableMoney > 0) {
      const volumeToBuy = calcuratedVolume(config.isTradeByMoney, expactedBuyPrice, orderState.avaliableMoney);
      if (volumeToBuy > 0) {
        console.log(`새 매수 주문 생성: 김치 ${buyThreshold.toFixed(1)}% 에, ${expactedBuyPrice} 원에 ${volumeToBuy} 매수 주문 걸기`);
        const buyOrder = await buyTether(expactedBuyPrice, volumeToBuy);
        if (buyOrder) {
          const newOrder = {
            id: uuid.v4(),
            status: 'buy_waiting',
            buyUuid: buyOrder.uuid,
            sellUuid: null,
            buyPrice: buyOrder.price,
            sellPrice: null,
            volume: buyOrder.volume,
            createdAt: new Date().toISOString()
          };
          orderState.orders.push(newOrder);
          console.log(`[주문 ${newOrder.id}] 매수 주문 성공, UUID: ${buyOrder.uuid}`);
          saveOrderState(orderState);
        }
      }
    }
  }
}

function updateCashBalnce(orderState, tetherPrice) {
  let isUpdated = false;

  if (cashBalance.restMoney != orderState.avaliableMoney) {
    cashBalance.restMoney = orderState.avaliableMoney;
    isUpdated = true;
  }
  
  // 매도 대기 중인 주문들의 테더 합계 계산
  const sellWaitingOrders = orderState.orders.filter(o => o.status === 'sell_waiting');
  const totalUsdt = sellWaitingOrders.reduce((sum, order) => sum + (parseFloat(order.volume) || 0), 0);
  
  if (cashBalance.restUsdt != totalUsdt) {
    cashBalance.restUsdt = totalUsdt;
    isUpdated = true;
  }
  
  const total = orderState.avaliableMoney + totalUsdt * tetherPrice;
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
