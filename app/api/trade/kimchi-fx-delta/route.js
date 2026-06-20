import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import fs from 'fs';
import path from 'path';

const METHOD_QUINTILES = 'equal_count_quintiles';
const METHOD_AFFINE = 'affine_fx_ratio';

function loadKimchiFxDeltaLib() {
  try {
    const nativeRequire = eval('require');
    return nativeRequire(path.join(process.cwd(), 'lib', 'kimchi-fx-delta.js'));
  } catch (e) {
    console.warn('[kimchi-fx-delta API] lib 로드 실패:', e.message);
    return null;
  }
}

function parseNum(v, fallback = null) {
  if (v == null || v === '') return fallback;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function payloadToTuningForm(json) {
  const method =
    json?.method === METHOD_AFFINE || json?.method === METHOD_QUINTILES
      ? json.method
      : METHOD_QUINTILES;
  const dm = json?.delta_model && typeof json.delta_model === 'object' ? json.delta_model : {};
  const buckets = Array.isArray(json?.buckets) ? json.buckets : [];
  const onset = parseNum(dm.high_fx_onset_inclusive);
  return {
    method,
    affineFxReference: parseNum(dm.fx_reference, 1450),
    affineBiasPp: parseNum(dm.bias_pp, 0),
    affineKPpPerFxPercent: parseNum(dm.k_pp_per_fx_percent, 0),
    affineHighFxOnsetInclusive: onset != null && onset > 0 ? onset : '',
    affineKHiPpPerFxPercentSquared: parseNum(dm.k_hi_pp_per_fx_percent_squared, 0),
    affineClampMin: dm.clamp_min != null ? parseNum(dm.clamp_min) : '',
    affineClampMax: dm.clamp_max != null ? parseNum(dm.clamp_max) : '',
    bucketDeltas: buckets.map((b) => parseNum(b.delta_add_pp, 0)),
    bucketsMeta: buckets.map((b) => ({
      order: b.order,
      fx_min_inclusive: b.fx_min_inclusive,
      fx_max_exclusive: b.fx_max_exclusive,
      fx_max_inclusive: b.fx_max_inclusive,
    })),
  };
}

function applyTuningToJson(existing, body) {
  const method = body.method;
  if (method !== METHOD_QUINTILES && method !== METHOD_AFFINE) {
    throw new Error('method는 equal_count_quintiles 또는 affine_fx_ratio 여야 합니다');
  }

  const out = { ...existing, method };

  if (Array.isArray(out.buckets) && Array.isArray(body.bucket_deltas)) {
    out.buckets = out.buckets.map((b, i) => {
      const d = parseNum(body.bucket_deltas[i], b.delta_add_pp);
      if (d == null) throw new Error(`bucket_deltas[${i}]가 올바른 숫자가 아닙니다`);
      return { ...b, delta_add_pp: d };
    });
  }

  const aff = body.affine;
  if (aff && typeof aff === 'object') {
    const fxRef = parseNum(aff.fx_reference);
    const k = parseNum(aff.k_pp_per_fx_percent);
    if (fxRef == null || fxRef <= 0) {
      throw new Error('fx_reference는 0보다 커야 합니다');
    }
    if (k == null) {
      throw new Error('k_pp_per_fx_percent가 필요합니다');
    }
    const bias = parseNum(aff.bias_pp);
    if (bias == null) {
      throw new Error('bias_pp가 필요합니다');
    }
    const deltaModel = {
      ...(out.delta_model && typeof out.delta_model === 'object' ? out.delta_model : {}),
      type: 'affine_ratio',
      fx_reference: fxRef,
      bias_pp: bias,
      k_pp_per_fx_percent: k,
    };
    const onset = parseNum(aff.high_fx_onset_inclusive);
    const kHi = parseNum(aff.k_hi_pp_per_fx_percent_squared, 0);
    if (onset != null && onset > 0) {
      deltaModel.high_fx_onset_inclusive = onset;
    } else {
      delete deltaModel.high_fx_onset_inclusive;
    }
    if (kHi != null && kHi !== 0) {
      deltaModel.k_hi_pp_per_fx_percent_squared = kHi;
    } else {
      delete deltaModel.k_hi_pp_per_fx_percent_squared;
    }
    const cmin = parseNum(aff.clamp_min);
    const cmax = parseNum(aff.clamp_max);
    if (cmin != null) deltaModel.clamp_min = cmin;
    else delete deltaModel.clamp_min;
    if (cmax != null) deltaModel.clamp_max = cmax;
    else delete deltaModel.clamp_max;
    out.delta_model = deltaModel;
  }

  return out;
}

/** USDT Signal과 동일한 구간 테이블 (trade-server/kimchi-fx-delta.json) */
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const filePath = getTradeServerPath('kimchi-fx-delta.json');
  try {
    if (!fs.existsSync(filePath)) {
      return Response.json({ error: 'kimchi-fx-delta.json 없음' }, { status: 404 });
    }
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Response.json({
      ...json,
      tuningForm: payloadToTuningForm(json),
    });
  } catch (e) {
    console.error('[kimchi-fx-delta API]', e);
    return Response.json({ error: e.message || '읽기 실패' }, { status: 500 });
  }
}

/** 세부 설정 적용 → kimchi-fx-delta.json 저장 (+ 선택 시 config.kimchiFxDeltaMethod 동기화) */
export async function POST(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const filePath = getTradeServerPath('kimchi-fx-delta.json');
  const configPath = getTradeServerPath('config.json');

  try {
    if (!fs.existsSync(filePath)) {
      return Response.json({ error: 'kimchi-fx-delta.json 없음' }, { status: 404 });
    }

    const body = await request.json();
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const merged = applyTuningToJson(existing, body);

    fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`);

    const klib = loadKimchiFxDeltaLib();
    if (klib?.invalidateKimchiFxDeltaCache) {
      klib.invalidateKimchiFxDeltaCache();
    }

    if (body.syncConfigMethod !== false && fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.kimchiFxDeltaMethod = merged.method;
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    }

    return Response.json({
      ok: true,
      method: merged.method,
      tuningForm: payloadToTuningForm(merged),
    });
  } catch (e) {
    console.error('[kimchi-fx-delta API] POST', e);
    return Response.json({ error: e.message || '저장 실패' }, { status: 400 });
  }
}
