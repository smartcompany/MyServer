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
    const res = await bybitSignedRequest(
      'GET',
      `/v5/order/history?category=${category}&symbol=${symbol}&orderId=${encodeURIComponent(orderId.trim())}&limit=1`
    );
    const list = res?.result?.list || [];
    const order = list[0] || null;

    if (!order) {
      return Response.json({
        found: false,
        orderId: orderId.trim(),
        message: '해당 주문을 찾을 수 없거나 기간이 지났습니다. (7일 이내만 조회 가능)',
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
