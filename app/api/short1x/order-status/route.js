import { verifyToken } from '../../trade/middleware';
import { bybitSignedRequest, getBybitConfig } from '../bybit';

/**
 * GET: Bybit 주문 상태 조회 (orderId로)
 * query:
 *  - orderId (필수)
 *  - symbol (선택: XRPUSD | XRPUSDT, 미입력 시 XRPUSD)
 */
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');
  if (!orderId || !orderId.trim()) {
    return Response.json({ error: 'orderId를 입력해주세요.' }, { status: 400 });
  }
  const symbolParam = String(searchParams.get('symbol') || '').toUpperCase();
  const symbol = symbolParam === 'XRPUSDT' ? 'XRPUSDT' : 'XRPUSD';
  const category = symbol === 'XRPUSDT' ? 'linear' : 'inverse';

  try {
    getBybitConfig();
  } catch (e) {
    return Response.json(
      { error: 'Bybit API 키가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  try {
    const trimmed = orderId.trim();

    // 1) 우선 realtime(활성/최근 주문)에서 조회
    let order = null;
    try {
      const rtRes = await bybitSignedRequest(
        'GET',
        `/v5/order/realtime?category=${category}&symbol=${symbol}&orderId=${encodeURIComponent(trimmed)}&limit=1`
      );
      const rtList = rtRes?.result?.list || [];
      order = rtList[0] || null;
    } catch (e) {
      // realtime 조회 실패 시에도 history로 fallback
      console.error('[short1x] order-status realtime 조회 실패:', e?.retMsg || e?.message || e);
    }

    // 2) realtime에 없으면 history(과거 체결/취소/거절 포함)에서 조회
    if (!order) {
      const hsRes = await bybitSignedRequest(
        'GET',
        `/v5/order/history?category=${category}&symbol=${symbol}&orderId=${encodeURIComponent(trimmed)}&limit=1`
      );
      const hsList = hsRes?.result?.list || [];
      order = hsList[0] || null;
    }

    if (!order) {
      return Response.json({
        found: false,
        orderId: trimmed,
        message:
          '해당 주문을 찾을 수 없습니다. (주문 직후에는 잠시 지연될 수 있어요. 잠시 후 다시 시도해주세요.)',
      });
    }

    const status = order.orderStatus; // New, PartiallyFilled, Filled, Cancelled, Rejected, Deactivated
    const rejectReason = order.rejectReason || '';
    const cancelType = order.cancelType || '';

    return Response.json({
      found: true,
      orderId: order.orderId,
      orderStatus: status,
      cancelType,
      rejectReason,
      cumExecQty: order.cumExecQty,
      leavesQty: order.leavesQty,
      avgPrice: order.avgPrice,
      createdTime: order.createdTime,
      updatedTime: order.updatedTime,
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      price: order.price,
    });
  } catch (err) {
    const msg = err.retMsg || err.message || '주문 상태 조회 실패';
    console.error('[short1x] order-status 오류:', msg);
    return Response.json(
      { error: msg, retCode: err.retCode },
      { status: 502 }
    );
  }
}
