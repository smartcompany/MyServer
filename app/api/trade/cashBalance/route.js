import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import fs from 'fs';
import path from 'path';

const cashBalanceLogPath = getTradeServerPath('cashBalance.json');
const configPath = getTradeServerPath('config.json');
const orderStatePath = getTradeServerPath('orderState.json');

function loadConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

function loadOrderState() {
  try {
    if (!fs.existsSync(orderStatePath)) {
      return { orders: [] };
    }
    const data = fs.readFileSync(orderStatePath, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.orders ? parsed : { orders: [] };
  } catch (err) {
    return { orders: [] };
  }
}

export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const config = loadConfig();
    const isDummy = config && config.upbitServer === false;
    
    let cashBalance = {};
    
    if (fs.existsSync(cashBalanceLogPath)) {
      const data = fs.readFileSync(cashBalanceLogPath, 'utf8');
      cashBalance = JSON.parse(data);
    }
    
    // 더미 모드일 때 restMoney나 restUsdt가 없거나 0이면 testMoney/testUsdt로 초기화
    if (isDummy) {
      const testMoney = config.testMoney || 10000000;
      const testUsdt = config.testUsdt || 0;
      const orderState = loadOrderState();
      
      // 사용 중인 금액 계산
      const buyWaitingAmount = (orderState.orders || [])
        .filter(o => o.status === 'buy_waiting')
        .reduce((sum, order) => sum + (order.allocatedAmount || 0), 0);
      
      const sellWaitingBuyAmount = (orderState.orders || [])
        .filter(o => o.status === 'sell_waiting')
        .reduce((sum, order) => {
          if (order.buyPrice && order.volume) {
            return sum + (parseFloat(order.buyPrice) * parseFloat(order.volume));
          }
          return sum + (order.allocatedAmount || 0);
        }, 0);
      
      // 매도 대기 중인 테더 수량 계산
      const sellWaitingUsdt = (orderState.orders || [])
        .filter(o => o.status === 'sell_waiting')
        .reduce((sum, order) => sum + (parseFloat(order.volume) || 0), 0);
      
      if (cashBalance.restMoney == null || cashBalance.restMoney === 0) {
        cashBalance.restMoney = testMoney - buyWaitingAmount - sellWaitingBuyAmount;
      }
      
      if (cashBalance.restUsdt == null || cashBalance.restUsdt === 0) {
        cashBalance.restUsdt = testUsdt - sellWaitingUsdt;
      }
      
      if (cashBalance.total == null || cashBalance.total === 0) {
        cashBalance.total = testMoney;
      }
      
      if (!cashBalance.history) {
        cashBalance.history = [];
      }
      
      // 파일에 저장
      fs.writeFileSync(cashBalanceLogPath, JSON.stringify(cashBalance, null, 2));
    }
    
    return new Response(JSON.stringify(cashBalance), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('거래 내역 읽기 실패:', error);
    return Response.json({ error: '거래 내역을 읽을 수 없습니다' }, { status: 500 });
  }
}

