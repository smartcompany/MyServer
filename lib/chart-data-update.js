/**
 * 환율(USD/KRW)과 USDT 시간 데이터를 주기적으로 업데이트합니다.
 * - 기록된 최종 시간을 현재 시간과 비교해 누락 시 API 호출로 보강
 * - API에 현재 시각이 없으면 마지막 값으로 채움
 * instrumentation에서 주기 실행용으로 사용.
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const USD_KRW_FILE = path.join(DATA_DIR, 'usd_krw_hour.json');
const USDT_FILE = path.join(DATA_DIR, 'upbit_usdt_hour.json');
const UPBIT_CANDLES_URL = 'https://api.upbit.com/v1/candles/minutes/60';
const MARKET = 'KRW-USDT';
const MAX_COUNT = 200;
/** 시간봉 최대 보관 개수 (USDT/USDKRW JSON 공통 상한. 90일 = 90×24시간) */
const MAX_SERIES_ITEMS = 90 * 24;
const USDKRW_SYMBOL = 'USDKRW=X'; // Yahoo Finance
const RATE_LIMIT_DELAY_MS = 150; // 업비트 요청 간격
const DEBUG = false; // 디버깅 로그 (필요 시 false로 끄기)

function debugLog(tag, ...args) {
  if (DEBUG) console.log(`[chart-debug] ${tag}`, ...args);
}

