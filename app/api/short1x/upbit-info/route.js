import { verifyToken } from '../../trade/middleware';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const UPBIT_ACC_KEY = process.env.UPBIT_ACC_KEY;
const UPBIT_SEC_KEY = process.env.UPBIT_SEC_KEY;
const UPBIT_SERVER = 'https://api.upbit.com';

function makeUpbitToken() {
  if (!UPBIT_ACC_KEY || !UPBIT_SEC_KEY) {
    throw new Error('UPBIT_ACC_KEY, UPBIT_SEC_KEY가 설정되지 않았습니다.');
  }
  const payload = { access_key: UPBIT_ACC_KEY, nonce: uuidv4() };
  return jwt.sign(payload, UPBIT_SEC_KEY);
}

/**
 * GET: 업비트 보유 XRP, XRP 지정가 매수 주문 금액(KRW)
 */
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  if (!UPBIT_ACC_KEY || !UPBIT_SEC_KEY) {
    return Response.json(
      { error: '업비트 API 키가 설정되지 않았습니다. (.env에 UPBIT_ACC_KEY, UPBIT_SEC_KEY)' },
      { status: 500 }
    );
  }

  try {
    const token = makeUpbitToken();
    const headers = { Authorization: `Bearer ${token}` };

    // 1) 계정 보유 현금/코인
    const accountsRes = await fetch(`${UPBIT_SERVER}/v1/accounts`, { headers });
    if (!accountsRes.ok) {
      const errText = await accountsRes.text();
      return Response.json(
        { error: '업비트 계정 조회 실패', details: errText },
        { status: 502 }
      );
    }
    const accounts = await accountsRes.json();
    const xrpAccount = Array.isArray(accounts) ? accounts.find((a) => a.currency === 'XRP') : null;
    const upbitXrpBalance = xrpAccount ? String(xrpAccount.balance ?? '0') : '0';

    // 2) KRW-XRP 체결 대기 주문 중 매수 주문 금액 합계
    const ordersRes = await fetch(`${UPBIT_SERVER}/v1/orders?market=KRW-XRP&state=wait`, { headers });
    let upbitXrpBuyOrderKrw = 0;
    if (ordersRes.ok) {
      const orders = await ordersRes.json();
      if (Array.isArray(orders)) {
        for (const o of orders) {
          if (o.side === 'bid' && o.price != null && o.volume != null) {
            upbitXrpBuyOrderKrw += Number(o.price) * Number(o.volume);
          }
        }
      }
    }

    return Response.json({
      upbitXrpBalance,
      upbitXrpBuyOrderKrw: Math.round(upbitXrpBuyOrderKrw),
    });
  } catch (err) {
    console.error('[short1x] 업비트 정보 조회 오류:', err.message);
    return Response.json(
      { error: err.message || '업비트 정보 조회 실패' },
      { status: 502 }
    );
  }
}
