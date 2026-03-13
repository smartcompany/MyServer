import { verifyToken } from '../../trade/middleware';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { bybitPublicGet } from '../bybit';
import axios from 'axios';
import * as cheerio from 'cheerio';

const UPBIT_ACC_KEY = process.env.UPBIT_ACC_KEY;
const UPBIT_SEC_KEY = process.env.UPBIT_SEC_KEY;
const UPBIT_SERVER = 'https://api.upbit.com';
const NAVER_EXCHANGE_RATE_URL =
  'https://finance.naver.com/marketindex/exchangeDailyQuote.naver?marketindexCd=FX_USDKRW';

function makeUpbitToken() {
  if (!UPBIT_ACC_KEY || !UPBIT_SEC_KEY) {
    throw new Error('UPBIT_ACC_KEY, UPBIT_SEC_KEY가 설정되지 않았습니다.');
  }
  const payload = { access_key: UPBIT_ACC_KEY, nonce: uuidv4() };
  return jwt.sign(payload, UPBIT_SEC_KEY);
}

/**
 * GET: 업비트 보유 XRP, KRW 잔고, XRP 지정가 매수 주문 금액, 현재 XRP 가격
 */
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  if (!UPBIT_ACC_KEY || !UPBIT_SEC_KEY) {
    return Response.json(
      { error: '업비트 API 키가 설정되지 않았습니다. (.env에 UPBIT_ACC_KEY, UPBIT_SEC_KEY)' },
      { status: 500 }
    );
  }

  try {
    const result = {
      upbitXrpBalance: null,
      upbitKrwBalance: null,
      upbitUsdtBalance: null,
      upbitXrpBuyOrderKrw: null,
      upbitUsdtBuyOrderKrw: null,
      xrpPrice: null,
      usdKrwRate: null,
      usdtKrwPrice: null,
      bybitXrpUsdPrice: null,
      bybitXrpUsdtPrice: null,
      kimchiPremium: null,
      accountError: null,
      ordersError: null,
      priceError: null,
      kimchiError: null,
    };

    // 1) 계정 보유 현금/코인
    try {
      const token = makeUpbitToken();
      const headers = { Authorization: `Bearer ${token}` };
      const accountsRes = await fetch(`${UPBIT_SERVER}/v1/accounts`, { headers });
      if (!accountsRes.ok) {
        const errText = await accountsRes.text();
        result.accountError = `업비트 계정 조회 실패: ${errText || accountsRes.status}`;
      } else {
        const accounts = await accountsRes.json();
        const xrpAccount = Array.isArray(accounts) ? accounts.find((a) => a.currency === 'XRP') : null;
        const krwAccount = Array.isArray(accounts) ? accounts.find((a) => a.currency === 'KRW') : null;
        const usdtAccount = Array.isArray(accounts) ? accounts.find((a) => a.currency === 'USDT') : null;
        result.upbitXrpBalance = xrpAccount ? String(xrpAccount.balance ?? '0') : '0';
        result.upbitKrwBalance = krwAccount ? String(krwAccount.balance ?? '0') : '0';
        result.upbitUsdtBalance = usdtAccount ? String(usdtAccount.balance ?? '0') : '0';
      }
    } catch (e) {
      result.accountError = `업비트 계정 조회 실패: ${e?.message || '네트워크 오류'}`;
    }

    // 2) 체결 대기 주문 중 매수 주문 금액 합계 (XRP, USDT)
    try {
      // GET /v1/orders 에 쿼리스트링을 붙이면 query_hash 서명이 필요해서
      // 여기서는 파라미터 없이 전체 wait 주문을 가져온 뒤 KRW-XRP만 필터링합니다.
      const token = makeUpbitToken();
      const headers = { Authorization: `Bearer ${token}` };
      const ordersRes = await fetch(`${UPBIT_SERVER}/v1/orders`, { headers });
      if (!ordersRes.ok) {
        const errText = await ordersRes.text();
        result.ordersError = `주문 정보 조회 실패: ${errText || ordersRes.status}`;
      } else {
        const orders = await ordersRes.json();
        let sumXrp = 0;
        let sumUsdt = 0;
        if (Array.isArray(orders)) {
          for (const o of orders) {
            if (o.side === 'bid' && o.price != null && o.volume != null) {
              const value = Number(o.price) * Number(o.volume);
              if (o.market === 'KRW-XRP') {
                sumXrp += value;
              } else if (o.market === 'KRW-USDT') {
                sumUsdt += value;
              }
            }
          }
        }
        result.upbitXrpBuyOrderKrw = Math.round(sumXrp);
        result.upbitUsdtBuyOrderKrw = Math.round(sumUsdt);
      }
    } catch (e) {
      result.ordersError = `주문 정보 조회 실패: ${e?.message || '네트워크 오류'}`;
    }

    // 3) 현재 XRP 가격 (최근 체결가) - 공개 API, 로그인 없이도 가능
    try {
      const tickerRes = await fetch(`${UPBIT_SERVER}/v1/ticker?markets=KRW-XRP`);
      if (!tickerRes.ok) {
        const errText = await tickerRes.text();
        result.priceError = `가격 조회 실패: ${errText || tickerRes.status}`;
      } else {
        const tickerData = await tickerRes.json();
        if (Array.isArray(tickerData) && tickerData[0]?.trade_price != null) {
          result.xrpPrice = Number(tickerData[0].trade_price);
        } else {
          result.priceError = '가격 데이터 없음';
        }
      }
    } catch (e) {
      result.priceError = `가격 조회 실패: ${e?.message || '네트워크 오류'}`;
    }

    // 4) 환율 (USD/KRW) - 네이버 환율 페이지 사용
    try {
      const response = await axios.get(`${NAVER_EXCHANGE_RATE_URL}&page=1`);
      if (response.status === 200) {
        const $ = cheerio.load(response.data);
        const rows = $('table.tbl_exchange tbody tr');
        if (rows.length > 0) {
          const firstRow = rows.first();
          const tds = firstRow.find('td');
          const rateStr = $(tds[1]).text().trim().replace(/,/g, '');
          const rate = parseFloat(rateStr);
          if (!isNaN(rate)) {
            result.usdKrwRate = rate;
          }
        }
      }
    } catch {
      // 환율이 없어도 나머지는 동작 가능
    }

    // 5) USDT 가격 (USDT-KRW) - Upbit KRW-USDT 티커 사용
    try {
      const fxRes = await fetch(`${UPBIT_SERVER}/v1/ticker?markets=KRW-USDT`);
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        if (Array.isArray(fxData) && fxData[0]?.trade_price != null) {
          result.usdtKrwPrice = Number(fxData[0].trade_price);
        }
      }
    } catch {
      // 환율이 없어도 나머지는 동작 가능
    }

    // 6) Bybit XRPUSD 퍼페추얼 가격 (USD 기준, 1x 숏 헤지 기준)
    try {
      const bybitRes = await bybitPublicGet('/v5/market/tickers?category=inverse&symbol=XRPUSD');
      const list = bybitRes?.result?.list || bybitRes?.result || [];
      const item = Array.isArray(list) ? list[0] : null;
      const lastPrice = item?.lastPrice || item?.last_price || item?.markPrice;
      if (lastPrice != null) {
        result.bybitXrpUsdPrice = Number(lastPrice);
      } else {
        result.kimchiError = 'Bybit XRPUSD 가격 데이터를 찾을 수 없습니다.';
      }
    } catch (e) {
      result.bybitXrpUsdPrice = null;
      result.kimchiError = `Bybit 가격 조회 실패: ${e?.message || '네트워크 오류'}`;
    }

    // 6-2) Bybit XRPUSDT 선물 가격 (원하면 이 심볼로 전환)
    try {
      const bybitRes = await bybitPublicGet('/v5/market/tickers?category=linear&symbol=XRPUSDT');
      const list = bybitRes?.result?.list || bybitRes?.result || [];
      const item = Array.isArray(list) ? list[0] : null;
      const lastPrice = item?.lastPrice || item?.last_price || item?.markPrice;
      if (lastPrice != null) {
        result.bybitXrpUsdtPrice = Number(lastPrice);
      }
    } catch {
      // optional
    }

    // 7) 김치 프리미엄 계산 (Upbit KRW 가격 vs Bybit USD * 환율)
    if (result.xrpPrice != null && result.usdKrwRate != null && result.bybitXrpUsdPrice != null) {
      const globalKrw = result.bybitXrpUsdPrice * result.usdKrwRate;
      if (globalKrw > 0) {
        result.kimchiPremium = ((result.xrpPrice - globalKrw) / globalKrw) * 100;
      }
    } else {
      if (result.kimchiError == null) {
        if (result.xrpPrice == null) {
          result.kimchiError = 'Upbit XRP 가격이 없어 김치 프리미엄을 계산할 수 없습니다.';
        } else if (result.usdKrwRate == null) {
          result.kimchiError = 'USD/KRW 환율이 없어 김치 프리미엄을 계산할 수 없습니다.';
        } else if (result.bybitXrpUsdPrice == null) {
          result.kimchiError = 'Bybit XRPUSD 가격이 없어 김치 프리미엄을 계산할 수 없습니다.';
        }
      }
    }

    return Response.json(result);
  } catch (err) {
    console.error('[short1x] 업비트 정보 조회 오류:', err.message);
    return Response.json(
      { error: err.message || '업비트 정보 조회 실패' },
      { status: 502 }
    );
  }
}
