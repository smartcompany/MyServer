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
    // Bybit v5 UNIFIED 계정에서는 availableToWithdraw가 0으로만 나오는 경우가 있어
    // 0 또는 NaN이면 지갑 잔고를 그대로 사용한다.
    let available = walletBalance;
    if (xrp && xrp.availableToWithdraw != null) {
      const n = Number(xrp.availableToWithdraw);
      if (Number.isFinite(n) && n > 0) {
        available = String(xrp.availableToWithdraw);
      }
    }

    const usdAvailable =
      account && account.totalAvailableBalance != null
        ? String(account.totalAvailableBalance)
        : null;

    const usdMarginBalance =
      account && account.totalMarginBalance != null
        ? String(account.totalMarginBalance)
        : null;

    const totalWalletBalance =
      account && account.totalWalletBalance != null
        ? String(account.totalWalletBalance)
        : null;

    const totalInitialMargin =
      account && account.totalInitialMargin != null
        ? String(account.totalInitialMargin)
        : null;

    return Response.json({
      xrp: available,
      xrpTotal: walletBalance,
      xrpEquity: equity,
      usdAvailable,
      usdMarginBalance,
      totalWalletBalance,
      totalInitialMargin,
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