function parseDt(s) {
  if (!s) return null;
  const normalized = String(s).replace(' ', 'T').trim();
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 파일에 저장된 시각 문자열을 KST로 해석한 Date 반환 (서버 타임존과 무관) */
function parseDtAsKst(s) {
  if (!s) return null;
  const normalized = String(s).replace(' ', 'T').trim();
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(normalized)) return new Date(normalized);
  const d = new Date(normalized + '+09:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date(타임스탬프)를 KST 기준 YYYY-MM-DDTHH:00:00 문자열로 (환율 series용) */
function formatHourIsoKst(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:00:00`;
}

/** 현재 시각(KST) 기준 이번 시간의 시작 (Date) - 서버 타임존과 무관하게 KST 기준으로 계산 */
function currentHourKst() {
  const now = new Date();
  const kstVirtual = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kstVirtual.getUTCFullYear();
  const m = kstVirtual.getUTCMonth();
  const d = kstVirtual.getUTCDate();
  const h = kstVirtual.getUTCHours();
  const utcMs = Date.UTC(y, m, d, h - 9, 0, 0, 0);
  const date = new Date(utcMs);
  debugLog('currentHourKst', `KST ${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:00`, '→', date.toISOString());
  return date;
}

/** 시각을 USD/KRW series 형식 (YYYY-MM-DDTHH:mm:00) */
function formatHourIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:00:00`;
}

/** 시각을 USDT series 형식 (YYYY-MM-DD HH:mm:00) - date를 KST로 해석, 시 단위는 항상 :00 (업비트 1시간봉) */
function formatUsdtDatetimeKst(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:00:00`;
}

/** 업비트 60분봉 조회 */
async function fetchUpbitCandles(toIso = null, count = MAX_COUNT) {
  let url = `${UPBIT_CANDLES_URL}?market=${MARKET}&count=${count}`;
  if (toIso) url += '&to=' + toIso.replace(' ', 'T').replace('+09:00', '');
  const res = await fetch(url, { headers: { 'User-Agent': 'RasberryHomeServer/1.0' } });
  if (!res.ok) throw new Error(`Upbit API ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || 'Upbit API error');
  return Array.isArray(data) ? data : [];
}

/**
 * 환율(USD/KRW): "시작 시각 ~ 현재" 구간을 한 로직으로 채움
 * - 데이터 없음(파일 없음/비어 있음) → 90일 전부터 현재까지 조회 후 생성
 * - 데이터 있으나 구간 누락(예: 30일치 삭제) → 마지막 시각부터 현재까지 조회 후 보강, API에 없으면 마지막 값으로 채움
 */
async function updateUsdKrwData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let usdKrw;
  let usdSeries = [];
  try {
    const usdContent = await fs.readFile(USD_KRW_FILE, 'utf-8');
    usdKrw = JSON.parse(usdContent);
    usdSeries = usdKrw.series || [];
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    usdKrw = {
      base: 'USD',
      target: 'KRW',
      start_date: '',
      end_date: '',
      time_unit: 'hour',
      source: 'yfinance',
      note: 'Yahoo 1h는 과거 길이에 제한이 있을 수 있음. 저장 상한은 90일(시간봉)까지.',
      series: [],
    };
  }

  const currentHour = currentHourKst();
  const targetEndMs = currentHour.getTime();
  // 데이터 없으면 MAX_SERIES_ITEMS만큼의 기간만큼 이전부터, 있으면 마지막 시각(KST 기준)부터
  const startMs = usdSeries.length
    ? parseDtAsKst(usdSeries[usdSeries.length - 1].datetime)?.getTime()
    : targetEndMs - MAX_SERIES_ITEMS * 60 * 60 * 1000;
  debugLog('환율', 'series개수', usdSeries.length, 'startMs', startMs ? new Date(startMs).toISOString() : null, 'targetEndMs', new Date(targetEndMs).toISOString());
  if (startMs >= targetEndMs && usdSeries.length > 0) {
    debugLog('환율', '이미 최신 → 스킵');
    return;
  }

  let YahooFinance;
  try {
    YahooFinance = require('yahoo-finance2').default;
  } catch (e) {
    console.error('[chart-update] yahoo-finance2 로드 실패:', e.message);
    return;
  }
  const period1 = new Date(startMs);
  const period2 = new Date(targetEndMs);
  debugLog('환율', 'Yahoo 요청 구간', period1.toISOString(), '~', period2.toISOString());
  let result;
  try {
    const yf = new YahooFinance();
    result = await yf.chart(USDKRW_SYMBOL, {
      period1,
      period2,
      interval: '1h',
      return: 'array',
    });
  } catch (e) {
    console.error('[chart-update] Yahoo Finance 환율 조회 실패:', e.message);
    return;
  }
  const quotes = result?.quotes || [];
  const existingSet = new Set(usdSeries.map((s) => s.datetime));
  let apiAdded = 0;
  for (const q of quotes) {
    const date = q.date instanceof Date ? q.date : new Date(q.date);
    if (date.getTime() <= startMs) continue;
    const close = q.close;
    if (close == null || Number.isNaN(Number(close))) continue;
    const dtStr = formatHourIsoKst(date);
    if (existingSet.has(dtStr)) continue;
    existingSet.add(dtStr);
    usdSeries.push({
      datetime: dtStr,
      usd_krw: Math.round(Number(close) * 100) / 100,
    });
    apiAdded++;
  }
  debugLog('환율', 'Yahoo quotes 반영', apiAdded, '개');
  if (apiAdded > 0) usdSeries.sort((a, b) => (a.datetime < b.datetime ? -1 : 1));

  const newLast = usdSeries[usdSeries.length - 1];
  const newLastMs = newLast ? parseDtAsKst(newLast.datetime)?.getTime() : 0;
  let filled = 0;
  if (newLast && newLastMs < targetEndMs) {
    debugLog('환율', 'API 후 마지막값 채움 구간', new Date(newLastMs).toISOString(), '~', new Date(targetEndMs).toISOString());
    const lastValue = newLast.usd_krw;
    let cursor = new Date(newLastMs + 60 * 60 * 1000);
    while (cursor.getTime() <= targetEndMs) {
      const dtStr = formatHourIsoKst(cursor);
      if (!existingSet.has(dtStr)) {
        usdSeries.push({ datetime: dtStr, usd_krw: lastValue });
        existingSet.add(dtStr);
        filled++;
      }
      cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
    }
    usdSeries.sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
  }

  if (usdSeries.length > MAX_SERIES_ITEMS) usdSeries = usdSeries.slice(-MAX_SERIES_ITEMS);

  if (usdSeries.length === 0) return;
  usdKrw.series = usdSeries;
  usdKrw.start_date = usdSeries[0].datetime.slice(0, 10);
  usdKrw.end_date = usdSeries[usdSeries.length - 1].datetime.slice(0, 10);
  await fs.writeFile(USD_KRW_FILE, JSON.stringify(usdKrw, null, 2), 'utf-8');
  if (apiAdded > 0 || filled > 0) {
    const parts = [];
    if (apiAdded > 0) parts.push(`Yahoo API ${apiAdded}개`);
    if (filled > 0) parts.push(`마지막값 채움 ${filled}개`);
    console.log(`[chart-update] 환율 ${parts.join(', ')} → usd_krw_hour.json 갱신`);
    void require('./chart-supabase-sync').uploadChartDataFile(
      USD_KRW_FILE,
      'usd_krw_hour.json',
    );
  }
}

/**
 * USDT: "시작 시각 ~ 현재" 구간을 한 로직으로 채움
 * - 데이터 없음 → 최대 보관 시간봉(90일 분량) 수집 후 생성
 * - 데이터 있으나 구간 누락 → 마지막 시각부터 현재까지 반복 요청으로 보강, 현재 시각 없으면 마지막 값으로 채움
 */
async function updateUsdtData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let obj;
  let series = [];
  try {
    const content = await fs.readFile(USDT_FILE, 'utf-8');
    obj = JSON.parse(content);
    series = obj.series || [];
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    obj = {
      market: MARKET,
      start_date: '',
      end_date: '',
      time_unit: 'hour',
      source: 'Upbit',
      note: '업비트 KRW-USDT 1시간봉. 체결 없으면 해당 시각 봉은 없을 수 있음.',
      series: [],
    };
  }

  const currentHour = currentHourKst();
  const targetEndMs = currentHour.getTime();
  const lastDtStr = series.length ? series[series.length - 1].datetime : null;
  const lastDtMs = lastDtStr ? parseDt(lastDtStr)?.getTime() : 0;
  const currentHourStr = formatUsdtDatetimeKst(currentHour);
  debugLog('USDT', 'series개수', series.length, 'lastDtStr', lastDtStr, 'currentHourStr(KST시)', currentHourStr, 'targetEndMs', new Date(targetEndMs).toISOString());
  if (lastDtStr && lastDtMs >= targetEndMs) {
    debugLog('USDT', '이미 최신 → 스킵');
    return;
  }

  const existingSet = new Set(series.map((s) => s.datetime));
  let toIso = null;
  let added = 0;
  const maxIterations = 50;
  const needFull60Days = !lastDtStr;
  debugLog('USDT', 'needFull60Days', needFull60Days, 'API 반복 요청 시작');
  for (let i = 0; i < maxIterations; i++) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    const candles = await fetchUpbitCandles(toIso, MAX_COUNT);
    let batchAdded = 0;
    for (const c of candles) {
      const dt = (c.candle_date_time_kst || c.candle_date_time_utc || '').replace('T', ' ').slice(0, 19);
      if (!dt || existingSet.has(dt)) continue;
      if (lastDtStr && dt <= lastDtStr) continue;
      existingSet.add(dt);
      series.push({
        datetime: dt,
        timestamp_ms: c.timestamp,
        open: c.opening_price,
        high: c.high_price,
        low: c.low_price,
        close: Math.round(Number(c.trade_price || 0) * 100) / 100,
        volume: c.candle_acc_trade_volume,
      });
      batchAdded++;
      added++;
    }
    if (batchAdded === 0 || candles.length < MAX_COUNT) break;
    const oldestInBatch = candles[candles.length - 1];
    const oldestDt = (oldestInBatch.candle_date_time_kst || oldestInBatch.candle_date_time_utc || '').replace('T', ' ').slice(0, 19);
    if (needFull60Days) {
      if (series.length >= MAX_SERIES_ITEMS) break;
    } else if (oldestDt <= lastDtStr) {
      break;
    }
    toIso = oldestInBatch.candle_date_time_kst || oldestInBatch.candle_date_time_utc;
    if (!toIso) break;
  }

  const newLast = series[series.length - 1];
  const newLastDt = newLast ? parseDt(newLast.datetime) : null;
  const willAddFiller = newLast && newLastDt.getTime() < targetEndMs && !existingSet.has(currentHourStr);
  debugLog('USDT', '현재시 봉 채움 여부', willAddFiller, '(newLast < targetEndMs:', newLastDt ? newLastDt.getTime() < targetEndMs : false, ', 이미있음:', existingSet.has(currentHourStr), ', currentHourStr:', currentHourStr, ')');
  if (willAddFiller) {
    series.push({
      datetime: currentHourStr,
      timestamp_ms: currentHour.getTime(),
      open: newLast.close,
      high: newLast.close,
      low: newLast.close,
      close: newLast.close,
      volume: 0,
    });
    added++;
  }

  if (series.length === 0) return;
  series.sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
  if (series.length > MAX_SERIES_ITEMS) series = series.slice(-MAX_SERIES_ITEMS);
  obj.series = series;
  obj.start_date = series[0].datetime.slice(0, 10);
  obj.end_date = series[series.length - 1].datetime.slice(0, 10);
  await fs.writeFile(USDT_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  if (added > 0) {
    console.log(`[chart-update] USDT ${added}개 봉 보강/채움 → upbit_usdt_hour.json 갱신`);
    void require('./chart-supabase-sync').uploadChartDataFile(
      USDT_FILE,
      'upbit_usdt_hour.json',
    );
  }
}

