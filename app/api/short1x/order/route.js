import { verifyToken } from '../../trade/middleware';
import { bybitSignedRequest, bybitPublicGet, getBybitConfig } from '../bybit';
import { v4 as uuidv4 } from 'uuid';

// XRPUSD inverse perpetual (XRP를 담보로 하는 1배 숏 헤지용)
const SYMBOL = 'XRPUSD';
const CATEGORY = 'inverse';

/**
 * POST: XRPUSD 1배 숏 주문/청산 (Post-Only 리밋, inverse)
 * body: { qty: number | string, price: number | string, side?: 'Sell' | 'Buy' }
 *  - side 생략 시 기본값은 'Sell' (숏 진입)
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
  let price;
  let side;
  try {
    const body = await request.json();
    qty = body?.qty;
    price = body?.price;
    side = body?.side === 'Buy' ? 'Buy' : 'Sell';
    if (qty == null || qty === '') {
      return Response.json({ error: '수량(qty)을 입력해주세요.' }, { status: 400 });
    }
    if (price == null || price === '') {
      return Response.json({ error: '지정가 가격(price)을 입력해주세요.' }, { status: 400 });
    }

    qty = String(Number(qty));
    price = String(Number(price));

    if (Number(qty) <= 0 || !Number.isFinite(Number(qty))) {
      return Response.json({ error: '유효한 XRP 수량을 입력해주세요.' }, { status: 400 });
    }
    if (Number(price) <= 0 || !Number.isFinite(Number(price))) {
      return Response.json({ error: '유효한 지정가 가격(USDT)을 입력해주세요.' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    console.error(`[short1x][order][${reqId}] start`, {
      symbol: SYMBOL,
      category: CATEGORY,
      qty,
      price,
      side,
    });

    // 1) 레버리지 1배 설정
    await bybitSignedRequest('POST', '/v5/position/set-leverage', {
      category: CATEGORY,
      symbol: SYMBOL,
      buyLeverage: '1',
      sellLeverage: '1'
    });

    // 2) Post-Only 리밋 주문 (1배 숏 진입/청산)
    const orderBody = {
      category: CATEGORY,
      symbol: SYMBOL,
      side,
      orderType: 'Limit',
      qty,
      price,
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
      message:
        side === 'Buy'
          ? 'Post-Only 1x Short 청산 주문이 접수되었습니다.'
          : 'Post-Only 1x Short 진입 주문이 접수되었습니다.',
      orderId,
      orderLinkId,
      symbol: SYMBOL,
      qty,
      price,
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
