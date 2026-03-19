import { verifyToken } from '../../trade/middleware';
import { bybitSignedRequest, getBybitConfig } from '../bybit';

/** Bybit 출금 가능 금액 API 응답에서 UTA(또는 FUND) 값 추출 */
function getWithdrawableFromResult(result, coin) {
  const wa = result?.withdrawableAmount || {};
  const uta = wa.UTA || wa.FUND || wa.SPOT;
  const amount = uta?.withdrawableAmount ?? uta?.availableBalance;
  if (amount != null && String(amount).trim() !== '') return String(amount).trim();
  return null;
}

/**
 * GET: Bybit UNIFIED 계정 잔고 + 출금 가능 금액
 * - 지갑/마진: /v5/account/wallet-balance
 * - 출금 가능: /v5/asset/withdraw/withdrawable-amount (XRP, USDT 각각 호출)
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
      '/v5/account/wallet-balance?accountType=UNIFIED'
    );
    const list = res?.result?.list || [];
    const account = list[0];
    const coins = account?.coin || [];
    const xrp = coins.find((c) => c.coin === 'XRP');

    const walletBalance = xrp ? String(xrp.walletBalance || '0') : '0';
    const equity = xrp ? String(xrp.equity || '0') : '0';
    const usdAvailable =
      account?.totalAvailableBalance != null ? String(account.totalAvailableBalance) : null;
    const usdMarginBalance =
      account?.totalMarginBalance != null ? String(account.totalMarginBalance) : null;
    const totalWalletBalance =
      account?.totalWalletBalance != null ? String(account.totalWalletBalance) : null;
    const totalInitialMargin =
      account?.totalInitialMargin != null ? String(account.totalInitialMargin) : null;

    // 출금 가능 금액은 전용 API로만 조회 (분기 최소화)
    let withdrawableXrp = null;
    let withdrawableUsdt = null;
    try {
      const [xrpRes, usdtRes] = await Promise.all([
        bybitSignedRequest('GET', '/v5/asset/withdraw/withdrawable-amount?coin=XRP'),
        bybitSignedRequest('GET', '/v5/asset/withdraw/withdrawable-amount?coin=USDT'),
      ]);
      withdrawableXrp = getWithdrawableFromResult(xrpRes?.result, 'XRP');
      withdrawableUsdt = getWithdrawableFromResult(usdtRes?.result, 'USDT');
    } catch (e) {
      console.error('[short1x] balance withdrawable 조회 실패:', e?.retMsg || e?.message || e);
    }

    // USDT 출금 수수료 (TRC20/TRX) — Bybit 코인 정보에서 조회
    let withdrawFeeUsdt = null;
    let withdrawPercentageFeeUsdt = null;
    try {
      const coinRes = await bybitSignedRequest('GET', '/v5/asset/coin/query-info?coin=USDT');
      const rows = coinRes?.result?.rows || [];
      const usdtRow = rows.find((r) => r.coin === 'USDT');
      const trxChain = usdtRow?.chains?.find(
        (c) => (c.chain || '').toUpperCase() === 'TRX' && c.chainWithdraw === '1'
      );
      if (trxChain) {
        const fee = trxChain.withdrawFee;
        const pct = trxChain.withdrawPercentageFee;
        if (fee != null && String(fee).trim() !== '') withdrawFeeUsdt = String(fee).trim();
        if (pct != null && String(pct).trim() !== '' && Number(pct) !== 0)
          withdrawPercentageFeeUsdt = String(pct).trim();
      }
    } catch (e) {
      console.error('[short1x] balance USDT coin info 조회 실패:', e?.retMsg || e?.message || e);
    }

    return Response.json({
      xrp: walletBalance,
      xrpTotal: walletBalance,
      xrpEquity: equity,
      usdAvailable,
      usdMarginBalance,
      totalWalletBalance,
      totalInitialMargin,
      accountType: account?.accountType || 'UNIFIED',
      withdrawableXrp,
      withdrawableUsdt,
      withdrawFeeUsdt,
      withdrawPercentageFeeUsdt,
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
