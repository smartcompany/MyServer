import { verifyToken, checkRateLimit } from '../../trade/middleware';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import querystring from 'querystring';
import { v4 as uuidv4 } from 'uuid';

const UPBIT_ACC_KEY = process.env.UPBIT_ACC_KEY;
const UPBIT_SEC_KEY = process.env.UPBIT_SEC_KEY;
const UPBIT_SERVER = 'https://api.upbit.com';

function maskAddress(addr) {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

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

function toNumberOrNaN(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number.NaN;
}

export async function POST(request) {
  const reqId = uuidv4();
  console.error(`[short1x][upbit-withdraw][${reqId}] POST entered`);

  try {
    const auth = verifyToken(request);
    if (auth.error) {
      console.error(`[short1x][upbit-withdraw][${reqId}] auth failed`, auth.error);
      return Response.json({ error: auth.error }, { status: auth.status });
    }

    // 출금 남용 방지: 사용자당 1분에 3회까지 허용
    const userId =
      auth.user?.id || auth.user?.userId || auth.user?.sub || auth.user?.email || 'unknown';
    const limited = checkRateLimit(userId, 'short1x:upbit-withdraw', 3, 60_000);
    if (limited) {
      return Response.json(
        { error: '업비트 출금 요청이 너무 자주 발생하고 있습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }

    let amount;
    let address;
    let secondaryAddress;
    let netType;
    let asset;

    try {
      const body = await request.json();
      amount = Number(body?.amount);
      address = String(body?.address || '').trim();
      secondaryAddress = String(body?.secondaryAddress || '').trim();
      netType = String(body?.netType || '').trim();
      asset = String(body?.asset || 'XRP').toUpperCase() === 'USDT' ? 'USDT' : 'XRP';
    } catch (parseErr) {
      console.error(`[short1x][upbit-withdraw][${reqId}] body parse error`, parseErr?.message);
      return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: `출금 수량(${asset})을 올바르게 입력해주세요.` }, { status: 400 });
    }
    if (!address || !netType) {
      return Response.json({ error: '출금 주소와 네트워크 타입이 필요합니다.' }, { status: 400 });
    }

    console.error(`[short1x][upbit-withdraw][${reqId}] start`, {
      currency: asset,
      netType,
      amount,
      address: maskAddress(address),
      hasSecondaryAddress: Boolean(secondaryAddress),
    });

    // 등록된 출금 허용 주소인지 재확인 (makeSimpleToken은 env 없으면 throw)
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
      console.error(`[short1x][upbit-withdraw][${reqId}] coin_addresses failed`, {
        status: listRes.status,
        message,
        body: listData,
      });
      return Response.json({ error: message }, { status: 502 });
    }

    const matched = Array.isArray(listData)
      ? listData.find(
          (item) =>
            item.currency === asset &&
            item.withdraw_address === address &&
            item.net_type === netType &&
            String(item.secondary_address || '') === secondaryAddress
        )
      : null;

    if (!matched) {
      console.error(`[short1x][upbit-withdraw][${reqId}] address not allowlisted`, {
        currency: asset,
        netType,
        address: maskAddress(address),
        secondaryAddress: secondaryAddress ? '(present)' : '(empty)',
      });
      return Response.json({ error: `등록된 ${asset} 출금 허용 주소가 아닙니다.` }, { status: 400 });
    }

    // 출금 가능 정보 조회: balance/locked, withdraw_fee, 최소 출금액 등을 확인
    const chanceParams = { currency: asset, net_type: netType };
    const chanceToken = makeQueryToken(chanceParams);
    const chanceRes = await fetch(
      `${UPBIT_SERVER}/v1/withdraws/chance?${querystring.encode(chanceParams)}`,
      {
        headers: {
          Authorization: `Bearer ${chanceToken}`,
          Accept: 'application/json',
        },
      }
    );
    const chanceData = await chanceRes.json().catch(() => ({}));
    if (!chanceRes.ok) {
      const message =
        chanceData?.error?.message || chanceData?.error?.name || '출금 가능 정보 조회 실패';
      console.error(`[short1x][upbit-withdraw][${reqId}] withdraw chance failed`, {
        status: chanceRes.status,
        message,
        body: chanceData,
      });
      return Response.json({ error: message }, { status: 502 });
    }

    const balance = toNumberOrNaN(chanceData?.account?.balance);
    const locked = toNumberOrNaN(chanceData?.account?.locked);
    const fee = toNumberOrNaN(chanceData?.currency?.withdraw_fee);
    const minimum = toNumberOrNaN(chanceData?.withdraw_limit?.minimum);
    const canWithdraw =
      chanceData?.withdraw_limit?.can_withdraw === true ||
      String(chanceData?.withdraw_limit?.can_withdraw).toLowerCase() === 'true';

    // Upbit 앱에서 보이는 "보유 {asset}"과 최대한 맞추기 위해
    // 여기서는 locked를 빼지 않고 balance 자체를 available로 사용한다.
    const available = Number.isFinite(balance) ? balance : NaN;

    console.error(`[short1x][upbit-withdraw][${reqId}] withdraw chance`, {
      balance,
      locked,
      available,
      fee,
      minimum,
      canWithdraw,
    });

    if (canWithdraw === false) {
      return Response.json(
        { error: `현재 업비트에서 ${asset} 출금이 불가능한 상태입니다(출금 제한/지갑 상태 확인).` },
        { status: 400 }
      );
    }

    if (Number.isFinite(minimum) && amount < minimum) {
      return Response.json(
        { error: `최소 출금 수량은 ${minimum} ${asset} 입니다.` },
        { status: 400 }
      );
    }

    // 업비트는 보통 출금 수수료가 별도로 차감됩니다: amount + fee <= available 이어야 함
    // 다만 일부 계정/상품에서는 available이 음수로 내려오는 케이스가 있어,
    // 이 경우에는 사전 차단하지 않고 업비트 원본 응답에 맡깁니다.
    if (
      Number.isFinite(available) &&
      available >= 0 &&
      Number.isFinite(fee) &&
      amount + fee > available
    ) {
      const maxSendable = Math.max(0, available - fee);
      return Response.json(
        {
          error:
            `출금 금액이 부족합니다. (사용 가능: ${available} ${asset}, 수수료: ${fee} ${asset})` +
            ` 최대 출금 가능(수수료 제외): ${maxSendable} ${asset}`,
        },
        { status: 400 }
      );
    }

    const params = {
      currency: asset,
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
      const message = data?.error?.message || data?.error?.name || `업비트 ${asset} 출금 실패`;
      console.error(`[short1x][upbit-withdraw][${reqId}] withdraw failed`, {
        status: res.status,
        message,
        body: data,
      });
      return Response.json({ error: message }, { status: 502 });
    }

    console.log(`[short1x][upbit-withdraw][${reqId}] withdraw accepted`, {
      uuid: data.uuid,
      state: data.state,
      amount: data.amount,
    });

    return Response.json({
      success: true,
      message: `업비트 ${asset} 출금 요청이 접수되었습니다.`,
      uuid: data.uuid,
      state: data.state,
      amount: data.amount,
    });
  } catch (error) {
    console.error(`[short1x][upbit-withdraw][${reqId}] unexpected error`, {
      message: error?.message,
      stack: error?.stack,
    });
    return Response.json(
      { error: error.message || `업비트 ${asset || 'XRP'} 출금 실패` },
      { status: 502 }
    );
  }
}
