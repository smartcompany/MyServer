import jwt from 'jsonwebtoken';

const MY_SERVER_LOGIN_KEY = process.env.MY_SERVER_LOGIN_KEY;

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
    const decoded = jwt.verify(token, MY_SERVER_LOGIN_KEY);
    return { user: decoded, error: null };
  } catch (err) {
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
    const decoded = jwt.verify(token, MY_SERVER_LOGIN_KEY);
    return { user: decoded, error: null };
  } catch (err) {
    return { error: '토큰 유효하지 않음', status: 403 };
  }
}

