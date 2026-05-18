/**
 * USDT Signal /kimchi-fx-delta 과 동등: USD/KRW 구간별 delta_add_pp(퍼센트포인트).
 * 공식 요약: 가격 목표는 rate * (1 + (baseThreshold - delta_add_pp)/100).
 * 참조 — apps/lib/kimchi_fx_delta.dart 의 deltaForFx / contains
 */

const fs = require('fs');
const path = require('path');

// buckets / delta_model 을 포함한 페이로드 캐시
let cachedPayload = { path: '', mtimeMs: 0, payload: null };
let cachedBucketsOnly = { path: '', mtimeMs: 0, buckets: [] };

function sortBuckets(items) {
  return [...items].sort((a, b) => (Number(a.order) || 0) - Number(b.order) || 0);
}

function coerceNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
      cachedBucketsOnly.path === filePath &&
      stat.mtimeMs === cachedBucketsOnly.mtimeMs &&
      Array.isArray(cachedBucketsOnly.buckets) &&
      cachedBucketsOnly.buckets.length
    ) {
      return cachedBucketsOnly.buckets;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const j = JSON.parse(raw);
    const list = Array.isArray(j.buckets) ? sortBuckets(j.buckets) : [];
    cachedBucketsOnly = { path: filePath, mtimeMs: stat.mtimeMs, buckets: list };
    return list;
  } catch {
    return [];
  }
}

/**
 * @param {string} projectRoot
 * @returns {{ method: string, buckets: Array<{ order: number, fx_min_inclusive: number, fx_max_exclusive?: number|null, fx_max_inclusive?: number|null, delta_add_pp: number }>, deltaModel: any|null }}
 */
function loadKimchiFxDeltaPayload(projectRoot) {
  const filePath = path.join(projectRoot, 'trade-server', 'kimchi-fx-delta.json');
  try {
    const stat = fs.statSync(filePath);
    if (
      cachedPayload.path === filePath &&
      stat.mtimeMs === cachedPayload.mtimeMs &&
      cachedPayload.payload
    ) {
      return cachedPayload.payload;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const j = JSON.parse(raw);

    const method = typeof j.method === 'string' ? j.method : 'equal_count_quintiles';
    const buckets = Array.isArray(j.buckets) ? sortBuckets(j.buckets) : [];
    const deltaModel = j.delta_model ?? null;

    cachedPayload = { path: filePath, mtimeMs: stat.mtimeMs, payload: { method, buckets, deltaModel } };
    return cachedPayload.payload;
  } catch {
    return { method: 'equal_count_quintiles', buckets: [], deltaModel: null };
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
 * @param {number} fx USD/KRW
 * @param {{ type?:string, fx_reference?:number, bias_pp?:number, k_pp_per_fx_percent?:number, clamp_min?:number|null, clamp_max?:number|null } | null} deltaModel
 */
function deltaAddPpForFxAffineRatio(fx, deltaModel) {
  if (fx == null || !Number.isFinite(Number(fx))) return null;
  if (deltaModel == null || typeof deltaModel !== 'object') return null;

  const fxReference = coerceNumber(deltaModel.fx_reference);
  if (fxReference == null || fxReference <= 0) {
    // USDTSignal: fx_reference 가 유효하지 않으면 bias 그대로 반환
    const bias = coerceNumber(deltaModel.bias_pp);
    return bias == null ? 0 : bias;
  }

  const biasPp = coerceNumber(deltaModel.bias_pp) ?? 0;
  const k = coerceNumber(deltaModel.k_pp_per_fx_percent);
  if (k == null) return null;

  const fxPct = (Number(fx) / fxReference - 1.0) * 100.0;
  let d = biasPp + k * fxPct;

  const cmin = deltaModel.clamp_min != null ? coerceNumber(deltaModel.clamp_min) : null;
  const cmax = deltaModel.clamp_max != null ? coerceNumber(deltaModel.clamp_max) : null;
  if (cmin != null) d = Math.max(d, cmin);
  if (cmax != null) d = Math.min(d, cmax);
  return d;
}

/**
 * @param {number} fx USD/KRW
 * @param {{ projectRoot?: string, kimchiFxDeltaMethod?: string }} opts
 * @returns {number} delta_add_pp(퍼센트포인트)
 */
function deltaAddPpForFxWithMethod(fx, opts = {}) {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const payload = loadKimchiFxDeltaPayload(projectRoot);
  const method = opts.kimchiFxDeltaMethod || payload.method || 'equal_count_quintiles';

  if (method === 'affine_fx_ratio') {
    const d = deltaAddPpForFxAffineRatio(Number(fx), payload.deltaModel);
    // deltaModel이 없거나 계산이 실패하면 buckets로 폴백
    if (d != null && Number.isFinite(Number(d))) return d;
  }
  return deltaAddPpForFx(Number(fx), payload.buckets);
}

/**
 * baseBuy/baseSell 은 김프 임계(퍼센트). 활성 시 eff = raw - delta_pp.
 * @param {{ buyThreshold:number, sellThreshold:number, rate:number|null|undefined, kimchiFxDeltaEnabled:boolean, kimchiFxDeltaMethod?:string, projectRoot?:string }}
 */
function effectiveKimchiPricingThresholds(opts) {
  const {
    buyThreshold,
    sellThreshold,
    rate,
    kimchiFxDeltaEnabled,
    kimchiFxDeltaMethod,
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

  const delta = deltaAddPpForFxWithMethod(Number(rate), {
    projectRoot,
    kimchiFxDeltaMethod,
  });
  let buyTh = b0 - delta;
  let sellTh = s0 - delta;
  buyTh = Math.max(-50, Math.min(50, buyTh));
  sellTh = Math.max(-50, Math.min(80, sellTh));
  return { buyTh, sellTh, deltaPp: delta, applied: true };
}

/** 파일 저장 후 mtime 캐시 무효화 (웹에서 JSON 갱신 시) */
function invalidateKimchiFxDeltaCache() {
  cachedPayload = { path: '', mtimeMs: 0, payload: null };
  cachedBucketsOnly = { path: '', mtimeMs: 0, buckets: [] };
}

module.exports = {
  loadKimchiFxDeltaBuckets,
  loadKimchiFxDeltaPayload,
  invalidateKimchiFxDeltaCache,
  deltaAddPpForFx,
  deltaAddPpForFxAffineRatio,
  deltaAddPpForFxWithMethod,
  effectiveKimchiPricingThresholds,
};
