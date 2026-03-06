import { verifyToken } from '../../trade/middleware';
import { bybitSignedRequest, getBybitConfig } from '../bybit';

/**
 * GET: Bybit 계정의 XRP 보유 수량 (UNIFIED 계정 기준)
 */
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
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
      '/v5/account/wallet-balance?accountType=UNIFIED&coin=XRP'
    );
    const list = res?.result?.list || [];
    const account = list[0];
    const coins = account?.coin || [];
    const xrp = coins.find((c) => c.coin === 'XRP');
    const walletBalance = xrp ? String(xrp.walletBalance || '0') : '0';
    const equity = xrp ? String(xrp.equity || '0') : '0';

    return Response.json({
      xrp: walletBalance,
      xrpEquity: equity,
      accountType: account?.accountType || 'UNIFIED'
    });
  } catch (err) {
    const msg = err.retMsg || err.message || '잔액 조회 실패';
    console.error('[short1x] 잔액 조회 오류:', msg);
    return Response.json(
      { error: msg },
      { status: 502 }
    );
  }
}
