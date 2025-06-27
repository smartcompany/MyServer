require('dotenv').config();
require('./log');

const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');

// filepath: /path/to/file
// 업비트 API 키 설정
const ACCESS_KEY = process.env.UPBIT_ACC_KEY;
const SECRET_KEY = process.env.UPBIT_SEC_KEY;
const EXCHANGE_RATE_KEY = process.env.EXCHANGE_RATE_KEY;
const SERVER_URL = 'https://api.upbit.com';
const EXCHANGE_RATE_URL = 'https://rate-history.vercel.app/api/rate-history';

let config = require('./config'); // 위 설정 객체 연결

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

async function cancelOrder(orderUuid) {
  try {
    const payload = {
      access_key: ACCESS_KEY,
      nonce: uuid.v4(),
    };
    const token = jwt.sign(payload, SECRET_KEY);

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    // 주문 취소 API 호출
    const response = await axios.delete(`${SERVER_URL}/v1/order`, {
      headers,
      params: { uuid: orderUuid }, // 취소할 주문의 UUID
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

async function main() {
  delete require.cache[require.resolve('./config')];
  config = require('./config');

  if (config.isTrading == false) { 
    console.log('\n트레이딩 중지');
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

    // 김치 프리미엄 계산
    const kimchiPremium = ((tetherPrice - rate)/rate) * 100;

    // 예시: 테더 매도// 현재 주문 확인 
    const orders = await getActiveOrders();
    
    if (orders) {
      console.log('현재 활성화된 주문:');
      orders.forEach((order) => {
        let orderType = "";
        if (order.side == 'bid') 
          orderType = "매수";
        else if (order.side == 'ask')
          orderType = "매도";
        console.log(`주문 UUID: ${order.uuid}, ${orderType} 상태: ${order.state}, 가격: ${order.price}, 수량: ${order.volume}`);
      });
    }
    
    // 모든 주문 취소
    for (const order of orders) {
      if (order.state !== 'wait') {
        console.log(`주문 ${order.uuid} 상태가 'wait'가 아니므로 취소하지 않습니다.`);
        continue;
      }

      // 테스트 조건이 1000 미만인 경우
      if (order.volume < 1000) {
        //const cancelResponse = await cancelOrder(order.uuid);
        if (cancelResponse) {
          console.log(`주문 ${order.uuid} 취소 성공`);
        }
      } else {
        console.log(`주문 ${order.uuid} 상태가 'wait'이지만, 테스트 조건이 1000 이상이므로 취소하지 않습니다.`);
      }
    }

    console.log(`현재 테더: ${tetherPrice}원, 환율: ${rate}원, 김프: ${kimchiPremium.toFixed(2)}%`);
    
    const expactedSellPrice = floorToHalf(rate * (1 + sellThreshold / 100));
    const volumeToSell = 10; // 예시로 10 USDT 매도
    console.log(`김치 ${sellThreshold.toFixed(1)}% 에, ${expactedSellPrice} 원에 ${volumeToSell} 매도 주문 걸기`);
    //await sellTether(sellPrice, volumeToSell);

    const expactedBuyPrice = floorToHalf(rate * (1 + buyThreshold / 100));
    const volumeToBuy = 10; // 예시로 10 USDT 매수
    console.log(`김치 ${buyThreshold.toFixed(1)}% 에, ${expactedBuyPrice} 원에 ${volumeToBuy} 매수 주문 걸기`);
    //await buyTether(buyPrice, volumeToBuy);

/*
    if (kimchiPremium > sellThreshold) {
      // 김치 프리미엄이 2.5% 이상인 경우 매도
      const expactedSellPrice = floorToHalf(tetherPrice * (1 + kimchiPremium / 100));
      const volumeToSell = 10; // 예시로 10 USDT 매도
      console.log(`김치 ${kimchiPremium.toFixed(1)}%이므로, ${sellPrice} 원에 ${volumeToSell} 매도 주문`);
      //await sellTether(sellPrice, volumeToSell);
    } else if (kimchiPremium <= buyThreshold) {
      const buyPrice = floorToHalf(tetherPrice * (1 + kimchiPremium / 100));
      const volumeToBuy = 10; // 예시로 10 USDT 매수
      console.log(`김치 프리미엄이 ${kimchiPremium.toFixed(1)}%이므로, ${buyPrice} 원에 ${volumeToBuy} 매수 주문`);
      // 매수
      //await buyTether(buyPrice, volumeToBuy);
    } else {
      console.log(`김치 프리미엄이 ${kimchiPremium.toFixed(1)}%로, 매도/매수 조건을 만족하지 않습니다.`);
    }
*/
  }
}

async function loop() {
  while (true) {
    try {
      await main(); // 너가 만든 로직 수행
    } catch (e) {
      console.error('Loop error:', e);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10초 대기
  }
}

loop(); // 루프 시작

//main();
