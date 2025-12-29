import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import fs from 'fs';

const configFilePath = getTradeServerPath('config.json');
const orderStateFilePath = getTradeServerPath('orderState.json');

function readConfigFresh() {
  if (!fs.existsSync(configFilePath)) {
    console.log('현재 설정값 참조 파일 없음', configFilePath);
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
  } catch (error) {
    console.error('설정 파일 읽기 실패:', error);
    return {};
  }
}

function needInitForOrderState() {
  if (fs.existsSync(orderStateFilePath)) {
    const data = fs.readFileSync(orderStateFilePath, 'utf8');
    let history = JSON.parse(data);
    history.needInit = true;
    fs.writeFileSync(orderStateFilePath, JSON.stringify(history));
  }
}

export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // 매 요청마다 파일을 읽어야 최신 상태(모바일에서 본 체크 상태 등)가 반영됨
  const config = readConfigFresh();
  return Response.json(config);
}

export async function POST(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { updates } = await request.json();

    if (!Array.isArray(updates)) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // 다른 코드(upbit-trade 등)가 파일을 수정할 수 있으므로 최신 파일을 기준으로 업데이트
    const config = readConfigFresh();
    let changed = false;
    const prevTradeAmount = config.tradeAmount;

    updates.forEach(({ key, value }) => {
      if (key in config) {
        config[key] = value;
        console.log(`🔧 설정 변경됨: ${key} = ${value}`);
        changed = true;
      }
    });

    if (prevTradeAmount !== config.tradeAmount) {
      console.log(`물량이 변경되면 초기화`);
      needInitForOrderState();
    }

    if (changed) {
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
      return new Response(null, { status: 200 });
    } else {
      return Response.json({ error: 'No valid keys updated' }, { status: 400 });
    }
  } catch (error) {
    console.error('설정 업데이트 실패:', error);
    return Response.json({ error: '서버 오류' }, { status: 500 });
  }
}

