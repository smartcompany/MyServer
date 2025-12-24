// 클라이언트 사이드 JWT 토큰 유틸리티

export function decodeJWT(token) {
  try {
    // JWT는 base64로 인코딩된 3부분으로 구성: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // payload 디코딩
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch (error) {
    console.error('JWT 디코딩 실패:', error);
    return null;
  }
}

export function isTokenValid(token) {
  if (!token) {
    return false;
  }
  
  const payload = decodeJWT(token);
  if (!payload) {
    return false;
  }
  
  // 만료 시간 확인 (exp는 초 단위 Unix timestamp)
  if (payload.exp) {
    const now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) {
      return false; // 만료됨
    }
  }
  
  return true;
}

