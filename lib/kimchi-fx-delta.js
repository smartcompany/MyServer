/**
 * USDT Signal /kimchi-fx-delta 과 동등: USD/KRW 구간별 delta_add_pp(퍼센트포인트).
 * 공식 요약: 가격 목표는 rate * (1 + (baseThreshold - delta_add_pp)/100).
 * 참조 — apps/lib/kimchi_fx_delta.dart 의 deltaForFx / contains
 */

const fs = require('fs');
const path = require('path');

let cached = { path: '', mtimeMs: 0, buckets: [] };

function sortBuckets(items) {
  return [...items].sort((a, b) => (Number(a.order) || 0) - Number(b.order) || 0);
}

/**
 * @param {string} projectRoot
 * @returns {Array<{ order: number, fx_min_inclusive: number, fx_max_exclusive?: number|null, fx_max_inclusive?: number|null, delta_add_pp: number }>}
 */
function loadKimchiFxDeltaBuckets(projectRoot) {
  const filePath = path.join(projectRoot, 'trade-server', 'kimchi-fx-delta.json');
  try {
    const stat = fs.statSync(filePath);
    if (
      cached.path === filePath &&
      stat.mtimeMs === cached.mtimeMs &&
      Array.isArray(cached.buckets) &&
      cached.buckets.length
    ) {
      return cached.buckets;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const j = JSON.parse(raw);
    const list = Array.isArray(j.buckets) ? sortBuckets(j.buckets) : [];
    cached = { path: filePath, mtimeMs: stat.mtimeMs, buckets: list };
    return list;
  } catch {
    return [];
  }
}

/** @returns {boolean} */
function bucketContains(fx, b) {
  const min = Number(b.fx_min_inclusive);
  const dex = b.fx_max_exclusive != null ? Number(b.fx_max_exclusive) : null;
  const din = b.fx_max_inclusive != null ? Number(b.fx_max_inclusive) : null;
  if (!Number.isFinite(min) || !Number.isFinite(fx)) return false;
  if (fx < min) return false;
  if (dex != null && Number.isFinite(dex)) return fx < dex;
  if (din != null && Number.isFinite(din)) return fx <= din;
  return false;
}

function bucketUpperInclusive(b) {
  const dex = b.fx_max_exclusive != null ? Number(b.fx_max_exclusive) : null;
  const din = b.fx_max_inclusive != null ? Number(b.fx_max_inclusive) : null;
  const min = Number(b.fx_min_inclusive);
  if (din != null && Number.isFinite(din)) return din;
  if (dex != null && Number.isFinite(dex)) return dex - 1e-9;
  return min;
}

/**
 * @param {number} fx USD/KRW
 * @param {object[]} buckets
 */
function deltaAddPpForFx(fx, buckets) {
  if (fx == null || !Number.isFinite(Number(fx)) || !buckets.length) return 0;
  const x = Number(fx);
  const sorted = sortBuckets(buckets);
  for (let i = 0; i < sorted.length; i++) {
    if (bucketContains(x, sorted[i])) {
      const d = Number(sorted[i].delta_add_pp);
      return Number.isFinite(d) ? d : 0;
    }
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first != null && x < Number(first.fx_min_inclusive)) {
    const d = Number(first.delta_add_pp);
    return Number.isFinite(d) ? d : 0;
  }
  const upper = bucketUpperInclusive(last);
  if (last != null && Number.isFinite(upper) && x > upper) {
    const d = Number(last.delta_add_pp);
    return Number.isFinite(d) ? d : 0;
  }
  return 0;
}

/**
 * baseBuy/baseSell 은 김프 임계(퍼센트). 활성 시 eff = raw - delta_pp.
 * @param {{ buyThreshold:number, sellThreshold:number, rate:number|null|undefined, kimchiFxDeltaEnabled:boolean, projectRoot?:string }}
 */
function effectiveKimchiPricingThresholds(opts) {
  const {
    buyThreshold,
    sellThreshold,
    rate,
    kimchiFxDeltaEnabled,
    projectRoot = process.cwd(),
  } = opts;
  const b0 = Number(buyThreshold);
  const s0 = Number(sellThreshold);
  if (!Number.isFinite(b0) || !Number.isFinite(s0)) {
    return {
      buyTh: buyThreshold,
      sellTh: sellThreshold,
      deltaPp: 0,
      applied: false,
    };
  }
  const rateOk = rate != null && Number.isFinite(Number(rate));
  if (!kimchiFxDeltaEnabled || !rateOk) {
    return { buyTh: b0, sellTh: s0, deltaPp: 0, applied: false };
  }
  const buckets = loadKimchiFxDeltaBuckets(projectRoot);
  const delta = deltaAddPpForFx(Number(rate), buckets);
  let buyTh = b0 - delta;
  let sellTh = s0 - delta;
  buyTh = Math.max(-50, Math.min(50, buyTh));
  sellTh = Math.max(-50, Math.min(80, sellTh));
  return { buyTh, sellTh, deltaPp: delta, applied: true };
}

module.exports = {
  loadKimchiFxDeltaBuckets,
  deltaAddPpForFx,
  effectiveKimchiPricingThresholds,
};
