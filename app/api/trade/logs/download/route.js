import { verifyToken } from '../../middleware';
import { getTradeServerPath } from '../../utils';
import fs from 'fs';
import path from 'path';

const logFilePath = getTradeServerPath('trade-logs.txt');

export async function GET(request) {
  const auth = verifyToken(request);
  
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    if (!fs.existsSync(logFilePath)) {
      return Response.json({ error: '로그 파일이 존재하지 않습니다' }, { status: 404 });
    }

    const data = fs.readFileSync(logFilePath, 'utf8');
    
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="trade-logs.txt"`,
      }
    });
  } catch (error) {
    console.error('로그 파일 다운로드 실패:', error);
    return Response.json({ error: '로그 파일을 다운로드할 수 없습니다' }, { status: 500 });
  }
}
