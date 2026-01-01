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
    tradeAmount: ''
  });
  const [isTradeByMoney, setIsTradeByMoney] = useState(true); // 매매 방식: true=금액, false=수량
  const [logs, setLogs] = useState('불러오는 중...');
  const [tradeData, setTradeData] = useState(null);
  const [processStatus, setProcessStatus] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [balance, setBalance] = useState({ availableMoney: 0, availableUsdt: 0 });
  const [monitorData, setMonitorData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskTab, setTaskTab] = useState('tasks'); // 'tasks' or 'logs'

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (mainArea) {
      loadConfig();
      loadTradeLogs();
      loadLogs();
      loadProcessStatus();
      loadMonitorData();
      loadTasks();
      const logInterval = setInterval(loadLogs, 5000);
      const tradeInterval = setInterval(loadTradeLogs, 5000);
      const statusInterval = setInterval(loadProcessStatus, 10000);
      const monitorInterval = setInterval(loadMonitorData, 3000);
      const tasksInterval = setInterval(loadTasks, 3000);
      return () => {
        clearInterval(logInterval);
        clearInterval(tradeInterval);
        clearInterval(statusInterval);
        clearInterval(monitorInterval);
        clearInterval(tasksInterval);
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
    // 기본 탭은 매수로 설정 (tradeData는 useEffect에서 로드됨)
    setActiveTab('buy');
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
        tradeAmount: '' // config.json에 없으므로 빈 값으로 초기화
      });
      setIsTradeByMoney(data.isTradeByMoney ?? true);
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
      console.warn('설정이 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요. ');
      return;
    }

    const isTrading = Boolean(c.isTrading);

    try {
      const res = await fetch('/api/trade/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          updates: [
            { key: 'isTrading', value: isTrading }
          ]
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('설정 업데이트 실패:', errorData.error || 'Unknown error');
        // 실패 시 이전 값으로 되돌리기
        setConfig(prev => ({ ...prev, isTrading: !isTrading }));
      }
      // 성공 시 이미 로컬 state가 업데이트되어 있으므로 추가 작업 불필요
    } catch (error) {
      console.error('설정 업데이트 실패:', error);
      // 실패 시 이전 값으로 되돌리기
      setConfig(prev => ({ ...prev, isTrading: !isTrading }));
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
      // 보유 금액과 테더 정보 업데이트
      const newBalance = {
        availableMoney: data.availableMoney || 0,
        availableUsdt: data.availableUsdt || 0
      };
      setBalance(newBalance);
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

  async function loadMonitorData() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/trade/monitor', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        setMonitorData(data);
        // 모니터링 데이터에서 잔액 정보도 업데이트
        if (data.balance) {
          setBalance({
            availableMoney: data.balance.availableMoney || 0,
            availableUsdt: data.balance.availableUsdt || 0
          });
        }
      }
    } catch (error) {
      console.error('모니터링 데이터 로드 실패:', error);
    }
  }


  async function loadTasks() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/trade/tasks', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('작업 목록 로드 실패:', error);
    }
  }

  async function addBuyTask() {
    const token = localStorage.getItem('token');
    const buyInput = document.getElementById('buy');
    const sellInput = document.getElementById('sell');
    const tradeAmountInput = document.getElementById('tradeAmount');
    const isTradeByMoneyRadio = document.querySelector('input[name="trade-type"]:checked');
    const amount = tradeAmountInput?.value;
    
    if (!amount || Number(amount) <= 0) {
      alert('매수 금액/수량을 입력해주세요');
      return;
    }

    if (buyInput?.value === '' || sellInput?.value === '') {
      alert('매수 기준 김치 프리미엄 또는 매도 기준 김치 프리미엄을 입력해주세요');
      return;
    }

    // 작업 추가
    try {
      const isTradeByMoney = isTradeByMoneyRadio?.value === 'money';
      const buyThreshold = Number(buyInput?.value);
      const sellThreshold = Number(sellInput?.value);

      const res = await fetch('/api/trade/tasks', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'buy',
          amount: Number(amount),
          buyThreshold: buyThreshold,
          sellThreshold: sellThreshold,
          isTradeByMoney: isTradeByMoney
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message || '매수 작업이 추가되었습니다');
        loadTasks();
        loadConfig(); // 설정 다시 로드
      } else {
        const error = await res.json();
        alert(error.error || '매수 작업 추가 실패');
      }
    } catch (error) {
      console.error('매수 작업 추가 실패:', error);
      alert('매수 작업 추가 실패');
    }
  }

  async function addSellTask() {
    const token = localStorage.getItem('token');
    const buyInput = document.getElementById('buy');
    const sellInput = document.getElementById('sell');
    const sellAmountInput = document.getElementById('sellAmount');
    const amount = sellAmountInput?.value;
    
    if (!amount || Number(amount) <= 0) {
      alert('매도 금액/수량을 입력해주세요');
      return;
    }
    
    if (buyInput?.value === '' || sellInput?.value === '') {
      alert('매수 기준 김치 프리미엄 또는 매도 기준 김치 프리미엄을 입력해주세요');
      return;
    }
        // 작업 추가
    try {
      const sellThreshold = Number(sellInput?.value);
      const buyThreshold = Number(buyInput?.value);

      const res = await fetch('/api/trade/tasks', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'sell',
          amount: Number(amount),
          buyThreshold: buyThreshold,
          sellThreshold: sellThreshold,
          isTradeByMoney: isTradeByMoney // 매도 방식 전달
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message || '매도 작업이 추가되었습니다');
        loadTasks();
        loadConfig(); // 설정 다시 로드
      } else {
        const error = await res.json();
        alert(error.error || '매도 작업 추가 실패');
      }
    } catch (error) {
      console.error('매도 작업 추가 실패:', error);
      alert('매도 작업 추가 실패');
    }
  }

  async function deleteTask(taskId) {
    if (!confirm('이 작업을 삭제하시겠습니까?')) {
      return;
    }

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/trade/tasks?id=${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (res.ok) {
        alert('작업이 삭제되었습니다');
        loadTasks();
      } else {
        const error = await res.json();
        alert(error.error || '작업 삭제 실패');
      }
    } catch (error) {
      console.error('작업 삭제 실패:', error);
      alert('작업 삭제 실패');
    }
  }

  function getTaskStatusText(status) {
    switch (status) {
      case 'buy_pending': return '매수 대기 (Limit Order 전)';
      case 'buy_ordered': return '매수 주문 대기 (Limit Order 대기 중)';
      case 'sell_pending': return '매도 대기 (Limit Order 전)';
      case 'sell_ordered': return '매도 주문 대기 (Limit Order 대기 중)';
      case 'completed': return '완료';
      default: return status;
    }
  }

  function getTaskStatusColor(status) {
    switch (status) {
      case 'buy_pending': return '#2196F3';
      case 'buy_ordered': return '#1976D2';
      case 'sell_pending': return '#FF9800';
      case 'sell_ordered': return '#F57C00';
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
          {/* 보유 금액 및 테더 표시 */}
          <div style={{
            backgroundColor: '#e3f2fd',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>보유 금액</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1976d2' }}>
                {Number(balance.availableMoney || 0).toLocaleString()}원
              </div>
            </div>
            <div style={{ width: '1px', height: '40px', backgroundColor: '#bbb' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>보유 테더</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1976d2' }}>
                {Number(balance.availableUsdt || 0).toFixed(1)} USDT
              </div>
            </div>
          </div>

          {/* 모니터링 정보 */}
          {monitorData && (
            <div style={{
              backgroundColor: '#f5f5f5',
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>📊 실시간 모니터링</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>모듈 상태</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: monitorData.module?.loaded ? '#4CAF50' : '#f44336' }}>
                    {monitorData.module?.loaded ? '✅ 로드됨' : '❌ 미로드'}
                  </div>
                </div>
                <div style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>트레이딩 상태</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: monitorData.trading?.isTrading ? '#4CAF50' : '#999' }}>
                    {monitorData.trading?.isTrading ? '🟢 활성' : '⚪ 비활성'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                <div style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>전체 주문</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{monitorData.orders?.total || 0}</div>
                </div>
                <div style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>매수 대기</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2196F3' }}>{monitorData.orders?.buyWaiting || 0}</div>
                </div>
                <div style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>매도 대기</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#FF9800' }}>{monitorData.orders?.sellWaiting || 0}</div>
                </div>
                <div style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>완료</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4CAF50' }}>{monitorData.orders?.completed || 0}</div>
                </div>
              </div>
              {monitorData.timestamp && (
                <div style={{ fontSize: '11px', color: '#999', marginTop: '10px', textAlign: 'right' }}>
                  마지막 업데이트: {new Date(monitorData.timestamp).toLocaleTimeString('ko-KR')}
                </div>
              )}
            </div>
          )}

          {/* 김치 프리미엄 설정 (항상 표시) */}
          <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>매수 기준 김치 프리미엄</div>
              <input id="buy" type="number" step="0.01" value={config.buy} onChange={(e) => setConfig((prev) => ({ ...prev, buy: e.target.value }))} style={{
                width: '100%',
                padding: '12px',
                marginTop: '5px',
                boxSizing: 'border-box',
                fontSize: '16px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }} placeholder="예: 0.5" />
            </div>
            <div style={{ flex: 1, padding: '15px', backgroundColor: '#fff3e0', borderRadius: '4px' }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>매도 기준 김치 프리미엄</div>
              <input id="sell" type="number" step="0.01" value={config.sell} onChange={(e) => setConfig((prev) => ({ ...prev, sell: e.target.value }))} style={{
                width: '100%',
                padding: '12px',
                marginTop: '5px',
                boxSizing: 'border-box',
                fontSize: '16px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }} placeholder="예: 2.5" />
            </div>
          </div>

          {/* 탭 내용 */}
          <div>
            {/* 테더 매수 탭 */}
            {activeTab === 'buy' && (
              <div id="buyTab">
                <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>매매 방식</div>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    <input type="radio" name="trade-type" value="money" checked={isTradeByMoney} onChange={() => {
                      setIsTradeByMoney(true);
                    }} /> 금액으로 매매
                  </label>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    <input type="radio" name="trade-type" value="volume" checked={!isTradeByMoney} onChange={() => {
                      setIsTradeByMoney(false);
                    }} /> 수량으로 매매
                  </label>
                  <input id="tradeAmount" type="number" step="1" value={config.tradeAmount} onChange={(e) => setConfig((prev) => ({ ...prev, tradeAmount: e.target.value }))} style={{
                    width: '100%',
                    padding: '12px',
                    marginTop: '10px',
                    boxSizing: 'border-box',
                    fontSize: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }} placeholder={isTradeByMoney ? "매수 금액 (원)" : "매수 수량 (USDT)"} />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>현재 보유 금액: {Number(balance.availableMoney || 0).toLocaleString()}원</div>
                  <button onClick={addBuyTask} style={{
                    width: '100%',
                    padding: '12px',
                    marginTop: '15px',
                    fontSize: '16px',
                    backgroundColor: '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}>매수 작업 추가</button>
                </div>
              </div>
            )}

            {/* 테더 매도 탭 */}
            {activeTab === 'sell' && (
              <div id="sellTab">
                <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>매매 방식</div>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    <input type="radio" name="sell-trade-type" value="money" checked={isTradeByMoney} onChange={() => {
                      setIsTradeByMoney(true);
                    }} /> 금액으로 매매
                  </label>
                  <label style={{ display: 'block', marginBottom: '10px' }}>
                    <input type="radio" name="sell-trade-type" value="volume" checked={!isTradeByMoney} onChange={() => {
                      setIsTradeByMoney(false);
                    }} /> 수량으로 매매
                  </label>
                  <input id="sellAmount" type="number" step={isTradeByMoney ? "1" : "0.1"} value={config.sellAmount || ''} onChange={(e) => setConfig((prev) => ({ ...prev, sellAmount: e.target.value }))} style={{
                    width: '100%',
                    padding: '12px',
                    marginTop: '10px',
                    boxSizing: 'border-box',
                    fontSize: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }} placeholder={isTradeByMoney ? "매도 금액 (원)" : "매도 수량 (USDT)"} />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                    {isTradeByMoney ? (
                      <>현재 보유 금액: {Number(balance.availableMoney || 0).toLocaleString()}원</>
                    ) : (
                      <>현재 보유 테더: {Number(balance.availableUsdt || 0).toFixed(1)} USDT</>
                    )}
                  </div>
                  <button onClick={addSellTask} style={{
                    width: '100%',
                    padding: '12px',
                    marginTop: '15px',
                    fontSize: '16px',
                    backgroundColor: '#FF9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}>매도 작업 추가</button>
                </div>
              </div>
            )}
          </div>

          {/* 탭: 테더 매수 / 테더 매도 */}
          <div style={{ marginTop: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button onClick={() => setActiveTab('buy')} style={{
                flex: 1,
                padding: '12px',
                backgroundColor: activeTab === 'buy' ? '#2196F3' : '#e0e0e0',
                color: activeTab === 'buy' ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}>테더 매수</button>
              <button onClick={() => setActiveTab('sell')} style={{
                flex: 1,
                padding: '12px',
                backgroundColor: activeTab === 'sell' ? '#FF9800' : '#e0e0e0',
                color: activeTab === 'sell' ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}>테더 매도</button>
            </div>
          </div>

          {/* 트레이딩 설정 */}
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>트레이딩 설정</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button onClick={() => {
                  const next = { ...config, isTrading: !config.isTrading };
                  setConfig(next);
                  updateConfig(next);
                }} style={{
                  padding: '8px 20px',
                  fontSize: '14px',
                  backgroundColor: config.isTrading ? '#4CAF50' : '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}>{config.isTrading ? 'ON' : 'OFF'}</button>
                <button onClick={confirmReset} style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}>매매 초기화</button>
              </div>
            </div>
          </div>

          {/* 진행 중인 작업 목록 */}
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>📋 진행 중인 작업</h3>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => setTaskTab('tasks')} style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  backgroundColor: taskTab === 'tasks' ? '#2196F3' : '#e0e0e0',
                  color: taskTab === 'tasks' ? 'white' : 'black',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: taskTab === 'tasks' ? 'bold' : 'normal'
                }}>작업 목록</button>
                <button onClick={() => setTaskTab('logs')} style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  backgroundColor: taskTab === 'logs' ? '#2196F3' : '#e0e0e0',
                  color: taskTab === 'logs' ? 'white' : 'black',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: taskTab === 'logs' ? 'bold' : 'normal'
                }}>로그</button>
              </div>
            </div>

            {taskTab === 'tasks' && (
              <>
                {tasks.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    진행 중인 작업이 없습니다
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {tasks.map((task) => (
                      <div key={task.id} style={{
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        padding: '15px',
                        backgroundColor: '#fff',
                        position: 'relative'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div>
                            <strong style={{ color: getTaskStatusColor(task.status) }}>
                              {getTaskStatusText(task.status)}
                            </strong>
                            <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                              ID: {task.id.substring(0, 8)}...
                            </span>
                          </div>
                          {(task.status === 'buy_pending' || task.status === 'sell_pending' || task.status === 'buy_ordered' || task.status === 'sell_ordered') && (
                            <button onClick={() => deleteTask(task.id)} style={{
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
                          {/* 매도 주문 대기 상태일 때는 매도가와 수량만 표시 */}
                          {task.status === 'sell_ordered' && (
                            <>
                              {task.sellPrice && (
                                <div>매도가: {Number(task.sellPrice).toLocaleString()}원</div>
                              )}
                              {task.volume && (
                                <div>수량: {Number(task.volume).toFixed(1)} USDT</div>
                              )}
                            </>
                          )}
                          {/* 매도 주문 대기가 아닌 경우에만 기존 로직 사용 */}
                          {task.status !== 'sell_ordered' && task.type === 'buy' && (
                            <>
                              {task.allocatedAmount && (
                                <div>투자 금액: {Number(task.allocatedAmount).toLocaleString()}원</div>
                              )}
                              {task.buyPrice && (
                                <div>매수가: {Number(task.buyPrice).toLocaleString()}원</div>
                              )}
                              {task.volume && (
                                <div>수량: {Number(task.volume).toFixed(1)} USDT</div>
                              )}
                            </>
                          )}
                          {task.status !== 'sell_ordered' && task.type === 'sell' && (
                            <>
                              {task.volume && (
                                <div>매도 수량: {Number(task.volume).toFixed(1)} USDT</div>
                              )}
                              {task.sellPrice && (
                                <div>매도가: {Number(task.sellPrice).toLocaleString()}원</div>
                              )}
                            </>
                          )}
                          {/* 매수 대기 상태에서 매수 기준 프리미엄 표시 */}
                          {(task.status === 'buy_pending' || task.status === 'buy_ordered') && task.buyThreshold != null && (
                            <div style={{ fontSize: '12px', color: '#2196F3', marginTop: '5px' }}>
                              매수 기준 프리미엄: {Number(task.buyThreshold).toFixed(2)}%
                            </div>
                          )}
                          {/* 매도 대기 상태에서 매도 기준 프리미엄 표시 */}
                          {(task.status === 'sell_pending' || task.status === 'sell_ordered') && task.sellThreshold != null && (
                            <div style={{ fontSize: '12px', color: '#FF9800', marginTop: '5px' }}>
                              매도 기준 프리미엄: {Number(task.sellThreshold).toFixed(2)}%
                            </div>
                          )}
                          {task.buyUuid && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                              매수 UUID: {task.buyUuid.substring(0, 20)}...
                            </div>
                          )}
                          {task.sellUuid && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                              매도 UUID: {task.sellUuid.substring(0, 20)}...
                            </div>
                          )}
                          {task.createdAt && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                              생성: {new Date(task.createdAt).toLocaleString('ko-KR')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {taskTab === 'logs' && (
              <div>
                <pre style={{
                  background: '#fff',
                  padding: '15px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  maxHeight: '400px',
                  overflow: 'auto',
                  fontSize: '12px',
                  fontFamily: 'monospace'
                }}>{logs}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

