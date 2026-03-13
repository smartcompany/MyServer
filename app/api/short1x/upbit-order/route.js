import { verifyToken } from '../../trade/middleware';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import querystring from 'querystring';
import { v4 as uuidv4 } from 'uuid';

const UPBIT_ACC_KEY = process.env.UPBIT_ACC_KEY;
const UPBIT_SEC_KEY = process.env.UPBIT_SEC_KEY;
const UPBIT_SERVER = 'https://api.upbit.com';

function makeOrderToken(orderData) {
  if (!UPBIT_ACC_KEY || !UPBIT_SEC_KEY) {
    throw new Error('UPBIT_ACC_KEY, UPBIT_SEC_KEY가 설정되지 않았습니다.');
  }
  const queryStr = querystring.encode(orderData);
  const queryHash = crypto.createHash('sha512').update(queryStr).digest('hex');
  const payload = {
    access_key: UPBIT_ACC_KEY,
    nonce: uuidv4(),
    query_hash: queryHash,
    query_hash_alg: 'SHA512',
  };
  return jwt.sign(payload, UPBIT_SEC_KEY);
}

/**
 * POST: 업비트 KRW-XRP / KRW-USDT 지정가 매수/매도 주문
 * body: { price: number (원), volume: number (수량), side?: 'bid' | 'ask', asset?: 'XRP' | 'USDT' }
 * - side 기본값 'bid'(매수)
 * - asset 기본값 'XRP'
 */
export async function POST(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  if (!UPBIT_ACC_KEY || !UPBIT_SEC_KEY) {
    return Response.json(
      { error: '업비트 API 키가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  let price, volume, side, asset;
  try {
    const body = await request.json();
    price = Number(body?.price);
    volume = Number(body?.volume);
    asset = body?.asset === 'USDT' ? 'USDT' : 'XRP';
    side = body?.side === 'ask' ? 'ask' : 'bid';
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(volume) || volume <= 0) {
      return Response.json(
        { error: `가격(원)과 수량(${asset})을 올바르게 입력해주세요.` },
        { status: 400 }
      );
    }
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const orderData = {
    market: asset === 'USDT' ? 'KRW-USDT' : 'KRW-XRP',
    side,
    price: String(Math.round(price)),
    volume: String(volume),
    ord_type: 'limit',
  };

  try {
    const token = makeOrderToken(orderData);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const res = await fetch(`${UPBIT_SERVER}/v1/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(orderData),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || data.error?.name || JSON.stringify(data) || res.statusText;
      return Response.json({ error: msg }, { status: 502 });
    }
    return Response.json({
      success: true,
      message:
        side === 'ask'
          ? `업비트 ${asset} 지정가 매도 주문이 접수되었습니다.`
          : `업비트 ${asset} 지정가 매수 주문이 접수되었습니다.`,
      uuid: data.uuid,
      price,
      volume,
    });
  } catch (err) {
    console.error('[short1x] 업비트 주문 오류:', err.message);
    return Response.json(
      { error: err.message || '업비트 주문 실패' },
      { status: 502 }
    );
  }
}
