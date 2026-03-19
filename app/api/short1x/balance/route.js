import { verifyToken } from '../../trade/middleware';
import { bybitSignedRequest, getBybitConfig } from '../bybit';

/** Bybit 출금 가능 금액 API 응답에서 계정타입별 값 추출 */
function getWithdrawableFromResult(result, coin) {
  const wa = result?.withdrawableAmount || {};
  // UTA(Unified Trading), FUND, SPOT 등 실제 키 이름은 Bybit 응답에 따라 다를 수 있음
  const keys = Object.keys(wa);
  if (keys.length === 0) return null;
  const first = wa[keys[0]];
  const amount = first?.withdrawableAmount ?? first?.availableBalance;
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
      console.log('[short1x] balance withdrawable XRP raw result:', JSON.stringify(xrpRes?.result));
      console.log('[short1x] balance withdrawable USDT raw result:', JSON.stringify(usdtRes?.result));
      withdrawableXrp = getWithdrawableFromResult(xrpRes?.result, 'XRP');
      withdrawableUsdt = getWithdrawableFromResult(usdtRes?.result, 'USDT');
      console.log('[short1x] balance parsed withdrawableXrp=%s withdrawableUsdt=%s', withdrawableXrp, withdrawableUsdt);
    } catch (e) {
      console.error('[short1x] balance withdrawable 조회 실패:', e?.retMsg || e?.message || e);
    }

    // USDT 출금 수수료 (TRC20/TRX) — Bybit 코인 정보에서 조회
    let withdrawFeeUsdt = null;
    let withdrawPercentageFeeUsdt = null;
    try {
      const coinRes = await bybitSignedRequest('GET', '/v5/asset/coin/query-info?coin=USDT');
      console.log('[short1x] balance USDT coin info raw result:', JSON.stringify(coinRes?.result));
      const rows = coinRes?.result?.rows || [];
      const usdtRow = rows.find((r) => r.coin === 'USDT');
      const chains = usdtRow?.chains || [];
      const trxChain = chains.find(
        (c) => (c.chain || '').toUpperCase() === 'TRX' && c.chainWithdraw === '1'
      );
      if (trxChain) {
        const fee = trxChain.withdrawFee;
        const pct = trxChain.withdrawPercentageFee;
        if (fee != null && String(fee).trim() !== '') withdrawFeeUsdt = String(fee).trim();
        if (pct != null && String(pct).trim() !== '' && Number(pct) !== 0)
          withdrawPercentageFeeUsdt = String(pct).trim();
      } else {
        console.log('[short1x] balance USDT chains:', chains.map((c) => ({ chain: c.chain, chainWithdraw: c.chainWithdraw })));
      }
      console.log('[short1x] balance withdrawFeeUsdt=%s withdrawPercentageFeeUsdt=%s', withdrawFeeUsdt, withdrawPercentageFeeUsdt);
    } catch (e) {
      console.error('[short1x] balance USDT coin info 조회 실패:', e?.retMsg || e?.message || e);
    }

    const payload = {
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
    };
    console.log('[short1x] balance response payload:', JSON.stringify(payload));
    return Response.json(payload);
  } catch (err) {
    const msg = err.retMsg || err.message || '잔액 조회 실패';
    console.error('[short1x] 잔액 조회 오류:', msg);
    return Response.json(
      { error: msg },
      { status: 502 }
    );
  }
}
