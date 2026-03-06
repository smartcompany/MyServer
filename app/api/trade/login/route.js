import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 관리자 로그인 API (보안 강화)
 * - PASSWORD_HASH: .env에 BYBIT_API_KEY 처럼 넣기 위해 base64 인코딩 사용 (따옴표·$ 불필요)
 *   node scripts/gen-password-hash.js 로 생성한 값을 .env에 PASSWORD_HASH=... 로 넣으면 됨.
 * - .password_hash 파일이 있으면 그 raw 해시 우선 사용.
 * - IP당 로그인 실패 5회 초과 시 15분 차단. JWT: HS256, iss/aud 포함.
 */
const MY_SERVER_LOGIN_KEY = process.env.MY_SERVER_LOGIN_KEY;
const USER_ID = process.env.USER_ID?.trim() || '';

/** 해시 반환: .password_hash 파일 우선, 없으면 process.env.PASSWORD_HASH (base64면 디코딩) */
function getStoredHash() {
  try {
    const hashFile = join(process.cwd(), '.password_hash');
    if (existsSync(hashFile)) {
      const raw = readFileSync(hashFile, 'utf8').trim();
      if (raw.length === 60 && (raw.startsWith('$2b$') || raw.startsWith('$2a$'))) return raw;
    }
  } catch (_) {}

  const envVal = (process.env.PASSWORD_HASH || '').trim();
  if (!envVal) return '';
  if (envVal.startsWith('$2b$') || envVal.startsWith('$2a$')) return envVal;
  try {
    const decoded = Buffer.from(envVal, 'base64').toString('utf8');
    if (decoded.length === 60 && (decoded.startsWith('$2b$') || decoded.startsWith('$2a$'))) return decoded;
  } catch (_) {}
  return envVal;
}

const JWT_ISSUER = 'myserver-admin';
const JWT_AUDIENCE = 'myserver-admin';

const isDev = process.env.NODE_ENV === 'development';

// 로그인 실패 횟수 제한: IP당 5회 실패 시 15분 차단
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (now >= entry.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX_ATTEMPTS;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  if (now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function clearRateLimitOnSuccess(ip) {
  loginAttempts.delete(ip);
}

/** 개발 시에만: .env 로드 여부 확인 (브라우저에서 /api/trade/login/check 호출) */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'Not available' }, { status: 404 });
  }
  const PASSWORD_HASH = getStoredHash();
  const hasUserId = !!(USER_ID && USER_ID.length > 0);
  const hasHash = !!(PASSWORD_HASH && PASSWORD_HASH.length > 0);
  const hashLength = PASSWORD_HASH ? PASSWORD_HASH.length : 0;
  const hashValidLength = hashLength === 60;
  return Response.json({
    ok: hasUserId && hasHash && hashValidLength,
    userIdSet: hasUserId,
    userIdLength: USER_ID.length,
    passwordHashSet: hasHash,
    passwordHashLength: hashLength,
    hint: !hasUserId ? 'USER_ID를 .env에 설정하세요.'
      : !hasHash ? 'PASSWORD_HASH를 .env에 설정하세요.'
      : !hashValidLength ? 'PASSWORD_HASH는 60자여야 합니다. 해시를 다시 생성해 복사하세요.'
      : '환경 변수 정상. 아이디/비밀번호를 확인하세요.',
  });
}

export async function POST(request) {
  const ip = getClientIp(request);

  try {
    if (!MY_SERVER_LOGIN_KEY || !USER_ID) {
      console.error('❌ 로그인 환경 변수 누락 (MY_SERVER_LOGIN_KEY, USER_ID 필요)');
      return Response.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const PASSWORD_HASH = getStoredHash();
    if (!PASSWORD_HASH || PASSWORD_HASH.length !== 60) {
      console.error('❌ PASSWORD_HASH 없음 또는 60자 아님 (길이:', PASSWORD_HASH.length, ')');
      return Response.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    if (isRateLimited(ip)) {
      return Response.json(
        { error: '로그인 시도 횟수 초과. 15분 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const inputPassword = typeof body?.password === 'string' ? body.password : '';

    if (!id || !inputPassword) {
      recordFailedLogin(ip);
      return Response.json({
        error: isDev ? '아이디와 비밀번호를 모두 입력해주세요.' : '인증 실패',
      }, { status: 401 });
    }

    if (id !== USER_ID) {
      recordFailedLogin(ip);
      console.error('[login] 인증 실패: 아이디 불일치 (입력 길이:', id.length, ', env USER_ID 길이:', USER_ID.length, ')');
      return Response.json({
        error: isDev ? '아이디가 올바르지 않습니다. .env의 USER_ID와 일치하는지 확인하세요.' : '인증 실패',
      }, { status: 401 });
    }

    let passwordOk = false;
    try {
      passwordOk = await bcrypt.compare(inputPassword, PASSWORD_HASH);
    } catch (e) {
      console.error('[login] bcrypt.compare 예외:', e?.message);
      passwordOk = false;
    }

    if (!passwordOk) {
      recordFailedLogin(ip);
      console.error('[login] 인증 실패: 비밀번호 불일치 (해시 길이:', PASSWORD_HASH.length, ')');
      return Response.json({
        error: isDev ? '비밀번호가 올바르지 않습니다. scripts/gen-password-hash.js로 다시 생성해보세요.' : '인증 실패',
        ...(isDev && { readHash: PASSWORD_HASH, readHashLength: PASSWORD_HASH.length }),
      }, { status: 401 });
    }

    clearRateLimitOnSuccess(ip);

    const token = jwt.sign(
      { user: id },
      MY_SERVER_LOGIN_KEY,
      {
        algorithm: 'HS256',
        expiresIn: '1h',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }
    );

    return Response.json({ token });
  } catch (error) {
    console.error('로그인 API 에러:', error?.message || error);
    return Response.json({ error: '서버 오류' }, { status: 500 });
  }
}
