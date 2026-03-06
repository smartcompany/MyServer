import { verifyToken } from '../../trade/middleware';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import querystring from 'querystring';
import { v4 as uuidv4 } from 'uuid';

const UPBIT_ACC_KEY = process.env.UPBIT_ACC_KEY;
const UPBIT_SEC_KEY = process.env.UPBIT_SEC_KEY;
const UPBIT_SERVER = 'https://api.upbit.com';

function makeQueryToken(params) {
  if (!UPBIT_ACC_KEY || !UPBIT_SEC_KEY) {
    throw new Error('UPBIT_ACC_KEY, UPBIT_SEC_KEY가 설정되지 않았어요');
  }
  const queryStr = querystring.encode(params);
  const queryHash = crypto.createHash('sha512').update(queryStr).digest('hex');
  return jwt.sign(
    {
      access_key: UPBIT_ACC_KEY,
      nonce: uuidv4(),
      query_hash: queryHash,
      query_hash_alg: 'SHA512',
    },
    UPBIT_SEC_KEY
  );
}

function makeSimpleToken() {
  if (!UPBIT_ACC_KEY || !UPBIT_SEC_KEY) {
    throw new Error('UPBIT_ACC_KEY, UPBIT_SEC_KEY가 설정되지 않았습니다.');
  }
  return jwt.sign({ access_key: UPBIT_ACC_KEY, nonce: uuidv4() }, UPBIT_SEC_KEY);
}

export async function POST(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let amount;
  let address;
  let secondaryAddress;
  let netType;

  try {
    const body = await request.json();
    amount = Number(body?.amount);
    address = String(body?.address || '').trim();
    secondaryAddress = String(body?.secondaryAddress || '').trim();
    netType = String(body?.netType || '').trim();
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: '출금 수량(XRP)을 올바르게 입력해주세요.' }, { status: 400 });
  }
  if (!address || !netType) {
    return Response.json({ error: '출금 주소와 네트워크 타입이 필요합니다.' }, { status: 400 });
  }

  try {
    // 등록된 출금 허용 주소인지 재확인
    const listToken = makeSimpleToken();
    const listRes = await fetch(`${UPBIT_SERVER}/v1/withdraws/coin_addresses`, {
      headers: {
        Authorization: `Bearer ${listToken}`,
        Accept: 'application/json',
      },
    });
    const listData = await listRes.json().catch(() => []);
    if (!listRes.ok) {
      const message = listData?.error?.message || listData?.error?.name || '출금 주소 검증 실패';
      return Response.json({ error: message }, { status: 502 });
    }

    const matched = Array.isArray(listData)
      ? listData.find(
          (item) =>
            item.currency === 'XRP' &&
            item.withdraw_address === address &&
            item.net_type === netType &&
            String(item.secondary_address || '') === secondaryAddress
        )
      : null;

    if (!matched) {
      return Response.json({ error: '등록된 XRP 출금 허용 주소가 아닙니다.' }, { status: 400 });
    }

    const params = {
      currency: 'XRP',
      net_type: netType,
      amount: String(amount),
      address,
    };
    if (secondaryAddress) {
      params.secondary_address = secondaryAddress;
    }

    const token = makeQueryToken(params);
    const res = await fetch(`${UPBIT_SERVER}/v1/withdraws/coin`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.message || data?.error?.name || '업비트 XRP 출금 실패';
      return Response.json({ error: message }, { status: 502 });
    }

    return Response.json({
      success: true,
      message: '업비트 XRP 출금 요청이 접수되었습니다.',
      uuid: data.uuid,
      state: data.state,
      amount: data.amount,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || '업비트 XRP 출금 실패' },
      { status: 502 }
    );
  }
}
