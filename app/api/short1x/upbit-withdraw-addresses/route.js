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

export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const token = makeUpbitToken();
    const res = await fetch(`${UPBIT_SERVER}/v1/withdraws/coin_addresses`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      const message = data?.error?.message || data?.error?.name || '출금 주소 조회 실패';
      return Response.json({ error: message }, { status: 502 });
    }

    const addresses = Array.isArray(data)
      ? data
          .filter((item) => item.currency === 'XRP')
          .map((item) => ({
            currency: item.currency,
            net_type: item.net_type,
            network_name: item.network_name,
            withdraw_address: item.withdraw_address,
            secondary_address: item.secondary_address || '',
            exchange_name: item.exchange_name || '',
            wallet_type: item.wallet_type || '',
            beneficiary_name: item.beneficiary_name || '',
          }))
      : [];

    return Response.json({ addresses });
  } catch (error) {
    return Response.json(
      { error: error.message || '출금 주소 조회 실패' },
      { status: 502 }
    );
  }
}
