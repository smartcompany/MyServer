import { verifyToken } from '../../trade/middleware';
import { bybitSignedRequest, bybitPublicGet, getBybitConfig } from '../bybit';
import { v4 as uuidv4 } from 'uuid';

// 기본값: XRPUSD inverse perpetual (XRP 담보 1배 숏)
const DEFAULT_SYMBOL = 'XRPUSD';
const DEFAULT_CATEGORY = 'inverse';

/**
 * POST: XRPUSD 1배 숏 주문/청산 (Post-Only 리밋, inverse)
 * body: { qty: number | string, price: number | string, side?: 'Sell' | 'Buy' }
 *  - qty: 사용자 입력 XRP 수량. Bybit에는 qty 파라미터로 USD(노션) = qty * price 를 보냄.
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

  let qty;   // 요청: XRPUSD면 USD 금액, XRPUSDT면 XRP 수량. Bybit에는 그대로 전달(반올림/절삭만)
  let price; // 지정가 (USDT)
  let side;
  let symbol = DEFAULT_SYMBOL;
  let category = DEFAULT_CATEGORY;
  try {
    const body = await request.json();
    console.log(`[short1x][order][${reqId}] request body (raw)`, JSON.stringify(body));

    qty = body?.qty;
    price = body?.price;
    side = body?.side === 'Buy' ? 'Buy' : 'Sell';
    if (String(body?.symbol).toUpperCase() === 'XRPUSDT') {
      symbol = 'XRPUSDT';
      category = 'linear';
    }
    if (qty == null || qty === '') {
      return Response.json({ error: '수량/금액을 입력해주세요.' }, { status: 400 });
    }
    if (price == null || price === '') {
      return Response.json({ error: '지정가 가격(price)을 입력해주세요.' }, { status: 400 });
    }

    const qtyNum = Number(qty);
    price = String(Number(price));
    if (Number(qtyNum) <= 0 || !Number.isFinite(qtyNum)) {
      const what = symbol === 'XRPUSD' ? 'USD 금액' : 'XRP 수량';
      return Response.json({ error: `유효한 ${what}을 입력해주세요.` }, { status: 400 });
    }
    if (Number(price) <= 0 || !Number.isFinite(Number(price))) {
      return Response.json({ error: '유효한 지정가 가격(USDT)을 입력해주세요.' }, { status: 400 });
    }

    const notionalUsd = symbol === 'XRPUSD' ? qtyNum : qtyNum * Number(price);
    qty = String(qtyNum);

    console.log(`[short1x][order][${reqId}] 파라미터 검증 후`, {
      qty,
      price,
      side,
      notionalUsd,
    });
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  // Bybit에 넘기는 qty: 받은 값 그대로 전달. XRPUSD는 정수 USD, XRPUSDT는 XRP 수량(소수 한 자리 절삭)
  if (symbol === 'XRPUSD') {
    qty = String(Math.round(Number(qty)));
  } else {
    qty = String(Math.floor(Number(qty) * 10) / 10);
  }

  try {
    console.log(`[short1x][order][${reqId}] start`, {
      symbol,
      category,
      qty,
      price,
      side,
    });

    // 1) 레버리지 1배 설정 (이미 1배인 경우 Bybit가 'leverage not modified' 에러를 줄 수 있음)
    try {
      await bybitSignedRequest('POST', '/v5/position/set-leverage', {
        category,
        symbol,
        buyLeverage: '1',
        sellLeverage: '1'
      });
    } catch (e) {
      const code = e?.retCode;
      const msg = e?.retMsg || e?.message || '';
      if (
        code === 110043 ||
        (typeof msg === 'string' && msg.toLowerCase().includes('leverage not modified'))
      ) {
        // 이미 레버리지가 1배로 설정된 경우이므로 무시하고 계속 진행
        console.log(`[short1x][order][${reqId}] set leverage not modified`, {
          message: msg,
          retCode: code,
        });
      } else {
        throw e;
      }
    }

    // 2) qty는 USD로 보냄. lotSizeFilter는 XRP 기준이므로 보정하지 않음.
    try {
      const infoRes = await bybitPublicGet(
        `/v5/market/instruments-info?category=${category}&symbol=${symbol}`
      );
      const list = infoRes?.result?.list || [];
      const instrument = list[0];
      const lotFilter = instrument?.lotSizeFilter;
      console.log(`[short1x][order][${reqId}] lotSizeFilter`, lotFilter, 'qty(USD) 전송:', qty);
    } catch (e) {
      console.error(`[short1x][order][${reqId}] instruments-info failed`, e?.message || e);
    }

    console.log(`[short1x][order][${reqId}] Bybit 주문 직전 최종 파라미터`, { qty, price, side });

    // 3) Post-Only 리밋 주문 (1배 숏 진입/청산)
    const orderBody = {
      category,
      symbol,
      side,
      orderType: 'Limit',
      qty,
      price,
      timeInForce: 'PostOnly',
      positionIdx: 0,  // one-way mode
      // 청산(Buy)은 Close by Limit처럼 reduce-only로 강제 (반대로 포지션 열리는 것 방지)
      ...(side === 'Buy' ? { reduceOnly: true } : {}),
    };
    console.error(`[short1x][order][${reqId}] create order request (Bybit 전송 body)`, orderBody);

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
      symbol,
      qty,
      price,
      timeInForce: 'PostOnly'
    });
  } catch (err) {
    const msg = err.retMsg || err.message || '주문 처리 중 오류가 발생했습니다.';
    const code = err.retCode;
    const extInfo = err.retExtInfo;
    const result = err.result;

    console.error(`[short1x][order][${reqId}] Bybit 주문 오류`, {
      retCode: code,
      retMsg: msg,
      retExtInfo: extInfo,
      result,
      fullError: err,
    });

    const detail =
      code != null
        ? extInfo != null && typeof extInfo === 'object'
          ? `${msg} (retCode: ${code}, retExtInfo: ${JSON.stringify(extInfo)})`
          : `${msg} (retCode: ${code})`
        : msg;

    return Response.json(
      {
        error: msg,
        errorDetail: detail,
        retCode: code,
        retExtInfo: extInfo,
        result,
      },
      { status: code === 10001 ? 401 : 502 }
    );
  }
}
