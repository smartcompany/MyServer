/**
 * 환율 N일 SMA 추세 필터 (USDT Signal 앱과 동일 개념).
 * - 기본 OFF (kimchiFxTrendFilterEnabled === true 일 때만 적용)
 * - 시간봉(usd_krw_hour.json) 기준: lookbackDays × 24봉
 * - 현재 < SMA → 매수 차단 / 보유 시 손절(매도 유도)
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_LOOKBACK_DAYS = 50;
const MIN_LOOKBACK_DAYS = 2;
const MAX_LOOKBACK_DAYS = 365;

/** @type {{ at: number, values: number[] } | null} */
let _fxCache = null;
const FX_CACHE_TTL_MS = 60_000;

function clampLookbackDays(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LOOKBACK_DAYS;
  return Math.max(MIN_LOOKBACK_DAYS, Math.min(MAX_LOOKBACK_DAYS, Math.floor(n)));
}

function fxMaBarsForDays(days) {
  return clampLookbackDays(days) * 24;
}

/**
 * @param {string} projectRoot
 * @returns {number[]} 시간 오름차순 USD/KRW 값
 */
function loadHourlyFxValuesAscending(projectRoot) {
  const now = Date.now();
  if (_fxCache && now - _fxCache.at < FX_CACHE_TTL_MS) {
    return _fxCache.values.slice();
  }
  const filePath = path.join(projectRoot, 'data', 'usd_krw_hour.json');
  try {
    if (!fs.existsSync(filePath)) {
      _fxCache = { at: now, values: [] };
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const series = Array.isArray(raw?.series) ? raw.series : [];
    const values = [];
    for (const row of series) {
      const v = Number(row?.usd_krw);
      if (Number.isFinite(v) && v > 0) values.push(v);
    }
    _fxCache = { at: now, values };
    return values.slice();
  } catch (e) {
    console.error('[kimchi-fx-trend] usd_krw_hour.json 읽기 실패:', e.message);
    _fxCache = { at: now, values: [] };
    return [];
  }
}

/**
 * @param {number[]} fxValuesAscending
 * @param {number} lookbackBars
 * @returns {boolean} 이평 미산출(초기)이면 false
 */
function fxBelowSma(fxValuesAscending, lookbackBars) {
  if (lookbackBars < 1 || fxValuesAscending.length < lookbackBars) return false;
  let sum = 0;
  for (
    let i = fxValuesAscending.length - lookbackBars;
    i < fxValuesAscending.length;
    i++
  ) {
    sum += fxValuesAscending[i];
  }
  const sma = sum / lookbackBars;
  const current = fxValuesAscending[fxValuesAscending.length - 1];
  return current > 0 && current < sma;
}

function smaAtEnd(fxValuesAscending, lookbackBars) {
  if (lookbackBars < 1 || fxValuesAscending.length < lookbackBars) return null;
  let sum = 0;
  for (
    let i = fxValuesAscending.length - lookbackBars;
    i < fxValuesAscending.length;
    i++
  ) {
    sum += fxValuesAscending[i];
  }
  return sum / lookbackBars;
}

/**
 * @param {{ kimchiFxTrendFilterEnabled?: boolean, kimchiFxTrendLookback?: number } | null | undefined} cfg
 * @param {number | null | undefined} liveRate
 * @param {string} projectRoot
 */
function evaluateFxTrend(cfg, liveRate, projectRoot) {
  const enabled = cfg?.kimchiFxTrendFilterEnabled === true;
  const lookbackDays = clampLookbackDays(
    cfg?.kimchiFxTrendLookback ?? DEFAULT_LOOKBACK_DAYS,
  );
  const lookbackBars = fxMaBarsForDays(lookbackDays);
  if (!enabled) {
    return {
      enabled: false,
      below: false,
      sma: null,
      lookbackDays,
      lookbackBars,
      current: Number.isFinite(Number(liveRate)) ? Number(liveRate) : null,
    };
  }

  const values = loadHourlyFxValuesAscending(projectRoot);
  const live = Number(liveRate);
  if (Number.isFinite(live) && live > 0) {
    if (values.length === 0) values.push(live);
    else values[values.length - 1] = live;
  }

  const sma = smaAtEnd(values, lookbackBars);
  const below = fxBelowSma(values, lookbackBars);
  return {
    enabled: true,
    below,
    sma: sma != null ? Math.round(sma * 100) / 100 : null,
    lookbackDays,
    lookbackBars,
    current: Number.isFinite(live) && live > 0 ? live : values[values.length - 1] ?? null,
  };
}

module.exports = {
  DEFAULT_LOOKBACK_DAYS,
  MIN_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
  clampLookbackDays,
  fxMaBarsForDays,
  loadHourlyFxValuesAscending,
  fxBelowSma,
  evaluateFxTrend,
};
