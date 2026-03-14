import { verifyToken } from '../../trade/middleware';
import { bybitPublicGet } from '../bybit';

/** 펀딩 레이트 1회분(8h)을 연 수익률(%)로 환산. 8h 기준 1일 3회 → * 3 * 365 * 100 */
function annualizeFundingRate(rateDecimal) {
  const r = Number(rateDecimal);
  if (!Number.isFinite(r)) return null;
  return r * 3 * 365 * 100; // %
}

/**
 * GET: Bybit XRPUSD(inverse), XRPUSDT(linear) 현재 펀딩 레이트 + 최근 10일 평균 펀딩 레이트(연 수익률 환산)
 */
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const result = {
    xrpusd: { fundingRate: null, fundingRateAnnualized: null, avgFundingRate10d: null, avgFundingRate10dAnnualized: null, sumFundingRate10d: null },
    xrpusdt: { fundingRate: null, fundingRateAnnualized: null, avgFundingRate10d: null, avgFundingRate10dAnnualized: null, sumFundingRate10d: null },
  };

  try {
    // 1) XRPUSD (inverse) - 현재 펀딩
    try {
      const tickerInv = await bybitPublicGet('/v5/market/tickers?category=inverse&symbol=XRPUSD');
      const listInv = tickerInv?.result?.list || [];
      const inv = listInv[0];
      if (inv?.fundingRate != null) {
        result.xrpusd.fundingRate = Number(inv.fundingRate);
        result.xrpusd.fundingRateAnnualized = annualizeFundingRate(inv.fundingRate);
      }
    } catch (e) {
      // optional
    }

    // 2) XRPUSDT (linear) - 현재 펀딩
    try {
      const tickerLin = await bybitPublicGet('/v5/market/tickers?category=linear&symbol=XRPUSDT');
      const listLin = tickerLin?.result?.list || [];
      const lin = listLin[0];
      if (lin?.fundingRate != null) {
        result.xrpusdt.fundingRate = Number(lin.fundingRate);
        result.xrpusdt.fundingRateAnnualized = annualizeFundingRate(lin.fundingRate);
      }
    } catch (e) {
      // optional
    }

    // 3) XRPUSD 10일 펀딩 히스토리 (8h 간격 ≈ 30건 = 10일)
    try {
      const histInv = await bybitPublicGet('/v5/market/funding/history?category=inverse&symbol=XRPUSD&limit=30');
      const arrInv = histInv?.result?.list || [];
      if (arrInv.length > 0) {
        const sum = arrInv.reduce((s, i) => s + Number(i.fundingRate || 0), 0);
        const avg = sum / arrInv.length;
        result.xrpusd.avgFundingRate10d = avg;
        result.xrpusd.avgFundingRate10dAnnualized = annualizeFundingRate(avg);
        result.xrpusd.sumFundingRate10d = sum;
      }
    } catch (e) {
      // optional
    }

    // 4) XRPUSDT 10일 펀딩 히스토리
    try {
      const histLin = await bybitPublicGet('/v5/market/funding/history?category=linear&symbol=XRPUSDT&limit=30');
      const arrLin = histLin?.result?.list || [];
      if (arrLin.length > 0) {
        const sum = arrLin.reduce((s, i) => s + Number(i.fundingRate || 0), 0);
        const avg = sum / arrLin.length;
        result.xrpusdt.avgFundingRate10d = avg;
        result.xrpusdt.avgFundingRate10dAnnualized = annualizeFundingRate(avg);
        result.xrpusdt.sumFundingRate10d = sum;
      }
    } catch (e) {
      // optional
    }

    return Response.json(result);
  } catch (err) {
    console.error('[short1x][bybit-funding] error', err?.message);
    return Response.json(
      { error: err?.message || '펀딩 레이트 조회 실패' },
      { status: 502 }
    );
  }
}
