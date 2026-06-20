'use client';

import { useEffect, useState } from 'react';

const METHOD_QUINTILES = 'equal_count_quintiles';
const METHOD_AFFINE = 'affine_fx_ratio';

function fmtFxRange(b) {
  const lo = Number(b.fx_min_inclusive);
  if (b.fx_max_exclusive != null) {
    return `[${lo}, ${Number(b.fx_max_exclusive)})`;
  }
  if (b.fx_max_inclusive != null) {
    return `[${lo}, ${Number(b.fx_max_inclusive)}]`;
  }
  return String(lo);
}

function tuningFormFromPayload(json) {
  const method =
    json?.method === METHOD_AFFINE || json?.method === METHOD_QUINTILES
      ? json.method
      : METHOD_QUINTILES;
  const dm = json?.delta_model && typeof json.delta_model === 'object' ? json.delta_model : {};
  const buckets = Array.isArray(json?.buckets) ? json.buckets : [];
  return {
    method,
    affineFxReference: dm.fx_reference != null ? String(dm.fx_reference) : '1450',
    affineBiasPp: dm.bias_pp != null ? String(dm.bias_pp) : '0',
    affineKPpPerFxPercent:
      dm.k_pp_per_fx_percent != null ? String(dm.k_pp_per_fx_percent) : '0',
    affineHighFxOnsetInclusive:
      dm.high_fx_onset_inclusive != null ? String(dm.high_fx_onset_inclusive) : '',
    affineKHiPpPerFxPercentSquared:
      dm.k_hi_pp_per_fx_percent_squared != null
        ? String(dm.k_hi_pp_per_fx_percent_squared)
        : '0',
    affineClampMin: dm.clamp_min != null ? String(dm.clamp_min) : '',
    affineClampMax: dm.clamp_max != null ? String(dm.clamp_max) : '',
    bucketDeltas: buckets.map((b) => String(b.delta_add_pp ?? 0)),
    bucketsMeta: buckets.map((b) => ({
      order: b.order,
      fx_min_inclusive: b.fx_min_inclusive,
      fx_max_exclusive: b.fx_max_exclusive,
      fx_max_inclusive: b.fx_max_inclusive,
    })),
  };
}

function parseD(s, fallback) {
  const t = String(s ?? '').trim().replace(/,/g, '');
  if (!t) return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
}

