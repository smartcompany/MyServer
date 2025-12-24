'use client';

import { useState, useEffect } from 'react';

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

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (mainArea) {
      loadConfig();
      loadTradeLogs();
      loadLogs();
      const logInterval = setInterval(loadLogs, 5000);
      const tradeInterval = setInterval(loadTradeLogs, 5000);
      return () => {
        clearInterval(logInterval);
        clearInterval(tradeInterval);
      };
    }
  }, [mainArea]);

  async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoginArea(true);
      setMainArea(false);
      return;
    }

    try {
      const res = await fetch('/api/trade/auth-check', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.ok) {
        showMain();
      } else {
        showLogin();
      }
    } catch (error) {
      console.error('인증 확인 실패:', error);
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
      const data = await res.json();
      setConfig({
        buy: data.buyThreshold || '',
        sell: data.sellThreshold || '',
        isTrading: data.isTrading || false,
        tradeAmount: data.tradeAmount || '',
        isTradeByMoney: data.isTradeByMoney !== false
      });
    } catch (error) {
      console.error('설정 로드 실패:', error);
    }
  }

  async function updateConfig() {
    const token = localStorage.getItem('token');
    const buy = parseFloat(document.getElementById('buy').value);
    const sell = parseFloat(document.getElementById('sell').value);
    const isTrading = document.getElementById('isTrading').checked;
    const tradeAmount = parseFloat(document.getElementById('tradeAmount').value);
    const tradeType = document.querySelector('input[name="trade-type"]:checked').value;
    const isTradeByMoney = tradeType === 'money';

    try {
      const res = await fetch('/api/trade/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          updates: [
            { key: 'buyThreshold', value: buy },
            { key: 'sellThreshold', value: sell },
            { key: 'isTrading', value: isTrading },
            { key: 'tradeAmount', value: tradeAmount },
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
      const text = await res.text();
      setLogs(text);
    } catch (error) {
      console.error('로그 로드 실패:', error);
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
          매수 기준: <input id="buy" type="number" step="0.01" defaultValue={config.buy} style={{
            width: '100%',
            padding: '12px',
            marginTop: '5px',
            marginBottom: '15px',
            boxSizing: 'border-box',
            fontSize: '16px'
          }} /><br />
          매도 기준: <input id="sell" type="number" step="0.01" defaultValue={config.sell} style={{
            width: '100%',
            padding: '12px',
            marginTop: '5px',
            marginBottom: '15px',
            boxSizing: 'border-box',
            fontSize: '16px'
          }} /><br />
          <label style={{ display: 'block', marginBottom: '10px' }}>
            <input type="radio" name="trade-type" value="money" defaultChecked={config.isTradeByMoney} /> 금액으로 매매
          </label>
          <label style={{ display: 'block', marginBottom: '10px' }}>
            <input type="radio" name="trade-type" value="volume" defaultChecked={!config.isTradeByMoney} /> 수량으로 매매
          </label>
          <input id="tradeAmount" type="number" step="1" defaultValue={config.tradeAmount} style={{
            width: '100%',
            padding: '12px',
            marginTop: '5px',
            marginBottom: '15px',
            boxSizing: 'border-box',
            fontSize: '16px'
          }} /><br />
          <h3 style={{ textAlign: 'center' }}>트레이딩 설정</h3>
          <label style={{ display: 'block', marginBottom: '10px' }}>
            <input id="isTrading" type="checkbox" defaultChecked={config.isTrading} onChange={updateConfig} />
            트레이딩 시작/중지
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
          </div>
        </div>
      )}
    </div>
  );
}