/**
 * 환율·USDT 시간 데이터 한 번에 업데이트
 * - 기록 최종 시각 vs 현재 시각 비교 → 누락 시 API 보강(USDT: Upbit, 환율: Yahoo) → API에 없는 구간은 마지막 값으로 채움
 */
async function runChartDataUpdate() {
  try {
    await updateUsdtData();
    await updateUsdKrwData(); // Yahoo API 보강 + 남는 구간 마지막 값 채움 → 한 번에 저장
  } catch (err) {
    console.error('[chart-update] 실패:', err.message);
  }
}

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
let intervalId = null;

/**
 * 주기적으로 환율·USDT 데이터 업데이트 실행
 * @param { number } intervalMs 주기(ms). 기본 10분
 */
function startPeriodicChartDataUpdate(intervalMs = DEFAULT_INTERVAL_MS) {
  if (intervalId != null) clearInterval(intervalId);
  function tick() {
    runChartDataUpdate();
  }
  tick();
  intervalId = setInterval(tick, intervalMs);
  const intervalLabel = intervalMs >= 60000
    ? `${intervalMs / 60000}분 간격`
    : `${intervalMs / 1000}초 간격`;
  console.log(`[chart-update] 주기적 환율·USDT 데이터 업데이트 시작 (${intervalLabel})`);
}

function stopPeriodicChartDataUpdate() {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[chart-update] 주기적 업데이트 중지');
  }
}

module.exports = {
  runChartDataUpdate,
  startPeriodicChartDataUpdate,
  stopPeriodicChartDataUpdate,
};
