import jwt from 'jsonwebtoken';

const MY_SERVER_LOGIN_KEY = process.env.MY_SERVER_LOGIN_KEY;

/** JWT 검증 시 알고리즘만 고정(alg 혼동 방지). iss/aud는 새 로그인에서만 넣고 검증은 선택사항으로 둠. */
const JWT_OPTIONS = {
  algorithms: ['HS256'],
};

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

