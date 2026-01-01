import { verifyToken } from '../middleware';
import { getTradeServerPath } from '../utils';
import fs from 'fs';
import path from 'path';

const cashBalanceLogPath = getTradeServerPath('cashBalance.json');
const configPath = getTradeServerPath('config.json');
const orderStatePath = getTradeServerPath('orderState.json');

function loadConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

function loadOrderState() {
  try {
    if (!fs.existsSync(orderStatePath)) {
      return { orders: [] };
    }
    const data = fs.readFileSync(orderStatePath, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.orders ? parsed : { orders: [] };
  } catch (err) {
    return { orders: [] };
  }
}

export async function GET(request) {
  const auth = verifyToken(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let cashBalance = {};
    
    if (fs.existsSync(cashBalanceLogPath)) {
      const data = fs.readFileSync(cashBalanceLogPath, 'utf8');
      cashBalance = JSON.parse(data);
    }
    
    if (!cashBalance.history) {
      cashBalance.history = [];
    }
    
    return new Response(JSON.stringify(cashBalance), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('거래 내역 읽기 실패:', error);
    return Response.json({ error: '거래 내역을 읽을 수 없습니다' }, { status: 500 });
  }
}

