import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import fs from 'fs';

const configFilePath = getTradeServerPath('config.json');
const orderStateFilePath = getTradeServerPath('orderState.json');

let config = {};
if (fs.existsSync(configFilePath)) {
  try {
    config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    console.log('현재 설정값 파일 읽기');
    console.log(JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('설정 파일 읽기 실패:', error);
  }
} else {
  console.log('현재 설정값 참조 파일 없음', configFilePath);
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

