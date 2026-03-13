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

  let qty;          // 검증/계산용 qty
  let usdtValue;    // XRPUSDT에서 사용자가 보낸 주문 금액(USDT)
  let price;        // 지정가 (USDT)
  let side;
  let symbol = DEFAULT_SYMBOL;
  let category = DEFAULT_CATEGORY;
  try {
    const body = await request.json();
    console.error(`[short1x][order][${reqId}] request body (raw)`, JSON.stringify(body));

    qty = body?.qty;
    price = body?.price;
    side = body?.side === 'Buy' ? 'Buy' : 'Sell';
    if (String(body?.symbol).toUpperCase() === 'XRPUSDT') {
      symbol = 'XRPUSDT';
      category = 'linear';
    }
    if (qty == null || qty === '') {
      return Response.json({ error: '수량(qty)을 입력해주세요.' }, { status: 400 });
    }
    if (price == null || price === '') {
      return Response.json({ error: '지정가 가격(price)을 입력해주세요.' }, { status: 400 });
    }

    const qtyNum = Number(qty);
    qty = String(qtyNum);
    if (symbol === 'XRPUSDT') {
      usdtValue = qtyNum; // XRPUSDT에서는 qty는 USDT 금액 의미
    }
    price = String(Number(price));

    if (Number(qty) <= 0 || !Number.isFinite(Number(qty))) {
      const what = symbol === 'XRPUSDT' ? 'USDT 금액' : 'XRP 수량';
      return Response.json({ error: `유효한 ${what}을 입력해주세요.` }, { status: 400 });
    }
    if (Number(price) <= 0 || !Number.isFinite(Number(price))) {
      return Response.json({ error: '유효한 지정가 가격(USDT)을 입력해주세요.' }, { status: 400 });
    }

    // 최소 주문 금액 체크용 노션:
    // - XRPUSD: qty(XRP)×price
    // - XRPUSDT: 사용자가 입력한 주문 금액(USDT)
    const notionalUsd =
      symbol === 'XRPUSDT' ? Number(usdtValue) : Number(qty) * Number(price);
    if (notionalUsd < 5) {
      return Response.json(
        {
          error: '주문 금액(수량×지정가)이 최소 5 USD 이상이어야 합니다.',
          retCode: 110094,
          notionalUsd,
          minOrderValueUsd: 5,
        },
        { status: 400 }
      );
    }

    console.error(`[short1x][order][${reqId}] 파라미터 검증 후`, {
      qty,
      price,
      side,
      notionalUsd,
    });
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  // Bybit에 넘기는 qty:
  // - XRPUSD(inverse): qty = USD 노션(정수 USD)
  // - XRPUSDT(linear): qty = XRP 수량 = (주문 금액 USDT / 가격)
  if (symbol === 'XRPUSD') {
    const qtyUsd = Number(qty) * Number(price);
    qty = String(Math.round(qtyUsd));
  } else {
    const usdtValue = Number(qty);   // 사용자가 입력한 주문 금액(USDT)
    const priceNum = Number(price);  // 지정가(USDT)
    const xrpQty = priceNum > 0 ? usdtValue / priceNum : 0;
    if (!Number.isFinite(xrpQty) || xrpQty <= 0) {
      return Response.json(
        { error: '주문 금액이 너무 작습니다. USDT 금액과 가격을 확인해주세요.' },
        { status: 400 }
      );
    }
    // Bybit UI처럼 소수 한 자리까지 표시되는 걸 감안해서 소수 한 자리까지 전송
    qty = String(Math.floor(xrpQty * 10) / 10);
  }

  try {
    console.error(`[short1x][order][${reqId}] start`, {
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
        console.error(`[short1x][order][${reqId}] set leverage not modified`, {
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
      console.error(`[short1x][order][${reqId}] lotSizeFilter`, lotFilter, 'qty(USD) 전송:', qty);
    } catch (e) {
      console.error(`[short1x][order][${reqId}] instruments-info failed`, e?.message || e);
    }

    console.error(`[short1x][order][${reqId}] Bybit 주문 직전 최종 파라미터`, { qty, price, side });

    // 3) Post-Only 리밋 주문 (1배 숏 진입/청산)
    const orderBody = {
      category,
      symbol,
      side,
      orderType: 'Limit',
      qty,
      price,
      timeInForce: 'PostOnly',
      positionIdx: 0  // one-way mode
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
