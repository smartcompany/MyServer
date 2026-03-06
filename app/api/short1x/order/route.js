import { verifyToken } from '../../trade/middleware';
import { bybitSignedRequest, bybitPublicGet, getBybitConfig } from '../bybit';
import { v4 as uuidv4 } from 'uuid';

const SYMBOL = 'XRPUSDT';
const CATEGORY = 'linear';

/**
 * POST: XRPUSDT 1배 숏 주문 (Post-Only 리밋 매도)
 * body: { qty: number | string } - XRP 수량
 */
export async function POST(request) {
  const reqId = uuidv4();
  console.error(`[short1x][order][${reqId}] POST entered`);

  const auth = verifyToken(request);
  if (auth.error) {
    console.error(`[short1x][order][${reqId}] auth failed`, auth.error);
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    getBybitConfig(); // 환경 변수 확인
  } catch (e) {
    console.error(`[short1x][order][${reqId}] bybit config error`, e?.message || e);
    return Response.json(
      { error: 'Bybit API 키가 설정되지 않았습니다. .env.local에 BYBIT_API_KEY, BYBIT_API_SECRET을 넣어주세요.' },
      { status: 500 }
    );
  }

  let qty;
  try {
    const body = await request.json();
    qty = body?.qty;
    if (qty == null || qty === '') {
      return Response.json({ error: '수량(qty)을 입력해주세요.' }, { status: 400 });
    }
    qty = String(Number(qty));
    if (Number(qty) <= 0 || !Number.isFinite(Number(qty))) {
      return Response.json({ error: '유효한 XRP 수량을 입력해주세요.' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    console.error(`[short1x][order][${reqId}] start`, {
      symbol: SYMBOL,
      category: CATEGORY,
      qty,
    });

    // 1) 레버리지 1배 설정
    await bybitSignedRequest('POST', '/v5/position/set-leverage', {
      category: CATEGORY,
      symbol: SYMBOL,
      buyLeverage: '1',
      sellLeverage: '1'
    });

    // 2) 호가창에서 매도 1호가(ask1) 가격 조회 (Post-Only 매도는 이 가격에 걸어야 메이커)
    const ob = await bybitPublicGet(`/v5/market/orderbook?category=${CATEGORY}&symbol=${SYMBOL}&limit=1`);
    const asks = ob?.result?.a; // [ ["price", "size"], ... ]
    const bestAsk = asks?.[0]?.[0];
    console.error(`[short1x][order][${reqId}] orderbook`, {
      bestAsk,
      raw: Array.isArray(asks) ? asks[0] : asks,
    });

    if (!bestAsk) {
      return Response.json({ error: '호가창 조회 실패. 시장이 열려 있는지 확인해주세요.' }, { status: 502 });
    }

    // 3) Post-Only 리밋 매도 주문 (1배 숏 = 매도 포지션 오픈)
    const orderBody = {
      category: CATEGORY,
      symbol: SYMBOL,
      side: 'Sell',
      orderType: 'Limit',
      qty,
      price: bestAsk,
      timeInForce: 'PostOnly',
      positionIdx: 0  // one-way mode
    };
    console.error(`[short1x][order][${reqId}] create order request`, orderBody);

    const orderRes = await bybitSignedRequest('POST', '/v5/order/create', orderBody);
    const orderId = orderRes?.result?.orderId;
    const orderLinkId = orderRes?.result?.orderLinkId;

    console.error(`[short1x][order][${reqId}] order created`, {
      orderId,
      orderLinkId,
      result: orderRes?.result,
    });

    return Response.json({
      success: true,
      message: 'Post-Only 1x Short 주문이 접수되었습니다.',
      orderId,
      orderLinkId,
      symbol: SYMBOL,
      qty,
      price: bestAsk,
      timeInForce: 'PostOnly'
    });
  } catch (err) {
    const msg = err.retMsg || err.message || '주문 처리 중 오류가 발생했습니다.';
    const code = err.retCode;
    console.error('[short1x] Bybit 주문 오류:', msg, code, err);
    return Response.json(
      { error: msg, retCode: code },
      { status: code === 10001 ? 401 : 502 }
    );
  }
}