function parseOpt(s) {
  const t = String(s ?? '').trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function KimchiFxDeltaTuningModal({ open, onClose, onApplied }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [serverDefaults, setServerDefaults] = useState(null);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      try {
        const res = await fetch('/api/trade/kimchi-fx-delta', {
          headers: { Authorization: 'Bearer ' + token },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'kimchi-fx-delta.json 로드 실패');
        }
        if (cancelled) return;
        const snap = tuningFormFromPayload(data);
        setServerDefaults(snap);
        setForm({ ...snap, bucketDeltas: [...snap.bucketDeltas] });
      } catch (e) {
        if (!cancelled) setError(e.message || '로드 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const resetToServerDefaults = () => {
    if (!serverDefaults) return;
    setForm({
      ...serverDefaults,
      bucketDeltas: [...serverDefaults.bucketDeltas],
    });
  };

  const handleApply = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    const token = localStorage.getItem('token');
    try {
      const body = {
        method: form.method,
        syncConfigMethod: true,
        bucket_deltas: form.bucketDeltas.map((s, i) =>
          parseD(s, parseD(serverDefaults?.bucketDeltas?.[i], 0)),
        ),
        affine: {
          fx_reference: parseD(form.affineFxReference, 1450),
          bias_pp: parseD(form.affineBiasPp, 0),
          k_pp_per_fx_percent: parseD(form.affineKPpPerFxPercent, 0),
          high_fx_onset_inclusive: parseOpt(form.affineHighFxOnsetInclusive),
          k_hi_pp_per_fx_percent_squared: parseD(form.affineKHiPpPerFxPercentSquared, 0),
          clamp_min: parseOpt(form.affineClampMin),
          clamp_max: parseOpt(form.affineClampMax),
        },
      };

      const res = await fetch('/api/trade/kimchi-fx-delta', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '저장 실패');
      }

      const snap = data.tuningForm
        ? {
            method: data.tuningForm.method,
            affineFxReference: String(data.tuningForm.affineFxReference ?? ''),
            affineBiasPp: String(data.tuningForm.affineBiasPp ?? ''),
            affineKPpPerFxPercent: String(data.tuningForm.affineKPpPerFxPercent ?? ''),
            affineHighFxOnsetInclusive:
              data.tuningForm.affineHighFxOnsetInclusive != null &&
              data.tuningForm.affineHighFxOnsetInclusive !== ''
                ? String(data.tuningForm.affineHighFxOnsetInclusive)
                : '',
            affineKHiPpPerFxPercentSquared: String(
              data.tuningForm.affineKHiPpPerFxPercentSquared ?? '0',
            ),
            affineClampMin:
              data.tuningForm.affineClampMin != null
                ? String(data.tuningForm.affineClampMin)
                : '',
            affineClampMax:
              data.tuningForm.affineClampMax != null
                ? String(data.tuningForm.affineClampMax)
                : '',
            bucketDeltas: (data.tuningForm.bucketDeltas || []).map(String),
            bucketsMeta: data.tuningForm.bucketsMeta || [],
          }
        : tuningFormFromPayload(data);

      setServerDefaults(snap);
      setForm({ ...snap, bucketDeltas: [...snap.bucketDeltas] });
      onApplied?.(data.method);
      onClose?.();
    } catch (e) {
      setError(e.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  };

  const panelStyle = {
    background: '#fff',
    borderRadius: '8px',
    maxWidth: '520px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    padding: '20px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  };

  const fieldStyle = {
    width: '100%',
    padding: '8px',
    boxSizing: 'border-box',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>김프 델타 보정 세부 설정</h3>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#666', lineHeight: 1.5 }}>
          적용 시 <code>trade-server/kimchi-fx-delta.json</code>이 저장되고, 거래 엔진이 다음
          루프부터 새 Δ를 사용합니다.
        </p>

        {loading && <p style={{ fontSize: '14px' }}>불러오는 중…</p>}
        {error && (
          <p style={{ color: '#c62828', fontSize: '13px', marginBottom: '10px' }}>{error}</p>
        )}

        {form && !loading && (
          <>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
              계산 방식
            </label>
            <select
              value={form.method}
              onChange={(e) => setForm((prev) => ({ ...prev, method: e.target.value }))}
              style={{ ...fieldStyle, marginBottom: '14px' }}
            >
              <option value={METHOD_QUINTILES}>구간표 (equal_count_quintiles)</option>
              <option value={METHOD_AFFINE}>환율 비율식 (affine_fx_ratio)</option>
            </select>

            {form.method === METHOD_AFFINE ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  ['기준 환율 (fx_reference)', 'affineFxReference'],
                  ['k_pp_per_fx_percent', 'affineKPpPerFxPercent'],
                  ['bias_pp', 'affineBiasPp'],
                  ['고환율 2차 시작 (₩, 비우면 선형만)', 'affineHighFxOnsetInclusive'],
                  ['k_hi (고환율 2차, pp/%²)', 'affineKHiPpPerFxPercentSquared'],
                  ['clamp_min (비우면 없음)', 'affineClampMin'],
                  ['clamp_max (비우면 없음)', 'affineClampMax'],
                ].map(([label, key]) => (
                  <div key={key}>
                    <label style={{ fontSize: '12px', color: '#555' }}>{label}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form[key]}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      style={fieldStyle}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {(form.bucketsMeta || []).length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#888' }}>구간 데이터가 없습니다.</p>
                ) : (
                  form.bucketsMeta.map((b, i) => (
                    <div
                      key={b.order ?? i}
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <span style={{ flex: 1, fontSize: '12px', color: '#444' }}>
                        {b.order}: {fmtFxRange(b)}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.bucketDeltas[i] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((prev) => {
                            const bd = [...prev.bucketDeltas];
                            bd[i] = v;
                            return { ...prev, bucketDeltas: bd };
                          });
                        }}
                        style={{ ...fieldStyle, width: '100px', flex: 'none' }}
                        aria-label={`구간 ${b.order} Δ(pp)`}
                      />
                      <span style={{ fontSize: '11px', color: '#888' }}>pp</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid #eee',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#fff',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={resetToServerDefaults}
            disabled={saving || !serverDefaults}
            style={{
              padding: '8px 14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#f5f5f5',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            파일 기본값으로
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={saving || loading || !form}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              background: saving ? '#81c784' : '#2e7d32',
              color: '#fff',
              fontWeight: 'bold',
              cursor: saving || loading || !form ? 'default' : 'pointer',
            }}
          >
            {saving ? '저장 중…' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}
