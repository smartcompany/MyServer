'use client';

import { useState, useEffect } from 'react';
import { isTokenValid } from './utils';

export default function TradePage() {
  const [loginArea, setLoginArea] = useState(true);
  const [mainArea, setMainArea] = useState(false);
  const [activeTab, setActiveTab] = useState('log');
  const [config, setConfig] = useState({
    buy: '',
    sell: '',
    isTrading: false,
    tradeAmount: '',
    isTradeByMoney: true
  });
  const [logs, setLogs] = useState('불러오는 중...');
  const [tradeData, setTradeData] = useState(null);
  const [processStatus, setProcessStatus] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [orders, setOrders] = useState([]);
  const [avaliableMoney, setAvaliableMoney] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (mainArea) {
      loadConfig();
      loadTradeLogs();
      loadLogs();
      loadProcessStatus();
      loadOrders();
      const logInterval = setInterval(loadLogs, 5000);
      const tradeInterval = setInterval(loadTradeLogs, 5000);
      const statusInterval = setInterval(loadProcessStatus, 10000);
      const ordersInterval = setInterval(loadOrders, 5000);
      return () => {
        clearInterval(logInterval);
        clearInterval(tradeInterval);
        clearInterval(statusInterval);
        clearInterval(ordersInterval);
      };
    }
  }, [mainArea]);

  function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoginArea(true);
      setMainArea(false);
      return;
    }

    // 클라이언트 사이드에서 토큰 유효성만 확인 (서버 호출 없음)
    if (isTokenValid(token)) {
      showMain();
    } else {
      // 토큰이 만료되었거나 유효하지 않음
      localStorage.removeItem('token');
      showLogin();
    }
  }

  async function login(e) {
    e.preventDefault();
    const id = document.getElementById('id').value;
    const pw = document.getElementById('pw').value;

    try {
      const res = await fetch('/api/trade/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: pw })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.token);
        showMain();
      } else {
        alert('로그인 실패!');
      }
    } catch (error) {
      console.error('로그인 실패:', error);
      alert('로그인 실패!');
    }
  }

  function showMain() {
    setLoginArea(false);
    setMainArea(true);
    setActiveTab('log');
  }

  function showLogin() {
    setLoginArea(true);
    setMainArea(false);
    localStorage.removeItem('token');
  }

  async function loadConfig() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/trade/config', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        const errorMsg = errorData.error || `HTTP ${res.status} 에러`;
        const details = errorData.details || '';
        alert(`❌ 설정 로드 실패: ${errorMsg}\n${details ? `상세: ${details}` : ''}`);
        console.error('설정 로드 실패:', errorMsg, details);
        return;
      }
      
      const data = await res.json();
      
      // 에러 응답인지 확인
      if (data.error) {
        alert(`❌ 설정 로드 실패: ${data.error}\n${data.details ? `상세: ${data.details}` : ''}`);
        console.error('설정 API 에러:', data);
        return;
      }
      
      setConfig({
        buy: data.buyThreshold ?? '',
        sell: data.sellThreshold ?? '',
        isTrading: Boolean(data.isTrading),
        tradeAmount: data.tradeAmount ?? '',
        isTradeByMoney: data.isTradeByMoney !== false
      });
      setConfigLoaded(true);
    } catch (error) {
      alert(`❌ 설정 로드 실패: ${error.message || '알 수 없는 오류'}`);
      console.error('설정 로드 실패:', error);
    }
  }

  async function updateConfig(nextConfig) {
    const token = localStorage.getItem('token');
    const c = nextConfig || config;
    if (!configLoaded) {
      console.warn('설정이 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.');
      return;
    }

    const buy = c.buy === '' ? null : Number(c.buy);
    const sell = c.sell === '' ? null : Number(c.sell);
    const tradeAmount = c.tradeAmount === '' ? null : Number(c.tradeAmount);
    const isTrading = Boolean(c.isTrading);
    const isTradeByMoney = c.isTradeByMoney !== false;

    try {
      const res = await fetch('/api/trade/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          updates: [
            ...(Number.isFinite(buy) ? [{ key: 'buyThreshold', value: buy }] : []),
            ...(Number.isFinite(sell) ? [{ key: 'sellThreshold', value: sell }] : []),
            { key: 'isTrading', value: isTrading },
            ...(Number.isFinite(tradeAmount) ? [{ key: 'tradeAmount', value: tradeAmount }] : []),
            { key: 'isTradeByMoney', value: isTradeByMoney }
          ]
        })
      });

      if (res.ok) {
        alert('설정이 반영되었습니다');
        loadConfig();
      } else {
        alert('설정 실패!');
      }
    } catch (error) {
      console.error('설정 업데이트 실패:', error);
      alert('설정 실패!');
    }
  }

  async function confirmReset() {
    if (confirm("매매 초기화를 진행하시겠습니까?")) {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch('/api/trade/init', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
        if (res.ok) {
          alert('초기화 완료');
        } else {
          alert('초기화 실패!');
        }
      } catch (error) {
        console.error('초기화 실패:', error);
        alert('초기화 실패!');
      }
    }
  }

  async function loadTradeLogs() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/trade/cashBalance', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      setTradeData(data);
    } catch (error) {
      console.error('거래 내역 로드 실패:', error);
    }
  }

  async function loadLogs() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/trade/logs', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (!res.ok) {
        console.error('로그 API 응답 실패:', res.status, res.statusText);
        setLogs(`로그를 불러올 수 없습니다. (HTTP ${res.status})`);
        return;
      }
      
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('HTML 응답이 반환되었습니다. API 라우트를 확인하세요.');
        setLogs('로그 API가 올바르게 작동하지 않습니다. 서버 로그를 확인하세요.');
        return;
      }
      
      const text = await res.text();
      setLogs(text);
    } catch (error) {
      console.error('로그 로드 실패:', error);
      setLogs(`로그 로드 실패: ${error.message}`);
    }
  }

  async function loadProcessStatus() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/trade/status', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      setProcessStatus(data.upbitTrade);
    } catch (error) {
      console.error('프로세스 상태 로드 실패:', error);
    }
  }

  async function loadOrders() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/trade/orders', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      setOrders(data.orders || []);
      setAvaliableMoney(data.avaliableMoney);
    } catch (error) {
      console.error('주문 목록 로드 실패:', error);
    }
  }

  async function deleteOrder(orderId) {
    if (!confirm('이 주문을 삭제하시겠습니까?')) {
      return;
    }
    
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/trade/orders?id=${orderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (res.ok) {
        alert('주문이 삭제되었습니다');
        loadOrders();
      } else {
        alert('주문 삭제 실패!');
      }
    } catch (error) {
      console.error('주문 삭제 실패:', error);
      alert('주문 삭제 실패!');
    }
  }

  function getStatusText(status) {
    switch (status) {
      case 'buy_waiting': return '매수 대기';
      case 'sell_waiting': return '매도 대기';
      case 'completed': return '완료';
      default: return status;
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'buy_waiting': return '#2196F3';
      case 'sell_waiting': return '#FF9800';
      case 'completed': return '#4CAF50';
      default: return '#666';
    }
  }

  return (
    <div style={{
      fontFamily: 'sans-serif',
      margin: 0,
      padding: '20px',
      maxWidth: '600px',
      marginLeft: 'auto',
      marginRight: 'auto'
    }}>
      {loginArea && (
        <div id="loginArea" style={{ marginTop: '40px' }}>
          <h2 style={{ textAlign: 'center' }}>🔐 관리자 로그인</h2>
          <form id="loginForm" onSubmit={login} style={{
            display: 'flex',
            flexDirection: 'column'
          }}>
            <label style={{ display: 'block', marginBottom: '10px' }}>
              ID: <input id="id" type="text" placeholder="admin" autoComplete="username" style={{
                width: '100%',
                padding: '12px',
                marginTop: '5px',
                marginBottom: '15px',
                boxSizing: 'border-box',
                fontSize: '16px'
              }} />
            </label>
            <label style={{ display: 'block', marginBottom: '10px' }}>
              PW: <input id="pw" type="password" placeholder="password" autoComplete="current-password" style={{
                width: '100%',
                padding: '12px',
                marginTop: '5px',
                marginBottom: '15px',
                boxSizing: 'border-box',
                fontSize: '16px'
              }} />
            </label>
            <button type="submit" style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              marginBottom: '15px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}>로그인</button>
          </form>
        </div>
      )}

      {mainArea && (
        <div id="mainArea">
          <h3 style={{ textAlign: 'center' }}>김치 프리미엄 기준 설정</h3>
          매수 기준: <input id="buy" type="number" step="0.01" value={config.buy} onChange={(e) => setConfig((prev) => ({ ...prev, buy: e.target.value }))} style={{
            width: '100%',
            padding: '12px',
            marginTop: '5px',
            marginBottom: '15px',
            boxSizing: 'border-box',
            fontSize: '16px'
          }} /><br />
          매도 기준: <input id="sell" type="number" step="0.01" value={config.sell} onChange={(e) => setConfig((prev) => ({ ...prev, sell: e.target.value }))} style={{
            width: '100%',
            padding: '12px',
            marginTop: '5px',
            marginBottom: '15px',
            boxSizing: 'border-box',
            fontSize: '16px'
          }} /><br />
          <label style={{ display: 'block', marginBottom: '10px' }}>
            <input type="radio" name="trade-type" value="money" checked={config.isTradeByMoney} onChange={() => {
              const next = { ...config, isTradeByMoney: true };
              setConfig(next);
              updateConfig(next);
            }} /> 금액으로 매매
          </label>
          <label style={{ display: 'block', marginBottom: '10px' }}>
            <input type="radio" name="trade-type" value="volume" checked={!config.isTradeByMoney} onChange={() => {
              const next = { ...config, isTradeByMoney: false };
              setConfig(next);
              updateConfig(next);
            }} /> 수량으로 매매
          </label>
          <input id="tradeAmount" type="number" step="1" value={config.tradeAmount} onChange={(e) => setConfig((prev) => ({ ...prev, tradeAmount: e.target.value }))} style={{
            width: '100%',
            padding: '12px',
            marginTop: '5px',
            marginBottom: '15px',
            boxSizing: 'border-box',
            fontSize: '16px'
          }} /><br />
          <h3 style={{ textAlign: 'center' }}>트레이딩 설정</h3>
          {processStatus && (
            <div style={{
              padding: '10px',
              marginBottom: '10px',
              backgroundColor: processStatus.running ? '#e8f5e9' : '#ffebee',
              borderRadius: '4px',
              fontSize: '14px'
            }}>
              <strong>프로세스 상태:</strong> {processStatus.running ? '✅ 실행 중' : '❌ 중지됨'}
              {processStatus.running && processStatus.uptime && (
                <span style={{ marginLeft: '10px', color: '#666' }}>
                  (가동 시간: {Math.floor((Date.now() - processStatus.uptime) / 1000 / 60)}분)
                </span>
              )}
            </div>
          )}
          <label style={{ display: 'block', marginBottom: '10px' }}>
            <input
              id="isTrading"
              type="checkbox"
              checked={config.isTrading}
              onChange={(e) => {
                const next = { ...config, isTrading: e.target.checked };
                setConfig(next);
                updateConfig(next);
              }}
            />
            트레이딩 시작/중지
            <span style={{ fontSize: '12px', color: '#666', marginLeft: '5px' }}>
              (체크박스 변경 시 즉시 적용됩니다)
            </span>
            <button onClick={confirmReset} style={{
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              marginLeft: '10px',
              cursor: 'pointer'
            }}>매매 초기화</button>
          </label>

          <button onClick={updateConfig} style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            marginBottom: '15px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}>설정 적용</button>

          <div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '10px' }}>
              <button onClick={() => setActiveTab('log')} style={{
                flex: 1,
                padding: '10px',
                backgroundColor: activeTab === 'log' ? '#4CAF50' : '#ddd',
                color: activeTab === 'log' ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}>최근 로그</button>
              <button onClick={() => setActiveTab('trade')} style={{
                flex: 1,
                padding: '10px',
                backgroundColor: activeTab === 'trade' ? '#4CAF50' : '#ddd',
                color: activeTab === 'trade' ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}>거래 내역</button>
              <button onClick={() => setActiveTab('orders')} style={{
                flex: 1,
                padding: '10px',
                backgroundColor: activeTab === 'orders' ? '#4CAF50' : '#ddd',
                color: activeTab === 'orders' ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}>주문 목록</button>
            </div>
            {activeTab === 'trade' && (
              <div id="tradeTab">
                <pre style={{
                  background: '#f4f4f4',
                  padding: '10px',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word'
                }}>
                  {tradeData ? (
                    <>
                      <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                        평가 금액: {tradeData.total}
                      </div>
                      <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                        잔여 현금: {tradeData.restMoney}
                      </div>
                      <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                        잔여 테더: {tradeData.restUsdt}
                      </div>
                      {(tradeData.history || []).sort((a, b) => new Date(a.time) - new Date(b.time)).map((item, idx) => (
                        <div key={idx}>
                          [{item.date}] {item.type} {item.price} X {item.volume} 총: {item.price * item.volume}원
                        </div>
                      ))}
                    </>
                  ) : '불러오는 중...'}
                </pre>
              </div>
            )}
            {activeTab === 'log' && (
              <div id="logTab">
                <pre style={{
                  background: '#f4f4f4',
                  padding: '10px',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word'
                }}>{logs}</pre>
              </div>
            )}
            {activeTab === 'orders' && (
              <div id="ordersTab">
                <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                  <strong>사용 가능 금액:</strong> {avaliableMoney !== null ? `${Number(avaliableMoney).toLocaleString()}원` : '로딩 중...'}
                </div>
                <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
                  활성 주문: {orders.filter(o => o.status === 'buy_waiting' || o.status === 'sell_waiting').length}개
                </div>
                {orders.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    주문이 없습니다
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {orders.map((order) => (
                      <div key={order.id} style={{
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        padding: '15px',
                        backgroundColor: '#fff'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div>
                            <strong style={{ color: getStatusColor(order.status) }}>
                              {getStatusText(order.status)}
                            </strong>
                            <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                              ID: {order.id.substring(0, 8)}...
                            </span>
                          </div>
                          {(order.status === 'buy_waiting' || order.status === 'sell_waiting') && (
                            <button onClick={() => deleteOrder(order.id)} style={{
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '5px 10px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}>삭제</button>
                          )}
                        </div>
                        <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                          {order.buyPrice && (
                            <div>매수가: {Number(order.buyPrice).toLocaleString()}원</div>
                          )}
                          {order.sellPrice && (
                            <div>매도가: {Number(order.sellPrice).toLocaleString()}원</div>
                          )}
                          {order.volume && (
                            <div>수량: {Number(order.volume).toFixed(1)} USDT</div>
                          )}
                          {order.buyUuid && (
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              매수 UUID: {order.buyUuid.substring(0, 20)}...
                            </div>
                          )}
                          {order.sellUuid && (
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              매도 UUID: {order.sellUuid.substring(0, 20)}...
                            </div>
                          )}
                          {order.createdAt && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                              생성: {new Date(order.createdAt).toLocaleString('ko-KR')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

