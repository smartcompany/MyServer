import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import { clearOrders } from '../utils';
import fs from 'fs';

const orderStateFilePath = getTradeServerPath('orderState.json');

function readOrderState() {
  if (!fs.existsSync(orderStateFilePath)) {
    return { orders: [], command: null };
  }
  try {
    return JSON.parse(fs.readFileSync(orderStateFilePath, 'utf8'));
  } catch (error) {
    console.error('주문 상태 파일 읽기 실패:', error);
    return { orders: [], avaliableMoney: null, command: null };
  }
}

function saveOrderState(orderState) {
  fs.writeFileSync(orderStateFilePath, JSON.stringify(orderState, null, 2));
}

// 주문 목록 조회
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const orderState = readOrderState();
    // 모든 주문의 allocatedAmount 합계 계산 (총 사용 가능한 투자 금액)
    const totalAllocatedAmount = (orderState.orders || []).reduce((sum, order) => {
      return sum + (order.allocatedAmount || 0);
    }, 0);
    
    return Response.json({
      orders: orderState.orders || [],
      totalAllocatedAmount: totalAllocatedAmount // 모든 주문의 투자 금액 합계
    });
  } catch (error) {
    console.error('주문 목록 조회 실패:', error);
    return Response.json({ error: '주문 목록을 읽을 수 없습니다' }, { status: 500 });
  }
}

// 새 주문 추가
export async function POST(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { amount } = await request.json();
    const orderState = readOrderState();
    
    if (amount && typeof amount === 'number' && amount > 0) {
      // 수동으로 주문 금액 설정 (선택적)
      // 실제로는 upbit-trade.js가 자동으로 주문을 생성하므로
      // 여기서는 단순히 플래그만 설정하거나, 직접 주문을 생성할 수도 있음
      // 현재는 주문 목록만 반환
    }
    
    return Response.json({ 
      message: '새 주문은 자동으로 생성됩니다',
      orders: orderState.orders || []
    });
  } catch (error) {
    console.error('주문 추가 실패:', error);
    return Response.json({ error: '주문 추가 실패' }, { status: 500 });
  }
}

// 주문 삭제 (취소)
export async function DELETE(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('id');
    
    if (!orderId) {
      return Response.json({ error: '주문 ID가 필요합니다' }, { status: 400 });
    }

    const orderState = readOrderState();
    const order = orderState.orders.find(o => o.id === orderId);
    
    if (!order) {
      return Response.json({ error: '주문을 찾을 수 없습니다' }, { status: 404 });
    }

    // orderState.json에 clearOrders command 설정
    // upbit-trade.js의 handleCommand가 이를 감지하고 처리함
    clearOrders([orderId]);

    return Response.json({ message: '주문 취소 요청이 접수되었습니다. 처리 중입니다.' });
  } catch (error) {
    console.error('주문 삭제 실패:', error);
    return Response.json({ error: `주문 삭제 실패: ${error.message}` }, { status: 500 });
  }
}

