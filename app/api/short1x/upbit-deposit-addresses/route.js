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
  return jwt.sign({ access_key: UPBIT_ACC_KEY, nonce: uuidv4() }, UPBIT_SEC_KEY);
}

/**
 * GET: 업비트 계정의 입금 주소 목록 (XRP만)
 * API 키에 [입금조회] 권한 필요
 */
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const token = makeUpbitToken();
    const res = await fetch(`${UPBIT_SERVER}/v1/deposits/coin_addresses`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.message || data?.error?.name || '입금 주소 조회 실패';
      return Response.json({ error: message }, { status: 502 });
    }

    // 업비트는 배열을 그대로 반환. XRP, USDT 등 입금 주소가 있는 것만 사용
    const rawList = Array.isArray(data) ? data : (data.addresses || data.data || []);
    const addresses = Array.isArray(rawList)
      ? rawList
          .filter((item) => (item.currency === 'XRP' || item.currency === 'USDT') && (item.deposit_address || item.withdraw_address))
          .map((item) => {
            const addr = item.deposit_address || item.withdraw_address || '';
            return {
              currency: item.currency,
              net_type: item.net_type || (item.currency === 'USDT' ? 'TRX' : 'XRP'),
              deposit_address: addr,
              withdraw_address: addr,
              secondary_address: item.secondary_address || '',
              exchange_name: item.exchange_name || '업비트',
            };
          })
      : [];

    return Response.json({ addresses });
  } catch (error) {
    return Response.json(
      { error: error.message || '입금 주소 조회 실패' },
      { status: 502 }
    );
  }
}
