import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import { getOrderState } from '../orderState';
import fs from 'fs';
import path from 'path';

const logFilePath = getTradeServerPath('trade-logs.txt');

// upbit-trade 모듈을 동적으로 로드 (monitor와 동일 패턴)
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

export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const configFilePath = getTradeServerPath('config.json');
    let isTrading = false;
    let config = {};

    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      isTrading = config.isTrading || false;
    }

    const orderState = getOrderState();

    const cashBalancePath = getTradeServerPath('cashBalance.json');
    let cashBalance = { availableMoney: 0, availableUsdt: 0, total: 0, krwBalance: 0, usdtBalance: 0 };

    if (fs.existsSync(cashBalancePath)) {
      cashBalance = JSON.parse(fs.readFileSync(cashBalancePath, 'utf8'));
    }

    // orderState에 저장된 테더 가격 재사용 (upbit-trade 루프에서 저장)
    const tetherPrice = typeof orderState.tetherPrice === 'number' ? orderState.tetherPrice : null;

    const monitor = {
      module: {
        loaded: true,
        hasStart: true,
        hasStop: true,
      },
      trading: {
        isTrading,
        config,
      },
      orders: {
        total: orderState.orders?.length || 0,
        buyPending: orderState.orders?.filter((o) => o.status === 'buy_pending').length || 0,
        buyOrdered: orderState.orders?.filter((o) => o.status === 'buy_ordered').length || 0,
        sellPending: orderState.orders?.filter((o) => o.status === 'sell_pending').length || 0,
        sellOrdered: orderState.orders?.filter((o) => o.status === 'sell_ordered').length || 0,
        completed: orderState.orders?.filter((o) => o.status === 'completed').length || 0,
        buyWaiting:
          orderState.orders?.filter((o) => o.status === 'buy_pending' || o.status === 'buy_ordered').length || 0,
        sellWaiting:
          orderState.orders?.filter((o) => o.status === 'sell_pending' || o.status === 'sell_ordered').length || 0,
      },
      balance: {
        krwBalance: cashBalance.krwBalance || 0,
        usdtBalance: cashBalance.usdtBalance || 0,
        availableMoney: cashBalance.availableMoney || 0,
        availableUsdt: cashBalance.availableUsdt || 0,
      },
      tetherPrice,
      timestamp: new Date().toISOString(),
    };

    // 3) 작업 목록
    const tasksPayload = {
      tasks: orderState.orders || [],
      total: orderState.orders?.length || 0,
    };

    return Response.json({
      monitor,
      tasks: tasksPayload,
    });
  } catch (error) {
    console.error('summary API 실패:', error);
    return Response.json({ error: '요약 정보를 읽을 수 없습니다', details: error.message }, { status: 500 });
  }
}

