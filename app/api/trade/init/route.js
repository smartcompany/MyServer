import { verifyToken } from '../middleware';
import { getTradeServerPath, needInitForOrderState } from '../utils';
import fs from 'fs';

const logFilePath = getTradeServerPath('trade-logs.txt');
const cashBalanceLogPath = getTradeServerPath('cashBalance.json');

export async function POST(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // log, cashBalance 파일 삭제
    fs.writeFileSync(logFilePath, '');
    fs.writeFileSync(cashBalanceLogPath, '{}');
    needInitForOrderState();

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('초기화 실패:', error);
    return Response.json({ error: '초기화 실패' }, { status: 500 });
  }
}

