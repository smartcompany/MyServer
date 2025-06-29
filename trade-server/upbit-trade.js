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
const SERVER_URL = 'https://api.upbit.com';
const EXCHANGE_RATE_URL = 'https://rate-history.vercel.app/api/rate-history';

const ordersFilePath = path.join(__dirname, 'orderState.json');
const cashBalanceLogPath = path.join(__dirname, 'cashBalance.json');
const configFilePath = path.join(__dirname, 'config.json');

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
            cashBalance.total = orderState.avaliableMoney;
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

    console.log(`현재 테더: ${tetherPrice}원, 환율: ${rate}원, 김프: ${kimchiPremium.toFixed(2)}%, 매수가 ${expactedBuyPrice} 원, 매도가 ${expactedSellPrice} 원`);

    if (orderState.orderedUuid != null) {
      console.log('주문 UUID 가 유효함 주문 안함');
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
