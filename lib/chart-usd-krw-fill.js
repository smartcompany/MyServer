/**
 * 테더(USDT) 마지막 시각까지 환율(USD/KRW)에 누락된 시간을
 * 환율의 마지막 값으로 채워서 usd_krw_60d.json을 업데이트합니다.
 * 주기적으로 호출하기 위한 모듈 (instrumentation에서 사용).
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const USD_KRW_FILE = path.join(DATA_DIR, 'usd_krw_60d.json');
const USDT_FILE = path.join(DATA_DIR, 'upbit_usdt_60d.json');
const MAX_SERIES_ITEMS = 90 * 24;

function parseDt(s) {
  if (!s) return null;
  const normalized = String(s).replace(' ', 'T').trim();
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 시각을 USD/KRW series 형식 문자열로 (YYYY-MM-DDTHH:mm:00) */
function formatHourIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:00:00`;
}

/**
 * USDT 마지막 시각 기준으로 환율에 누락된 시간대를 마지막 환율 값으로 채웁니다.
 * @returns { Promise<{ filled: number } | null> } 채운 개수 또는 파일 없음 시 null
 */
async function runUsdKrwFillFromUsdtEnd() {
  let usdKrwContent;
  let usdtContent;
  try {
    usdKrwContent = await fs.readFile(USD_KRW_FILE, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    usdtContent = await fs.readFile(USDT_FILE, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }

  const usdKrw = JSON.parse(usdKrwContent);
  const usdt = JSON.parse(usdtContent);
  const usdSeries = usdKrw.series || [];
  const usdtSeries = usdt.series || [];

  if (usdSeries.length === 0 || usdtSeries.length === 0) return null;

  const lastUsd = usdSeries[usdSeries.length - 1];
  const lastUsdt = usdtSeries[usdtSeries.length - 1];
  const lastUsdDt = parseDt(lastUsd.datetime);
  const lastUsdtDt = parseDt(lastUsdt.datetime);
  if (!lastUsdDt || !lastUsdtDt) return null;
  if (lastUsdDt.getTime() >= lastUsdtDt.getTime()) return null;

  const lastValue = lastUsd.usd_krw;
  const existingSet = new Set(usdSeries.map((s) => s.datetime));

  let filled = 0;
  let cursor = new Date(lastUsdDt.getTime() + 60 * 60 * 1000); // 다음 시간부터
  const endMs = lastUsdtDt.getTime();

  while (cursor.getTime() <= endMs) {
    const dtStr = formatHourIso(cursor);
    if (!existingSet.has(dtStr)) {
      usdSeries.push({
        datetime: dtStr,
        usd_krw: lastValue,
      });
      existingSet.add(dtStr);
      filled++;
    }
    cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
  }

  if (filled === 0) return { filled: 0 };

  usdSeries.sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
  const trimmed =
    usdSeries.length > MAX_SERIES_ITEMS
      ? usdSeries.slice(-MAX_SERIES_ITEMS)
      : usdSeries;
  usdKrw.series = trimmed;
  if (trimmed.length) {
    usdKrw.start_date = trimmed[0].datetime.slice(0, 10);
    usdKrw.end_date = trimmed[trimmed.length - 1].datetime.slice(0, 10);
  }

  await fs.writeFile(USD_KRW_FILE, JSON.stringify(usdKrw, null, 2), 'utf-8');
  return { filled };
}

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10분
let intervalId = null;

/**
 * 주기적으로 환율 누락 채우기를 실행합니다.
 * @param { number } intervalMs 주기 (ms). 기본 10분
 */
function startPeriodicUsdKrwFill(intervalMs = DEFAULT_INTERVAL_MS) {
  if (intervalId != null) {
    clearInterval(intervalId);
  }

  function tick() {
    runUsdKrwFillFromUsdtEnd()
      .then((result) => {
        if (result && result.filled > 0) {
          console.log(`[chart-fill] 환율 누락 ${result.filled}개 시각 채움 → usd_krw_60d.json 갱신`);
        }
      })
      .catch((err) => {
        console.error('[chart-fill] 환율 채우기 실패:', err.message);
      });
  }

  tick(); // 즉시 1회
  intervalId = setInterval(tick, intervalMs);
  console.log(`[chart-fill] 주기적 환율 채우기 시작 (${intervalMs / 60000}분 간격)`);
}

function stopPeriodicUsdKrwFill() {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[chart-fill] 주기적 환율 채우기 중지');
  }
}

module.exports = {
  runUsdKrwFillFromUsdtEnd,
  startPeriodicUsdKrwFill,
  stopPeriodicUsdKrwFill,
};
