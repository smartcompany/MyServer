// 필수 모듈 먼저 로드
const path = require('path');
const fs = require('fs');

// 프로젝트 루트 경로 찾기
function getProjectRoot() {
  let currentDir = __dirname;
  // trade-server 디렉토리에서 시작하여 프로젝트 루트 찾기
  while (currentDir !== '/' && currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) || 
        fs.existsSync(path.join(currentDir, 'next.config.js'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  // 찾지 못하면 trade-server의 부모 디렉토리 사용
  return path.resolve(__dirname, '..');
}

const projectRoot = getProjectRoot();

// 환경 변수 로드 (프로젝트 루트의 .env 파일 사용)
require('dotenv').config({ path: path.join(projectRoot, '.env') });

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

// 환경 변수 확인 및 디버깅
if (!ACCESS_KEY || !SECRET_KEY) {
  console.error('❌ 업비트 API 키가 설정되지 않았습니다.');
  console.error('   UPBIT_ACC_KEY와 UPBIT_SEC_KEY 환경 변수를 확인하세요.');
  console.error(`   프로젝트 루트: ${projectRoot}`);
  console.error(`   .env 파일 경로: ${path.join(projectRoot, '.env')}`);
  console.error(`   .env 파일 존재: ${fs.existsSync(path.join(projectRoot, '.env'))}`);
  console.error(`   ACCESS_KEY 존재: ${!!ACCESS_KEY}`);
  console.error(`   SECRET_KEY 존재: ${!!SECRET_KEY}`);
} else {
  console.log('✅ 업비트 API 키 로드 성공');
  console.log(`   ACCESS_KEY 길이: ${ACCESS_KEY.length}`);
  console.log(`   SECRET_KEY 길이: ${SECRET_KEY.length}`);
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
      fs.writeFileSync(ordersFilePath, '{ "nextOrder": "buy" }');
    }
    const data = fs.readFileSync(ordersFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(err);
    return null;
  }
}

function saveOrderState(state) {
  fs.writeFileSync(ordersFilePath, JSON.stringify(state));
}


function saveCashBalance(balance) {
  if (!balance.history) balance.history = [];
  if (balance.total == null) balance.total = 0;
  fs.writeFileSync(cashBalanceLogPath, JSON.stringify(balance));
}

function loadCashBalance () {
  let cashData;
  try {
    const data = fs.readFileSync(cashBalanceLogPath, 'utf8');
    cashData = JSON.parse(data);
  } catch (err) {
    console.error(err);
    cashData = { history: [], total: 0 };
    fs.writeFileSync(cashBalanceLogPath, JSON.stringify(cashData, null, 2));
  }

  return cashData;
}

function saveCashBalance (balance) {
  fs.writeFileSync(cashBalanceLogPath, JSON.stringify(balance));
}

function saveConfig(config) {
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
}

async function getAccountInfo() {
  try {
    // API 키 확인
    if (!ACCESS_KEY || !SECRET_KEY) {
      console.error('❌ API 키가 없어서 계정 정보를 가져올 수 없습니다.');
      return null;
    }

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
    if (error.response) {
      console.error(`Error fetching account info: ${error.response.status} - ${error.response.statusText}`);
      if (error.response.status === 401) {
        console.error('❌ 인증 실패: API 키가 잘못되었거나 만료되었습니다.');
        console.error('   UPBIT_ACC_KEY와 UPBIT_SEC_KEY를 확인하세요.');
        console.error(`   ACCESS_KEY 존재: ${!!ACCESS_KEY}, 길이: ${ACCESS_KEY ? ACCESS_KEY.length : 0}`);
        console.error(`   SECRET_KEY 존재: ${!!SECRET_KEY}, 길이: ${SECRET_KEY ? SECRET_KEY.length : 0}`);
      }
    } else {
      console.error('Error fetching account info:', error.message);
    }
    return null;
  }
}

async function sellTether(price, volume) {
  try {
       // 지정가 매도 주문 데이터
    const orderData = {
      market: 'KRW-USDT', // 테더 시장
      side: 'ask',        // 매도
      price: Number(price.toFixed(1)),       // 지정가 (원화)
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
      price: Number(price.toFixed(1)),       // 지정가 (원화)
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
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error('Error placing limit buy order:', error.response?.data || error.message);
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
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error('Error canceling order:', error.message);
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
  volume = parseFloat(volume.toFixed(1));
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

  if (orderState.needInit) {
    if (orderState.orderedUuid) {
      console.log('초기화 필요 주문 취소 시작');
      const canceledData = await cancelOrder(orderState.orderedUuid);
      if (canceledData) {
        orderState.orderedUuid = null;
        console.log('초기화 필요 주문 취소 성공');
      } else {
        console.log('초기화 필요 주문 취소 실패');
        return;
      }
    }

    orderState = {};
    orderState.nextOrder = OrderType.BUY;
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

    const expactedBuyPrice = floorToHalf(rate * (1 + buyThreshold / 100));
    const expactedSellPrice = floorToHalf(rate * (1 + sellThreshold / 100));

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

    if (orderState.orderedUuid) {
      const orderedData = await checkOrderedData(orderState.orderedUuid);
      if (orderedData == null) {
        console.log(`주문 상태 확인 실패시 로직 멈춤`);
        return null;
      } 

      switch (orderedData.state) {
        case 'done':
          console.log('주문이 처리 됨');
          try {
            const orderedMoney = (orderedData.volume * orderedData.price);
            if (orderedData.side === 'bid') {
              console.log(`매수 주문 처리됨: ${orderedData.price}`);
              
              orderState.avaliableMoney -= orderedMoney;
              orderState.nextOrder = OrderType.SELL;
            } else if (orderedData.side === 'ask') {
              console.log(`매도 주문 처리됨: ${orderedData.price}`);

              orderState.avaliableMoney += orderedMoney;
              orderState.nextOrder = OrderType.BUY;
            }

            cashBalance.history.push({ type: orderedData.side === 'bid' ? 'buy' : 'sell',
              date: new Date(), 
              price: orderedData.price,
              volume: orderedData.volume });
            saveCashBalance(cashBalance);
          } catch (error) {
            console.error('Error processing order:', error);
            return null;
          } finally {
            orderState.orderedUuid = null;
            saveOrderState(orderState);
          }
          break;
        case 'cancel':
          console.log('주문이 외부에서 취소되면 중단');
          orderState.orderedUuid = null;
          saveOrderState(orderState);

          config.isTrading = false;
          saveConfig(config);

          return null;
        case 'wait':
          if (needToCancelOrder(orderedData, expactedBuyPrice, expactedSellPrice, config, orderState.avaliableMoney)) {
            const cancelResponse = await cancelOrder(orderState.orderedUuid);
            if (cancelResponse) {
              console.log(`주문 취소 성공 ${orderState.orderedUuid}`);
              orderState.orderedUuid = null;
              saveOrderState(orderState);
            } else {
              console.log(`주문 취소가 실패시 로직 멈춤`);
              return null;
            }
          }
          break;
        default:
      }
    }

    updateCashBalnce(orderState, tetherPrice);
    
    console.log(`현재 테더: ${tetherPrice}원, 환율: ${rate}원, 김프: ${kimchiPremium.toFixed(2)}%, 매수가 ${expactedBuyPrice} 원, 매도가 ${expactedSellPrice} 원`);

    if (orderState.orderedUuid != null) {
      //console.log('주문 UUID 가 유효함 주문 안함');
      return null;
    }
    
    switch (orderState.nextOrder) {
      case OrderType.BUY:
      {
        const volumeToBuy = calcuratedVolume(config.isTradeByMoney, expactedBuyPrice, orderState.avaliableMoney); 
        console.log(`김치 ${buyThreshold.toFixed(1)}% 에, ${expactedBuyPrice} 원에 ${volumeToBuy} 매수 주문 걸기`);
        const order = await buyTether(expactedBuyPrice, volumeToBuy);
        if (order) {
          console.log(`매수 주문 성공, UUID: ${order.uuid}`);
          orderState.orderedUuid = order.uuid;
          orderState.orderedSide = order.side;
          orderState.orderedPrice = order.price;
          orderState.orderedVolume = order.volume;
          saveOrderState(orderState);
        }
      }
        break;
      case OrderType.SELL:
      {
        const volumeToSell = parseFloat(orderState.orderedVolume);
        console.log(`김치 ${sellThreshold.toFixed(1)}% 에, ${expactedSellPrice} 원에 ${volumeToSell} 매도 주문 걸기`);
        const order = await sellTether(expactedSellPrice, volumeToSell);
        if (order) {
          console.log(`매도 주문 성공, UUID: ${order.uuid}`);
          orderState.orderedUuid = order.uuid;
          orderState.orderedSide = order.side;
          orderState.orderedPrice = order.price;
          orderState.orderedVolume = order.volume;
          saveOrderState(orderState);
        }
      }
        break;
    }
  }
}

function updateCashBalnce(orderState, tetherPrice) {
  let isUpdated = false;

  if (cashBalance.restMoney != orderState.avaliableMoney) {
    cashBalance.restMoney = orderState.avaliableMoney;
    isUpdated = true;
  }
  
  if (orderState.nextOrder === OrderType.BUY) {
    cashBalance.restUsdt = 0;
    // 보유 테더가 없다고 판단 
    if (cashBalance.total != orderState.avaliableMoney) {
      cashBalance.total = orderState.avaliableMoney;
      isUpdated = true;
    }
  } else {
    // orderState.orderedVolume 은 보유 테더 
    cashBalance.restUsdt = orderState.orderedVolume;
    const total = orderState.avaliableMoney + orderState.orderedVolume * tetherPrice;
    if (cashBalance.total != total) {
      cashBalance.total = total;
      isUpdated = true;
    }
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
if (require.main === module) {
  // 직접 실행 시에만 루프 시작
  loop();
} else {
  // 모듈로 import된 경우
  module.exports = {
    start: () => {
      if (!isLoopRunning) {
        isLoopRunning = true;
        loop();
      }
    },
    stop: () => {
      isLoopRunning = false;
      // 루프는 while(true)이므로 실제로는 trade() 함수 내부에서 isTrading을 확인하여 중지
    },
    trade: trade,
    loop: loop
  };
}

//main();
