import { verifyToken, checkRateLimit } from '../../trade/middleware';
import { bybitSignedRequest, getBybitConfig } from '../bybit';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const UPBIT_ACC_KEY = process.env.UPBIT_ACC_KEY;
const UPBIT_SEC_KEY = process.env.UPBIT_SEC_KEY;
const UPBIT_SERVER = 'https://api.upbit.com';

function makeUpbitToken() {
  if (!UPBIT_ACC_KEY || !UPBIT_SEC_KEY) {
    throw new Error('UPBIT_ACC_KEY, UPBIT_SEC_KEY가 설정되지 않았습니다.');
  }
  return jwt.sign({ access_key: UPBIT_ACC_KEY, nonce: uuidv4() }, UPBIT_SEC_KEY);
}

function maskAddress(addr) {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

/**
 * POST: Bybit UNIFIED 계정에서 코인 출금 (업비트 등 외부 주소로)
 * body: {
 *   amount: number,
 *   address: string,
 *   tag?: string,
 *   chain?: string,
 *   asset?: 'XRP' | 'USDT'
 * }
 * - address, tag: 업비트 입금 주소 목록(화이트리스트) 중에서만 허용
 * - asset: 미입력 시 "XRP"
 * - chain: 미입력 시 XRP는 "XRP", USDT는 "TRX" 등으로 프론트에서 전달
 */
export async function POST(request) {
  const reqId = uuidv4();
  console.error(`[short1x][bybit-withdraw][${reqId}] POST entered`);

  const auth = verifyToken(request);
  if (auth.error) {
    console.error(`[short1x][bybit-withdraw][${reqId}] auth failed`, auth.error);
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // 출금 남용 방지: 사용자당 1분에 3회까지 허용
  const userId =
    auth.user?.id || auth.user?.userId || auth.user?.sub || auth.user?.email || 'unknown';
  const limited = checkRateLimit(userId, 'short1x:bybit-withdraw', 3, 60_000);
  if (limited) {
    return Response.json(
      { error: 'Bybit 출금 요청이 너무 자주 발생하고 있습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 }
    );
  }

  try {
    getBybitConfig();
  } catch (e) {
    console.error(`[short1x][bybit-withdraw][${reqId}] config error`, e?.message);
    return Response.json(
      { error: 'Bybit API 키가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  let amount;
  let address;
  let tag;
  let chain;
  let asset = 'XRP';

  try {
    const body = await request.json();
    amount = Number(body?.amount);
    address = String(body?.address ?? '').trim();
    tag = body?.tag != null ? String(body.tag).trim() : '';
    chain = body?.chain != null ? String(body.chain).trim() : '';
    if (body?.asset && typeof body.asset === 'string') {
      const a = body.asset.toUpperCase();
      if (a === 'USDT') asset = 'USDT';
      else asset = 'XRP';
    }
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json(
      { error: `출금 수량(${asset})을 올바르게 입력해주세요.` },
      { status: 400 }
    );
  }
  if (!address) {
    return Response.json({ error: '출금 주소를 입력해주세요.' }, { status: 400 });
  }
  if (!chain) {
    chain = asset === 'USDT' ? 'TRX' : 'XRP';
  }

  // 1차 방어: 업비트 입금 주소 목록(화이트리스트)와 일치하는 주소/태그/체인인지 확인
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
      const message = data?.error?.message || data?.error?.name || '입금 주소(화이트리스트) 조회 실패';
      return Response.json({ error: message }, { status: 502 });
    }

    const rawList = Array.isArray(data) ? data : data.addresses || data.data || [];
    const addresses = Array.isArray(rawList)
      ? rawList
          .filter(
            (item) =>
              (item.currency === 'XRP' || item.currency === 'USDT') &&
              (item.deposit_address || item.withdraw_address)
          )
          .map((item) => {
            const addr = String(item.deposit_address || item.withdraw_address || '').trim();
            let net = (item.net_type || (item.currency === 'USDT' ? 'TRX' : 'XRP')).toUpperCase();
            if (net === 'TRC20') net = 'TRX';
            return {
              currency: item.currency,
              net_type: net,
              deposit_address: addr,
              withdraw_address: addr,
              secondary_address: String(item.secondary_address || '').trim(),
            };
          })
      : [];

    const chainNorm = chain.toUpperCase();
    const matched = addresses.find(
      (item) =>
        item.currency === asset &&
        item.withdraw_address === address &&
        item.net_type === chainNorm &&
        String(item.secondary_address || '') === String(tag || '')
    );

    if (!matched) {
      return Response.json(
        {
          error: `업비트에 등록된 ${asset} 입금 주소(화이트리스트)가 아닙니다. 업비트에 ${asset} 입금 주소를 먼저 등록한 뒤 다시 시도해주세요.`,
        },
        { status: 400 }
      );
    }
  } catch (err) {
    return Response.json(
      {
        error:
          err?.message ||
          '업비트 입금 주소(화이트리스트) 검증 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      },
      { status: 502 }
    );
  }

  // Bybit 주소록에 등록할 때 사용한 chain 이름과 정확히 일치해야 함. USDT 트론은 UI에 따라 TRX 또는 TRC20
  const chainForBybit = asset === 'USDT' ? 'TRX' : chain;
  const payload = {
    coin: asset,
    chain: chainForBybit,
    address,
    amount: String(amount),
    timestamp: Date.now(),
    forceChain: 1,
    accountType: 'UTA',
    requestId: reqId.slice(0, 32),
  };
  if (tag && asset === 'XRP') payload.tag = tag;
  // USDT(TRC20)는 tag 미지원. 키 자체를 넣지 않음 (빈 문자열이면 오류 가능)
  if (asset === 'USDT' && payload.tag !== undefined) delete payload.tag;

  const mask = (s) => (s.length <= 10 ? s : `${s.slice(0, 6)}...${s.slice(-4)}`);

  async function doWithdraw(chainValue) {
    const p = { ...payload, chain: chainValue };
    return bybitSignedRequest('POST', '/v5/asset/withdraw/create', p);
  }

  try {
    console.error(`[short1x][bybit-withdraw][${reqId}] withdraw create`, {
      asset,
      chain: payload.chain,
      amount: payload.amount,
      addressMasked: mask(address),
      addressLength: address.length,
    });
    let res;
    try {
      res = await doWithdraw(chainForBybit);
    } catch (firstErr) {
      if (firstErr?.retCode === 131002 && asset === 'USDT' && chainForBybit === 'TRX') {
        console.error(`[short1x][bybit-withdraw][${reqId}] 131002 with TRX, retry with TRC20`);
        res = await doWithdraw('TRC20');
      } else {
        throw firstErr;
      }
    }
    const id = res?.result?.id;
    console.error(`[short1x][bybit-withdraw][${reqId}] success`, { id });
    return Response.json({
      success: true,
      message: `Bybit ${asset} 출금 요청이 접수되었습니다.`,
      withdrawId: id,
    });
  } catch (err) {
    let msg = err?.retMsg || err?.message || 'Bybit 출금 처리 중 오류가 발생했습니다.';
    const code = err?.retCode;
    if (code === 131002) {
      msg =
        'Bybit 출금 주소록(화이트리스트)에 해당 주소가 없습니다. Bybit 앱/웹에서 [자산] → [출금] → [주소록]에 업비트 입금 주소를 먼저 등록한 뒤 다시 시도해주세요. (https://www.bybit.com/user/assets/money-address)';
    } else if (typeof msg === 'string' && /permission denied|api key permission/i.test(msg)) {
      msg = 'API 키 권한 부족입니다. Bybit에서 해당 API 키에 [지갑 - 출금(Withdraw)] 권한을 활성화해주세요. (마스터 API 키만 출금 가능합니다.)';
    }
    console.error(`[short1x][bybit-withdraw][${reqId}] error`, { retCode: code, retMsg: msg });
    return Response.json(
      { error: msg, retCode: code },
      { status: code === 10001 ? 401 : 502 }
    );
  }
}
