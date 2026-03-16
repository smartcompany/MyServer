import jwt from 'jsonwebtoken';

const MY_SERVER_LOGIN_KEY = process.env.MY_SERVER_LOGIN_KEY;

/** JWT 검증 시 알고리즘만 고정(alg 혼동 방지). iss/aud는 새 로그인에서만 넣고 검증은 선택사항으로 둠. */
const JWT_OPTIONS = {
  algorithms: ['HS256'],
};

// 매우 단순한 메모리 기반 rate limit 버킷 (API 서버 프로세스 단위)
// key: `${identifier}:${routeKey}`
// value: { count: number, resetAt: number }
const RATE_LIMIT_BUCKETS = new Map();

/**
 * identifier: 사용자 식별자(가능하면 user id, 없으면 토큰 일부/아이피 등)
 * routeKey: 라우트별 구분용 키 (예: 'short1x:order', 'short1x:upbit-withdraw')
 * limit: windowMs 동안 허용할 최대 요청 수
 * windowMs: 윈도우(ms)
 * 초과 시 true를 리턴 (caller에서 429 처리)
 */
export function checkRateLimit(identifier, routeKey, limit, windowMs) {
  if (!identifier) return false;
  const now = Date.now();
  const key = `${identifier}:${routeKey}`;
  const bucket = RATE_LIMIT_BUCKETS.get(key);

  if (!bucket || now > bucket.resetAt) {
    RATE_LIMIT_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return true;
  }

  return false;
}

export function verifyToken(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { error: '토큰 없음', status: 401 };
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return { error: '토큰 없음', status: 401 };
  }

  try {
    const decoded = jwt.verify(token, MY_SERVER_LOGIN_KEY, JWT_OPTIONS);
    return { user: decoded, error: null };
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return { error: '토큰 만료', status: 403 };
    }
    if (err?.name === 'JsonWebTokenError') {
      return { error: '토큰 유효하지 않음', status: 403 };
    }
    return { error: '토큰 유효하지 않음', status: 403 };
  }
}

export function authMiddleware(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { error: '로그인 필요', status: 401 };
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return { error: '로그인 필요', status: 401 };
  }

  try {
    const decoded = jwt.verify(token, MY_SERVER_LOGIN_KEY, JWT_OPTIONS);
    return { user: decoded, error: null };
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return { error: '토큰 만료', status: 403 };
    }
    return { error: '토큰 유효하지 않음', status: 403 };
  }
}

