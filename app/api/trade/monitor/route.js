import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import { getOrderState } from './orderState';
import fs from 'fs';
import path from 'path';

// upbit-trade 모듈을 동적으로 로드
let upbitTradeModule = null;

function loadUpbitTradeModule() {
  if (upbitTradeModule) {
    return upbitTradeModule;
  }

  try {
    const projectRoot = process.cwd();
    const upbitTradePath = path.join(projectRoot, 'trade-server', 'upbit-trade.js');
    
    if (!fs.existsSync(upbitTradePath)) {
      console.error(`❌ upbit-trade.js 파일을 찾을 수 없습니다: ${upbitTradePath}`);
      return null;
    }

    // Webpack 번들링을 피하기 위해 eval('require') 사용
    const nativeRequire = eval('require');
    upbitTradeModule = nativeRequire(upbitTradePath);
    
    return upbitTradeModule;
  } catch (error) {
    console.error('❌ upbit-trade 모듈 로드 실패:', error.message);
    return null;
  }
}

// GET: 모니터링 상태 조회
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const module = loadUpbitTradeModule();
    
    // config.json에서 isTrading 상태 확인
    const configFilePath = getTradeServerPath('config.json');
    let isTrading = false;
    let config = {};
    
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      isTrading = config.isTrading || false;
    }

    // orderState에서 주문 상태 확인 (메모리 기반)
    const orderState = getOrderState();

    // cashBalance.json에서 잔액 확인
    const cashBalancePath = getTradeServerPath('cashBalance.json');
    let cashBalance = { availableMoney: 0, availableUsdt: 0, total: 0 };
    
    if (fs.existsSync(cashBalancePath)) {
      cashBalance = JSON.parse(fs.readFileSync(cashBalancePath, 'utf8'));
    }

    return Response.json({
      module: {
        loaded: module !== null,
        hasStart: module && typeof module.start === 'function',
        hasStop: module && typeof module.stop === 'function',
      },
      trading: {
        isTrading: isTrading,
        config: config,
      },
      orders: {
        total: orderState.orders?.length || 0,
        buyPending: orderState.orders?.filter(o => o.status === 'buy_pending').length || 0,
        buyOrdered: orderState.orders?.filter(o => o.status === 'buy_ordered').length || 0,
        sellPending: orderState.orders?.filter(o => o.status === 'sell_pending').length || 0,
        sellOrdered: orderState.orders?.filter(o => o.status === 'sell_ordered').length || 0,
        completed: orderState.orders?.filter(o => o.status === 'completed').length || 0,
        // 호환성을 위해 기존 필드도 유지
        buyWaiting: (orderState.orders?.filter(o => o.status === 'buy_pending' || o.status === 'buy_ordered').length || 0),
        sellWaiting: (orderState.orders?.filter(o => o.status === 'sell_pending' || o.status === 'sell_ordered').length || 0),
      },
      balance: {
        availableMoney: cashBalance.availableMoney || 0,
        availableUsdt: cashBalance.availableUsdt || 0,
        total: cashBalance.total || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('모니터링 상태 확인 실패:', error);
    return Response.json({ 
      error: '모니터링 상태를 확인할 수 없습니다',
      details: error.message 
    }, { status: 500 });
  }
}

// POST: 트레이딩 제어 (start/stop)
export async function POST(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { action } = body; // 'start' or 'stop'

    if (!action || !['start', 'stop'].includes(action)) {
      return Response.json({ error: 'action은 "start" 또는 "stop"이어야 합니다' }, { status: 400 });
    }

    const module = loadUpbitTradeModule();
    
    if (!module) {
      return Response.json({ error: 'upbit-trade 모듈을 로드할 수 없습니다' }, { status: 500 });
    }

    if (action === 'start') {
      if (typeof module.start === 'function') {
        module.start();
        return Response.json({ 
          success: true, 
          message: '트레이딩 루프가 시작되었습니다',
          action: 'start'
        });
      } else {
        return Response.json({ error: 'start 함수가 없습니다' }, { status: 500 });
      }
    } else if (action === 'stop') {
      if (typeof module.stop === 'function') {
        module.stop();
        return Response.json({ 
          success: true, 
          message: '트레이딩 루프가 중지되었습니다',
          action: 'stop'
        });
      } else {
        return Response.json({ error: 'stop 함수가 없습니다' }, { status: 500 });
      }
    }
  } catch (error) {
    console.error('트레이딩 제어 실패:', error);
    return Response.json({ 
      error: '트레이딩을 제어할 수 없습니다',
      details: error.message 
    }, { status: 500 });
  }
}

