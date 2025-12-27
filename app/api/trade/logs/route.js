import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import fs from 'fs';

const logFilePath = getTradeServerPath('trade-logs.txt');

export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    if (!fs.existsSync(logFilePath)) {
      return new Response('', { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    console.log('logFilePath:', logFilePath);

    const data = fs.readFileSync(logFilePath, 'utf8');
    const lines = data.trim().split('\n').slice(-20).join('\n');
    
    return new Response(lines, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error) {
    console.error('로그 읽기 실패:', error);
    return Response.json({ error: '로그를 읽을 수 없습니다' }, { status: 500 });
  }
}

