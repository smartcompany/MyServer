import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import { getOrderState, updateOrderState, saveOrderStateImmediately } from '../orderState';
import fs from 'fs';
import path from 'path';

// uuid는 Node.js 환경에서 require로 사용
function generateUUID() {
  try {
    const nativeRequire = eval('require');
    const uuid = nativeRequire('uuid');
    return uuid.v4();
  } catch (error) {
    // uuid가 없으면 간단한 UUID 생성
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

const configPath = getTradeServerPath('config.json');

function loadConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('config 읽기 실패:', err);
    return null;
  }
}

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

// volume 계산 함수
async function calculateVolume(type, amount, isTradeByMoney, buyThreshold, sellThreshold) {
  if (isTradeByMoney) {
    // isTradeByMoney가 true일 경우 테더 가격을 가져와서 volume 계산
    const module = loadUpbitTradeModule();
    if (!module || typeof module.getTetherPrice !== 'function') {
      throw new Error('테더 가격을 가져올 수 없습니다');
    }

    const tetherPrice = await module.getTetherPrice();
    if (!tetherPrice) {
      throw new Error('테더 가격 조회 실패');
    }

    const money = Number(amount);
    let expactedPrice;
    
    if (type === 'buy') {
      if (buyThreshold == null) {
        throw new Error('매수 작업은 buyThreshold 값이 필요합니다');
      }
      expactedPrice = Math.round(tetherPrice * (1 + buyThreshold / 100));
    } else {
      if (sellThreshold == null) {
        throw new Error('매도 작업은 sellThreshold 값이 필요합니다');
      }
      expactedPrice = Math.round(tetherPrice * (1 + sellThreshold / 100));
    }

    const volume = Math.floor(money / expactedPrice);
    if (volume <= 0) {
      throw new Error('계산된 수량이 0 이하입니다');
    }
    return volume;
  } else {
    // isTradeByMoney가 false일 경우 amount가 이미 수량
    return Number(amount);
  }
}

// GET: 작업 목록 조회
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const orderState = getOrderState();

    return Response.json({
      tasks: orderState.orders || [],
      total: orderState.orders?.length || 0
    });
  } catch (error) {
    console.error('작업 목록 조회 실패:', error);
    return Response.json({ error: '작업 목록을 읽을 수 없습니다' }, { status: 500 });
  }
}

// POST: 작업 추가 (매수 또는 매도)
export async function POST(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { type, amount, isTradeByMoney, buyThreshold, sellThreshold } = body; // type: 'buy' or 'sell', amount: 투자 금액 또는 수량, isTradeByMoney: 매매 방식, buyThreshold/sellThreshold: 프리미엄

    if (!type || !['buy', 'sell'].includes(type)) {
      return Response.json({ error: 'type은 "buy" 또는 "sell"이어야 합니다' }, { status: 400 });
    }

    if (!amount || Number(amount) <= 0) {
      return Response.json({ error: 'amount는 0보다 큰 숫자여야 합니다' }, { status: 400 });
    }

    // 매도 작업의 경우 isTradeByMoney는 무조건 웹페이지에서 전달받은 값 사용
    if (type === 'sell' && isTradeByMoney === undefined) {
      return Response.json({ error: '매도 작업은 isTradeByMoney 값이 필요합니다' }, { status: 400 });
    }

    // volume 계산
    let volume;
    try {
      volume = await calculateVolume(type, amount, isTradeByMoney, buyThreshold, sellThreshold);
    } catch (error) {
      const statusCode = error.message.includes('필요합니다') || error.message.includes('0 이하') ? 400 : 500;
      return Response.json({ error: error.message }, { status: statusCode });
    }

    // 새 작업 생성
    const newTask = {
      id: generateUUID(),
      status: type === 'buy' ? 'buy_pending' : 'sell_pending',
      buyThreshold: buyThreshold,
      sellThreshold: sellThreshold,
      createdAt: new Date().toISOString(),
      type: type,
      volume: Number(volume)
    };

    // 메모리 업데이트
    updateOrderState((state) => {
      if (!Array.isArray(state.orders)) {
        state.orders = [];
      }
      state.orders.push(newTask);
      return state;
    });

    console.log(`✅ [tasks API] ${type === 'buy' ? '매수' : '매도'} 작업 추가: ID=${newTask.id}, 수량=${volume}`);

    return Response.json({
      success: true,
      task: newTask,
      message: `${type === 'buy' ? '매수' : '매도'} 작업이 추가되었습니다`
    });
  } catch (error) {
    console.error('작업 추가 실패:', error);
    return Response.json({ 
      error: '작업을 추가할 수 없습니다',
      details: error.message 
    }, { status: 500 });
  }
}

// DELETE: 작업 삭제
export async function DELETE(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('id');
    
    if (!taskId) {
      return Response.json({ error: '작업 ID가 필요합니다' }, { status: 400 });
    }

    const orderState = getOrderState();
    
    if (!Array.isArray(orderState.orders)) {
      return Response.json({ error: '작업 목록이 없습니다' }, { status: 404 });
    }

    const taskIndex = orderState.orders.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return Response.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
    }

    const task = orderState.orders[taskIndex];
    const isPending = task.status === 'buy_pending' || task.status === 'sell_pending';

    if (isPending) {
      // Limit Order 전: 거래소에 주문 없음 → API에서 바로 목록에서 제거 (웹 반영 즉시)
      updateOrderState((state) => {
        state.orders = state.orders.filter((o) => o.id !== taskId);
        return state;
      });
    } else {
      // ordered: 거래소 취소 필요 → command로 upbit-trade가 취소 후 제거
      updateOrderState((state) => {
        if (!state.command) {
          state.command = 'clearOrders';
          state.commandParams = [taskId];
        } else if (state.command === 'clearOrders' && Array.isArray(state.commandParams)) {
          state.commandParams.push(taskId);
        }
        return state;
      });
    }
    
    saveOrderStateImmediately();

    // 최신 상태 다시 읽어서 응답에 포함 (클라이언트에서 바로 반영 가능)
    const updatedState = getOrderState();

    console.log(`✅ [tasks API] 작업 삭제: ID=${taskId}`);

    return Response.json({
      success: true,
      message: '작업이 삭제되었습니다',
      tasks: updatedState.orders || [],
      total: updatedState.orders?.length || 0
    });
  } catch (error) {
    console.error('작업 삭제 실패:', error);
    return Response.json({ 
      error: '작업을 삭제할 수 없습니다',
      details: error.message 
    }, { status: 500 });
  }
}

