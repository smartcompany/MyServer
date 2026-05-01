/**
 * 차트용 JSON(usd_krw_hour.json, upbit_usdt_hour.json)을 Supabase Storage에 덮어쓰기.
 * 환경 변수:
 * - NEXT_PUBLIC_SUPABASE_URL (필수)
 * - SUPABASE_SERVICE_ROLE_KEY (필수 · 서버 전용)
 * - STORAGE_BUCKET (예: rate-history)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;

let _storageClient = null;

function getChartStorageClient() {
  if (_storageClient) return _storageClient;
  const url =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string'
      ? process.env.NEXT_PUBLIC_SUPABASE_URL.trim()
      : '';
  const key =
    typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string'
      ? process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
      : '';
  if (!url || !key) return null;
  _storageClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _storageClient;
}

/**
 * 로컬 JSON 파일 내용으로 Storage 객체를 교체(upload + upsert)
 * @param {string} absolutePath - 디스크 절대 경로
 * @param {string} objectName - 버킷 내 경로 (예: usd_krw_hour.json)
 */
async function uploadChartDataFile(absolutePath, objectName) {
  const bucket =
    typeof process.env.STORAGE_BUCKET === 'string'
      ? process.env.STORAGE_BUCKET.trim()
      : '';
  const supabase = getChartStorageClient();
  if (!supabase || !bucket) return;

  let body;
  try {
    body = await fs.readFile(absolutePath);
  } catch (e) {
    console.error('[chart-supabase] read failed:', objectName, e.message || e);
    return;
  }

  try {
    const { error } = await supabase.storage.from(bucket).upload(objectName, body, {
      contentType: 'application/json; charset=utf-8',
      upsert: true,
    });
    if (error)
      console.error('[chart-supabase] upload:', objectName, error.message || error);
    else console.log('[chart-supabase] upload:', objectName, '→', bucket);
  } catch (e) {
    console.error('[chart-supabase] upload exception:', objectName, e.message || e);
  }
}

module.exports = { uploadChartDataFile };
