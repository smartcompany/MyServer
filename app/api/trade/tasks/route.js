import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import fs from 'fs';

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

const orderStatePath = getTradeServerPath('orderState.json');
const configPath = getTradeServerPath('config.json');

function loadOrderState() {
  try {
    if (!fs.existsSync(orderStatePath)) {
      fs.writeFileSync(orderStatePath, JSON.stringify({ orders: [], command: null }, null, 2));
    }
    const data = fs.readFileSync(orderStatePath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed.orders)) {
      return { orders: [], command: null };
    }
    
    return parsed;
  } catch (err) {
    console.error('orderState 읽기 실패:', err);
    return { orders: [], command: null };
  }
}

function saveOrderState(state) {
  fs.writeFileSync(orderStatePath, JSON.stringify(state, null, 2));
}

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

// GET: 작업 목록 조회
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const orderState = loadOrderState();
    const config = loadConfig();
    
    // 기존 주문에 threshold가 없으면 현재 config에서 가져와서 추가
    // 또한 기존 상태 네이밍 마이그레이션 (buy_waiting/sell_waiting → buy_pending/buy_ordered/sell_pending/sell_ordered)
    let hasUpdate = false;
    if (config && Array.isArray(orderState.orders)) {
      for (const order of orderState.orders) {
        // 기존 상태 네이밍 마이그레이션
        if (order.status === 'buy_waiting') {
          order.status = order.buyUuid ? 'buy_ordered' : 'buy_pending';
          hasUpdate = true;
        } else if (order.status === 'sell_waiting') {
          order.status = order.sellUuid ? 'sell_ordered' : 'sell_pending';
          hasUpdate = true;
        }
        
        // 매수 대기 또는 매도 대기 상태일 때 threshold 추가
        if ((order.status === 'buy_pending' || order.status === 'buy_ordered') && order.buyThreshold == null) {
          order.buyThreshold = config.buyThreshold ?? config.buy ?? null;
          hasUpdate = true;
        }
        // 매도 대기 상태일 때 threshold 추가 (pending과 ordered 모두)
        if ((order.status === 'sell_pending' || order.status === 'sell_ordered') && order.sellThreshold == null) {
          order.sellThreshold = config.sellThreshold ?? config.sell ?? null;
          hasUpdate = true;
        }
        // 매수 대기 상태에서 매도 기준 프리미엄도 미리 저장 (pending과 ordered 모두)
        if ((order.status === 'buy_pending' || order.status === 'buy_ordered') && order.sellThreshold == null) {
          order.sellThreshold = config.sellThreshold ?? config.sell ?? null;
          hasUpdate = true;
        }
      }
      
      if (hasUpdate) {
        saveOrderState(orderState);
      }
    }
    
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
    const { type, amount } = body; // type: 'buy' or 'sell', amount: 투자 금액 또는 수량

    if (!type || !['buy', 'sell'].includes(type)) {
      return Response.json({ error: 'type은 "buy" 또는 "sell"이어야 합니다' }, { status: 400 });
    }

    if (!amount || Number(amount) <= 0) {
      return Response.json({ error: 'amount는 0보다 큰 숫자여야 합니다' }, { status: 400 });
    }

    const config = loadConfig();
    if (!config) {
      return Response.json({ error: '설정 파일을 읽을 수 없습니다' }, { status: 500 });
    }

    const orderState = loadOrderState();
    
    // 새 작업 생성
    const newTask = {
      id: generateUUID(),
      status: type === 'buy' ? 'buy_pending' : 'sell_pending', // 주문 아직 안 넣은 상태
      buyUuid: null,
      sellUuid: null,
      buyPrice: null,
      sellPrice: null,
      volume: type === 'sell' ? Number(amount) : null, // 매도는 수량, 매수는 나중에 계산
      allocatedAmount: type === 'buy' ? Number(amount) : null, // 매수는 투자 금액
      buyThreshold: config.buyThreshold, // 매수 기준 프리미엄 (매도 작업도 나중에 매수로 전환되므로 저장)
      sellThreshold: config.sellThreshold, // 매도 기준 프리미엄 (매수 작업도 나중에 매도로 전환되므로 저장)
      isTradeByMoney: config.isTradeByMoney, // 매수 작업일 때만 저장 (매도는 수량만 사용)
      createdAt: new Date().toISOString(),
      type: type // 작업 타입 저장
    };

    // orders 배열 초기화 확인
    if (!Array.isArray(orderState.orders)) {
      orderState.orders = [];
    }

    orderState.orders.push(newTask);
    saveOrderState(orderState);

    console.log(`✅ [tasks API] ${type === 'buy' ? '매수' : '매도'} 작업 추가: ID=${newTask.id}, Amount=${amount}`);

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

    const orderState = loadOrderState();
    
    if (!Array.isArray(orderState.orders)) {
      return Response.json({ error: '작업 목록이 없습니다' }, { status: 404 });
    }

    const taskIndex = orderState.orders.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return Response.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
    }

    const task = orderState.orders[taskIndex];
    
    // 진행 중인 주문이 있으면 취소 명령 추가 (ordered 상태일 때만)
    if (task.status === 'buy_ordered') {
      // command로 취소 처리 (upbit-trade.js에서 처리)
      if (!orderState.command) {
        orderState.command = 'clearOrders';
        orderState.commandParams = [taskId];
      } else if (orderState.command === 'clearOrders' && Array.isArray(orderState.commandParams)) {
        orderState.commandParams.push(taskId);
      }
    } else if (task.status === 'sell_ordered') {
      // command로 취소 처리
      if (!orderState.command) {
        orderState.command = 'clearOrders';
        orderState.commandParams = [taskId];
      } else if (orderState.command === 'clearOrders' && Array.isArray(orderState.commandParams)) {
        orderState.commandParams.push(taskId);
      }
    }

    saveOrderState(orderState);

    console.log(`✅ [tasks API] 작업 삭제: ID=${taskId}`);

    return Response.json({
      success: true,
      message: '작업이 삭제되었습니다'
    });
  } catch (error) {
    console.error('작업 삭제 실패:', error);
    return Response.json({ 
      error: '작업을 삭제할 수 없습니다',
      details: error.message 
    }, { status: 500 });
  }
}

