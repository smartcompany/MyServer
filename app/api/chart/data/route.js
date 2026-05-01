import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const UPBIT_CANDLES_URL = 'https://api.upbit.com/v1/candles/minutes/60';
const MARKET = 'KRW-USDT';
const MAX_COUNT = 200;
/** USD/KRW·USDT 시간봉 공통 최대 보관 길이 (90일 × 24시간) — lib/chart-data-update.js 의 MAX_SERIES_ITEMS 와 동일 */
const CHART_RETENTION_HOURS = 90 * 24;

function parseDt(s) {
  if (!s) return null;
  const normalized = String(s).replace(' ', 'T').trim();
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 현재 시각(KST) 기준 이번 시간의 시작 시각 ISO 문자열 (예: 2026-02-04T14:00:00) */
function currentHourKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:00:00`;
}

/** JSON에서 마지막 시각이 현재 시각을 포함하는지 */
function isDataUpToDate(series, timeUnit = 'hour') {
  if (!Array.isArray(series) || series.length === 0) return false;
  const last = series[series.length - 1];
  const lastDt = last?.datetime ? parseDt(last.datetime) : null;
  if (!lastDt) return false;
  const currentHour = currentHourKst();
  const currentDt = parseDt(currentHour);
  if (!currentDt) return false;
  return lastDt.getTime() >= currentDt.getTime();
}

/** 업비트 60분봉 조회 (to 이전 캔들 최대 count개, 최신순) */
async function fetchUpbitCandles(toIso = null, count = MAX_COUNT) {
  let url = `${UPBIT_CANDLES_URL}?market=${MARKET}&count=${count}`;
  if (toIso) {
    url += '&to=' + toIso.replace(' ', 'T').replace('+09:00', '');
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'RasberryHomeServer/1.0' } });
  if (!res.ok) throw new Error(`Upbit API ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || 'Upbit API error');
  return Array.isArray(data) ? data : [];
}

/** USDT JSON에 누락된 최신 봉 추가 후 저장 */
async function ensureUsdtData() {
  const filePath = path.join(DATA_DIR, 'upbit_usdt_hour.json');
  let content;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const obj = JSON.parse(content);
  let series = obj.series || [];
  if (series.length > CHART_RETENTION_HOURS) {
    series = series.slice(-CHART_RETENTION_HOURS);
    obj.series = series;
    if (series.length) {
      obj.start_date = series[0].datetime.slice(0, 10);
      obj.end_date = series[series.length - 1].datetime.slice(0, 10);
    }
    await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf-8');
  }
  if (isDataUpToDate(series, obj.time_unit)) return obj;

  // to 생략 시 최신 200개 봉 반환. 그중 우리 마지막 시각보다 이후만 추가
  const candles = await fetchUpbitCandles(null, MAX_COUNT);
  const lastDtStr = series.length ? series[series.length - 1].datetime : '';
  const existingSet = new Set(series.map((s) => s.datetime));
  let added = 0;
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
    added++;
  }
  if (added > 0) {
    series.sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
    if (series.length > CHART_RETENTION_HOURS)
      obj.series = series.slice(-CHART_RETENTION_HOURS);
    else obj.series = series;
    if (obj.series.length) {
      obj.start_date = obj.series[0].datetime.slice(0, 10);
      obj.end_date = obj.series[obj.series.length - 1].datetime.slice(0, 10);
    }
    await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf-8');
  }
  return obj;
}

/** USD/KRW JSON 읽기. 90일(시간봉) 초과분은 잘라 저장 */
async function loadUsdKrwData() {
  const filePath = path.join(DATA_DIR, 'usd_krw_hour.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const obj = JSON.parse(content);
    const series = obj.series || [];
    if (series.length > CHART_RETENTION_HOURS) {
      obj.series = series.slice(-CHART_RETENTION_HOURS);
      if (obj.series.length) {
        obj.start_date = obj.series[0].datetime.slice(0, 10);
        obj.end_date = obj.series[obj.series.length - 1].datetime.slice(0, 10);
      }
      await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf-8');
    }
    return obj;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** GET: 차트용 환율 + USDT 데이터 반환. 필요 시 USDT JSON 갱신 */
export async function GET() {
  try {
    const [usdKrw, usdt] = await Promise.all([
      loadUsdKrwData(),
      ensureUsdtData(),
    ]);

    if (!usdKrw && !usdt) {
      return NextResponse.json(
        { error: 'data 폴더에 usd_krw_hour.json 또는 upbit_usdt_hour.json이 없습니다. 서버 주기 업데이트 후 생성됩니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      usdKrw: usdKrw || { series: [], start_date: '', end_date: '' },
      usdt: usdt || { series: [], start_date: '', end_date: '' },
    });
  } catch (err) {
    console.error('[chart/data]', err);
    return NextResponse.json(
      { error: err.message || '차트 데이터 조회 실패' },
      { status: 500 }
    );
  }
}
