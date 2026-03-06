import crypto from 'crypto';

const BYBIT_API_KEY = process.env.BYBIT_API_KEY;
const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET;
const BYBIT_BASE_URL = 'https://api.bybit.com';

export function getBybitConfig() {
  if (!BYBIT_API_KEY || !BYBIT_API_SECRET) {
    throw new Error('BYBIT_API_KEY, BYBIT_API_SECRET 환경 변수가 필요합니다.');
  }
  return { apiKey: BYBIT_API_KEY, apiSecret: BYBIT_API_SECRET, baseUrl: BYBIT_BASE_URL };
}

/**
 * Bybit v5 HMAC 서명
 * POST: timestamp + api_key + recv_window + jsonBodyString
 * GET:  timestamp + api_key + recv_window + queryString
 */
export function signBybit(apiSecret, timestamp, recvWindow, payload) {
  const str = `${timestamp}${BYBIT_API_KEY}${recvWindow}${payload}`;
  return crypto.createHmac('sha256', apiSecret).update(str).digest('hex');
}

/**
 * 인증이 필요한 Bybit API 호출
 */
export async function bybitSignedRequest(method, path, body = null) {
  const { apiKey, apiSecret, baseUrl } = getBybitConfig();
  const recvWindow = 5000;
  const timestamp = Date.now().toString();
  const url = `${baseUrl}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  let signPayload = '';
  if (method === 'GET' && path.includes('?')) {
    signPayload = path.split('?')[1];
  } else if (method === 'POST' && body) {
    signPayload = typeof body === 'string' ? body : JSON.stringify(body);
    options.body = signPayload;
  }
  const signature = signBybit(apiSecret, timestamp, recvWindow, signPayload);
  options.headers['X-BAPI-API-KEY'] = apiKey;
  options.headers['X-BAPI-TIMESTAMP'] = timestamp;
  options.headers['X-BAPI-SIGN'] = signature;
  options.headers['X-BAPI-RECV-WINDOW'] = String(recvWindow);

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (data.retCode !== undefined && data.retCode !== 0) {
    const err = new Error(data.retMsg || 'Bybit API 오류');
    err.retCode = data.retCode;
    err.retMsg = data.retMsg;
    err.result = data.result;
    throw err;
  }
  return data;
}

/**
 * 공개 API (서명 불필요) - 예: 호가창
 */
export async function bybitPublicGet(path) {
  const baseUrl = BYBIT_BASE_URL || 'https://api.bybit.com';
  const url = `${baseUrl}${path}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data.retCode !== undefined && data.retCode !== 0) {
    const err = new Error(data.retMsg || 'Bybit API 오류');
    err.retCode = data.retCode;
    throw err;
  }
  return data;
}
