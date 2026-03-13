import { verifyToken } from '../../trade/middleware';
import { bybitSignedRequest, getBybitConfig } from '../bybit';

const DEFAULT_SYMBOL = 'XRPUSD';
const DEFAULT_CATEGORY = 'inverse';

/**
 * GET: Bybit XRPUSD 포지션 정보 (수량, 방향, 평균가, 증거금 등)
 */
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let symbol = DEFAULT_SYMBOL;
  let category = DEFAULT_CATEGORY;
  const url = new URL(request.url);
  const symbolParam = url.searchParams.get('symbol');
  if (symbolParam && symbolParam.toUpperCase() === 'XRPUSDT') {
    symbol = 'XRPUSDT';
    category = 'linear';
  }

  try {
    getBybitConfig();
  } catch (e) {
    return Response.json(
      { error: 'Bybit API 키가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  try {
    const res = await bybitSignedRequest(
      'GET',
      `/v5/position/list?category=${category}&symbol=${symbol}`
    );
    const list = res?.result?.list || [];
    const pos = list[0] || {};

    const sizeStr = pos.size != null ? String(pos.size) : '0';
    const sizeNum = Number(sizeStr);

    return Response.json({
      symbol: pos.symbol || symbol,
      side: pos.side || (sizeNum > 0 ? 'Sell' : sizeNum < 0 ? 'Buy' : null),
      size: sizeStr,
      avgPrice: pos.avgPrice ?? null,
      positionValue: pos.positionValue ?? null,
      leverage: pos.leverage ?? null,
      positionMargin: pos.positionIM ?? null,
      positionIdx: pos.positionIdx ?? null,
    });
  } catch (err) {
    const msg = err.retMsg || err.message || '포지션 조회 실패';
    console.error('[short1x] Bybit 포지션 조회 오류:', msg);
    return Response.json(
      { error: msg },
      { status: 502 }
    );
  }
}

