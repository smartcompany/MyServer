require('dotenv').config();
require('./log');

const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const path = require('path');
const fs = require('fs');

// filepath: /path/to/file
// 업비트 API 키 설정
const ACCESS_KEY = process.env.UPBIT_ACC_KEY;
const SECRET_KEY = process.env.UPBIT_SEC_KEY;
const EXCHANGE_RATE_KEY = process.env.EXCHANGE_RATE_KEY;
const SERVER_URL = 'https://api.upbit.com';
const EXCHANGE_RATE_URL = 'https://rate-history.vercel.app/api/rate-history';

const ordersFilePath = path.join(__dirname, 'orderHistory.json');

const OrderType = {
  BUY: 'buy',
  SELL: 'sell',
};

let orderHistory = loadOrderHistory();

// 지정가 주문에 대한 콜백 함수
const WebSocket = require('ws');
const ws = new WebSocket('wss://api.upbit.com/websocket/v1');

ws.on('open', () => {
  const authData = {
    type: 'auth',
    ACCESS_KEY,
    SECRET_KEY,
  };
  ws.send(JSON.stringify(authData));

  const subscribeData = {
    type: 'order',
    codes: ['KRW-USDT'],
    isOnlyRealtime: true,
  };
  ws.send(JSON.stringify(subscribeData));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.type === 'order') {
    const order = message.data;
    if (order.state === 'done') {
      if (order.side === 'bid') {
        // 매수가 완료됨 
        orderHistory.nextOrder = OrderType.SELL;
      } else if (order.side === 'ask') {
        orderHistory.nextOrder = OrderType.BUY;
      }

      // order 의 모든 정보를 로깅하고 orders.json 파일에 저장
      console.log(`주문 side: ${order.side}`);
      console.log(`볼륨: ${order.volume}`);
      console.log(`남은 볼륨: ${order.remaining_volume}`);
      console.log(`주문 가격: ${order.price}`);
      console.log(`주문 id: ${order.uuid}`);

      saveOrderHistory(orderHistory);
    }
  }
});

ws.on('error', (error) => {
  console.error(error);
});

ws.on('close', () => {
  console.log('WebSocket 연결이 종료되었습니다.');
});

function loadOrderHistory() {
  try {
    const data = fs.readFileSync(ordersFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(err);
    return null;
  }
}

function saveOrderHistory(order) {
  fs.writeFileSync(ordersFilePath, JSON.stringify(orderHistory));
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
      console.log('지정가 매수 주문 성공:', response.data);
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
      console.log('주문 취소 성공:', response.data);
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

async function trade() {
  const prevConfig = require('./config');
  delete require.cache[require.resolve('./config')];
  const config = require('./config');
  const volume = config.volume;

  if (volume == null || volume == undefined) {
    console.log('수량 정의가 필요');
    return;
  }

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
  
  const buyThreshold = config.buyThreshold ?? 0.5;  
  const sellThreshold = config.sellThreshold ?? 2.5;

  const accountInfo = await getAccountInfo();
  if (accountInfo) {
    console.log('\n========= 코인 및 현금 정보 ===========');
    accountInfo.forEach((asset) => {
      if (asset.currency !== 'KRW' && asset.currency !== 'USDT') {
        return; // KRW와 USDT를 제외한 다른 자산은 출력하지 않음
      }

      console.log(
        `종목: ${asset.currency}, 잔고: ${asset.balance}, 평균 매수가: ${asset.avg_buy_price}`
      );
    });

    const rate = await getExchangeRate();
    const tetherPrice = await getTetherPrice();

    const expactedBuyPrice = floorToHalf(rate * (1 + buyThreshold / 100));
    const expactedSellPrice = floorToHalf(rate * (1 + sellThreshold / 100));

    // 김치 프리미엄 계산
    const kimchiPremium = ((tetherPrice - rate)/rate) * 100;

    // 예시: 테더 매도// 현재 주문 확인 
    const activeOrder = await getActiveOrder(orderHistory.uuid);
    let needToOrder = true;
    if (activeOrder) {
      if (activeOrder.side === 'bid') {
        if (activeOrder.price == expactedBuyPrice) {
          console.log(`매수 중 주문된 가격: ${activeOrder.price}이 기존과 같아서 재주문 안함`);
          needToOrder = false;
        }
      } else if (activeOrder.side === 'ask') {
        if (activeOrder.price != expactedSellPrice) {
          console.log(`매도 중 주문된 가격: ${activeOrder.price}이 기존과 같아서 재주문 안함`);
          needToOrder = false;
        }
      }

      if (needToOrder) {
        const cancelResponse = await cancelOrder(activeOrder.uuid);
        if (cancelResponse) {
          console.log(`${activeOrder.side} 주문 취소 성공 ${activeOrder.uuid}`);
        } else {
          console.log(`주문 취소가 실패시 로직 멈춤`);
          return null;
        }
      }
    }

    if (needToOrder == false) {
      console.log('매도/매수 중 주문 지표를 찾아서 재주문 안함');
      return null;
    }

    console.log(`현재 테더: ${tetherPrice}원, 환율: ${rate}원, 김프: ${kimchiPremium.toFixed(2)}%`);

    switch (orderHistory.nextOrder) {
      case OrderType.BUY:
      {
        const volumeToBuy = volume; 
        console.log(`김치 ${buyThreshold.toFixed(1)}% 에, ${expactedBuyPrice} 원에 ${volumeToBuy} 매수 주문 걸기`);
        const order = await buyTether(expactedBuyPrice, volumeToBuy);
        if (order) {
          console.log(`매수 주문 성공, UUID: ${order.uuid}`);
          orderHistory.orderedUuid = order.uuid;
          orderHistory.orderedSide = order.side;
          orderHistory.orderedPrice = order.price;
          orderHistory.orderedVolume = order.volume;
          saveOrderHistory(orderHistory);
        }
      }
        break;
      case OrderType.SELL:
      {
        const volumeToSell = volume;
        console.log(`김치 ${sellThreshold.toFixed(1)}% 에, ${expactedSellPrice} 원에 ${volumeToSell} 매도 주문 걸기`);
        const order = await sellTether(expactedSellPrice, volumeToSell);
        if (order) {
          console.log(`매도 주문 성공, UUID: ${order.uuid}`);
          orderHistory.orderedUuid = order.uuid;
          orderHistory.orderedSide = order.side;
          orderHistory.orderedPrice = order.price;
          orderHistory.orderedVolume = order.volume;
          saveOrderHistory(orderHistory);
        }
      }
        break;
    }
  }
}

async function getActiveOrder(uuid) {
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

loop(); // 루프 시작

//main();
