import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import fs from 'fs';

/** USDT Signal과 동일한 구간 테이블 (trade-server/kimchi-fx-delta.json) */
export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const filePath = getTradeServerPath('kimchi-fx-delta.json');
  try {
    if (!fs.existsSync(filePath)) {
      return Response.json({ error: 'kimchi-fx-delta.json 없음' }, { status: 404 });
    }
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Response.json(json);
  } catch (e) {
    console.error('[kimchi-fx-delta API]', e);
    return Response.json({ error: e.message || '읽기 실패' }, { status: 500 });
  }
}
