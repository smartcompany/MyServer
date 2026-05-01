/**
 * 차트용 JSON(usd_krw_hour.json, upbit_usdt_hour.json)을 Supabase Storage에 덮어쓰기.
 * 환경 변수:
 * - NEXT_PUBLIC_SUPABASE_URL (필수)
 * - SUPABASE_SERVICE_ROLE_KEY (필수 · 서버 전용)
 * - STORAGE_BUCKET (예: rate-history)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const fssync = require('fs');

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

function getChartBucket() {
  return typeof process.env.STORAGE_BUCKET === 'string'
    ? process.env.STORAGE_BUCKET.trim()
    : '';
}

/**
 * 버킷 내 objectName(경로)에 파일이 하나라도 있는지 list로 확인 (download보다 가벼움)
 * @returns {Promise<boolean|null>} 없음 false, 있음 true, 확인 실패 null
 */
async function chartStorageObjectExists(supabase, bucket, objectName) {
  const trim = String(objectName).replace(/^\/+/, '');
  const slash = trim.lastIndexOf('/');
  const folder = slash >= 0 ? trim.slice(0, slash) : '';
  const file = slash >= 0 ? trim.slice(slash + 1) : trim;
  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 1000,
  });
  if (error) {
    console.warn('[chart-supabase] list (exists check):', objectName, error.message || error);
    return null;
  }
  return Array.isArray(data) && data.some((e) => e.name === file);
}

/**
 * 로컬에 파일이 있고 Storage에는 아직 없을 때만 업로드 (신규 버킷·초기 배포용)
 */
async function ensureChartDataOnRemoteIfLocalExists(absolutePath, objectName) {
  const bucket = getChartBucket();
  const supabase = getChartStorageClient();
  if (!supabase || !bucket) return;
  if (!fssync.existsSync(absolutePath)) return;

  const exists = await chartStorageObjectExists(supabase, bucket, objectName);
  if (exists === null) return;
  if (exists) return;

  console.log('[chart-supabase] 원격에 없음 → 로컬 기준 초기 업로드:', objectName);
  await uploadChartDataFile(absolutePath, objectName);
}

/**
 * 로컬 JSON 파일 내용으로 Storage 객체를 교체(upload + upsert)
 * @param {string} absolutePath - 디스크 절대 경로
 * @param {string} objectName - 버킷 내 경로 (예: usd_krw_hour.json)
 */
async function uploadChartDataFile(absolutePath, objectName) {
  const bucket = getChartBucket();
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

module.exports = {
  uploadChartDataFile,
  ensureChartDataOnRemoteIfLocalExists,
};
