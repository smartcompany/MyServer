import { verifyToken } from '../middleware';
import { getTradeServerPath, needInitForOrderState } from '../utils';
import fs from 'fs';

const configFilePath = getTradeServerPath('config.json');

function readConfigFresh() {
  if (!fs.existsSync(configFilePath)) {
    console.error('❌ [config API] 설정 파일이 없습니다:', configFilePath);
    throw new Error(`설정 파일을 찾을 수 없습니다: ${configFilePath}`);
  }
  try {
    const content = fs.readFileSync(configFilePath, 'utf8');
    const config = JSON.parse(content);
    return config;
  } catch (error) {
    console.error('❌ [config API] 설정 파일 읽기 실패:', error);
    throw new Error(`설정 파일 읽기 실패: ${error.message}`);
  }
}

export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // 매 요청마다 파일을 읽어야 최신 상태(모바일에서 본 체크 상태 등)가 반영됨
    const config = readConfigFresh();
    return Response.json(config);
  } catch (error) {
    console.error('❌ [config API] GET 에러:', error.message);
    return Response.json({ 
      error: '설정 파일을 읽을 수 없습니다',
      details: error.message 
    }, { status: 500 });
  }
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

    updates.forEach(({ key, value }) => {
      console.log(`📥 [config API] 업데이트 요청: ${key} = ${JSON.stringify(value)} (타입: ${typeof value})`);
      // stopTradingTimes 같은 배열도 업데이트 가능하도록 key 존재 여부 체크 제거
      const oldValue = config[key];
      config[key] = value;
      console.log(`🔧 설정 변경됨: ${key} = ${JSON.stringify(value)} (이전: ${JSON.stringify(oldValue)})`);
      changed = true;
    });
    
    console.log(`📋 [config API] 최종 config:`, JSON.stringify(config, null, 2));

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

