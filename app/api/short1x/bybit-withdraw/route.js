import { verifyToken } from '../../trade/middleware';
import { bybitSignedRequest, getBybitConfig } from '../bybit';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST: Bybit UNIFIED 계정에서 XRP 출금 (업비트 등 외부 주소로)
 * body: { amount: number, address: string, tag?: string, chain?: string }
 * - address, tag: 업비트 출금 주소록과 동일한 주소/태그. Bybit 주소록에 미리 등록 필수.
 * - chain: 미입력 시 "XRP" 사용
 */
export async function POST(request) {
  const reqId = uuidv4();
  console.error(`[short1x][bybit-withdraw][${reqId}] POST entered`);

  const auth = verifyToken(request);
  if (auth.error) {
    console.error(`[short1x][bybit-withdraw][${reqId}] auth failed`, auth.error);
    return Response.json({ error: auth.error }, { status: auth.status });
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

  try {
    const body = await request.json();
    amount = Number(body?.amount);
    address = String(body?.address ?? '').trim();
    tag = body?.tag != null ? String(body.tag).trim() : '';
    chain = body?.chain != null ? String(body.chain).trim() : 'XRP';
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: '출금 수량(XRP)을 올바르게 입력해주세요.' }, { status: 400 });
  }
  if (!address) {
    return Response.json({ error: '출금 주소를 입력해주세요.' }, { status: 400 });
  }
  if (!chain) chain = 'XRP';

  const payload = {
    coin: 'XRP',
    chain,
    address,
    amount: String(amount),
    timestamp: Date.now(),
    forceChain: 1,
    accountType: 'UTA', // UTA(유니파이드) 지갑에서만 출금
    requestId: reqId.slice(0, 32),
  };
  if (tag) payload.tag = tag;

  try {
    console.error(`[short1x][bybit-withdraw][${reqId}] withdraw create`, {
      coin: 'XRP',
      chain: payload.chain,
      amount: payload.amount,
      address: `${address.slice(0, 8)}...`,
      hasTag: Boolean(tag),
    });
    const res = await bybitSignedRequest('POST', '/v5/asset/withdraw/create', payload);
    const id = res?.result?.id;
    console.error(`[short1x][bybit-withdraw][${reqId}] success`, { id });
    return Response.json({
      success: true,
      message: 'Bybit XRP 출금 요청이 접수되었습니다.',
      withdrawId: id,
    });
  } catch (err) {
    let msg = err?.retMsg || err?.message || 'Bybit 출금 처리 중 오류가 발생했습니다.';
    const code = err?.retCode;
    if (typeof msg === 'string' && /permission denied|api key permission/i.test(msg)) {
      msg = 'API 키 권한 부족입니다. Bybit에서 해당 API 키에 [지갑 - 출금(Withdraw)] 권한을 활성화해주세요. (마스터 API 키만 출금 가능합니다.)';
    }
    console.error(`[short1x][bybit-withdraw][${reqId}] error`, { retCode: code, retMsg: msg });
    return Response.json(
      { error: msg, retCode: code },
      { status: code === 10001 ? 401 : 502 }
    );
  }
}
