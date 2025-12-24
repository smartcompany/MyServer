import { verifyToken } from '../middleware';
import fs from 'fs';
import path from 'path';

const cashBalanceLogPath = path.join(process.cwd(), 'trade-server', 'cashBalance.json');

export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    if (!fs.existsSync(cashBalanceLogPath)) {
      return Response.json({});
    }

    const data = fs.readFileSync(cashBalanceLogPath, 'utf8');
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('거래 내역 읽기 실패:', error);
    return Response.json({ error: '거래 내역을 읽을 수 없습니다' }, { status: 500 });
  }
}

