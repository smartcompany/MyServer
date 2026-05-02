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
    maxBuyExchangeRate: '',
    minSellExchangeRate: '',
    isTrading: false
  });
  const [stopTradingTimes, setStopTradingTimes] = useState([]);
  const [localStopTradingTimes, setLocalStopTradingTimes] = useState([]); // 임시 저장용
  const [tradeAmount, setTradeAmount] = useState(''); // 매수 금액/수량 입력값
  const [sellAmount, setSellAmount] = useState(''); // 매도 금액/수량 입력값
  const [isTradeByMoney, setIsTradeByMoney] = useState(true); // 매매 방식: true=금액, false=수량
  const [logs, setLogs] = useState('불러오는 중...');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [balance, setBalance] = useState({ 
    krwBalance: 0, 
    usdtBalance: 0, 
    availableMoney: 0, 
    availableUsdt: 0 
  });
  const [monitorData, setMonitorData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskTab, setTaskTab] = useState('tasks'); // 'tasks' or 'logs'
  const [currentTime, setCurrentTime] = useState('');
  const [addingBuyTask, setAddingBuyTask] = useState(false);
  const [addingSellTask, setAddingSellTask] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [tetherPrice, setTetherPrice] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (mainArea) {
      loadConfig();
      loadMonitorData();
      const dataInterval = setInterval(() => {
        loadMonitorData();
      }, 1000);
      return () => {
        clearInterval(dataInterval);
      };
    }
  }, [mainArea]);

  // 로그 탭이 보일 때만 1초마다 로그 폴링
  useEffect(() => {
    if (!mainArea) return;
    if (taskTab !== 'logs') return;

    // 탭을 연 직후 한 번 즉시 로드
    loadLogs();
    const logInterval = setInterval(() => {
      loadLogs();
    }, 3000);

    return () => {
      clearInterval(logInterval);
    };
  }, [mainArea, taskTab]);

  // 현재 시간 업데이트 (1초마다)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const koreaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const timeString = koreaTime.toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      });
      setCurrentTime(timeString);
    };
    
    updateTime(); // 즉시 실행
    const timeInterval = setInterval(updateTime, 1000);
    
    return () => {
      clearInterval(timeInterval);
    };
  }, []);

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
        const data = await res.json().catch(() => ({}));
        const msg = res.status === 429
          ? (data.error || '로그인 시도 횟수 초과. 15분 후 다시 시도해주세요.')
          : (data.error || '로그인 실패');
        alert(msg);
      }
    } catch (error) {
      console.error('로그인 실패:', error);
      alert('로그인 실패!');
    }
  }

  function showMain() {
    setLoginArea(false);
    setMainArea(true);
    // 기본 탭은 매수로 설정
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
        maxBuyExchangeRate:
          data.maxBuyExchangeRate != null && data.maxBuyExchangeRate !== ''
            ? String(data.maxBuyExchangeRate)
            : '',
        minSellExchangeRate:
          data.minSellExchangeRate != null && data.minSellExchangeRate !== ''
            ? String(data.minSellExchangeRate)
            : '',
        isTrading: Boolean(data.isTrading)
      });
      setIsTradeByMoney(data.isTradeByMoney ?? true);
      const times = data.stopTradingTimes ?? [];
      setStopTradingTimes(times);
      setLocalStopTradingTimes(times); // 로컬 state도 동기화
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

  async function saveExchangeRateLimits() {
    const token = localStorage.getItem('token');
    if (!configLoaded) {
      alert('설정이 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.');
      return;
    }
    const maxRaw = String(config.maxBuyExchangeRate ?? '').trim();
    const minRaw = String(config.minSellExchangeRate ?? '').trim();
    const maxNum = maxRaw === '' ? null : Number(maxRaw);
    const minNum = minRaw === '' ? null : Number(minRaw);
    if (maxNum != null && (!Number.isFinite(maxNum) || maxNum <= 0)) {
      alert('매수 최대 환율은 비우거나 0보다 큰 숫자로 입력해주세요.');
      return;
    }
    if (minNum != null && (!Number.isFinite(minNum) || minNum <= 0)) {
      alert('매도 최저 환율은 비우거나 0보다 큰 숫자로 입력해주세요.');
      return;
    }
    try {
      const res = await fetch('/api/trade/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          updates: [
            { key: 'maxBuyExchangeRate', value: maxNum },
            { key: 'minSellExchangeRate', value: minNum }
          ]
        })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert('❌ 저장 실패: ' + (errorData.error || 'Unknown error'));
        return;
      }
      alert('✅ 환율 조건이 저장되었습니다. (비운 항목은 조건 없음)');
    } catch (e) {
      alert('❌ 저장 실패: ' + (e.message || '네트워크 오류'));
    }
  }

  async function updateStopTradingTimes(newTimes) {
    const token = localStorage.getItem('token');
    if (!configLoaded) {
      console.warn('설정이 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.');
      alert('설정이 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.');
      return false;
    }

    try {
      const res = await fetch('/api/trade/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          updates: [
            { key: 'stopTradingTimes', value: newTimes }
          ]
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('거래 중지 시간 업데이트 실패:', errorData.error || 'Unknown error');
        alert('❌ 거래 중지 시간 업데이트 실패: ' + (errorData.error || 'Unknown error'));
        // 실패 시 이전 값으로 되돌리기 위해 config 다시 로드
        loadConfig();
        return false;
      } else {
        setStopTradingTimes(newTimes);
        alert('✅ 거래 중지 시간이 성공적으로 적용되었습니다.');
        return true;
      }
    } catch (error) {
      console.error('거래 중지 시간 업데이트 실패:', error);
      alert('❌ 거래 중지 시간 업데이트 실패: ' + error.message);
      loadConfig();
      return false;
    }
  }

  function addStopTradingTime() {
    const newTimes = [...localStopTradingTimes, { start: '00:00:00', end: '00:00:00' }];
    setLocalStopTradingTimes(newTimes);
  }

  function removeStopTradingTime(index) {
    const newTimes = localStopTradingTimes.filter((_, i) => i !== index);
    setLocalStopTradingTimes(newTimes);
  }

  function updateStopTradingTime(index, field, value) {
    const newTimes = [...localStopTradingTimes];
    // HTML time input은 HH:mm 형식이므로 :00 초를 추가하여 HH:mm:ss 형식으로 변환
    const formattedValue = value.length === 5 ? value + ':00' : value;
    newTimes[index] = { ...newTimes[index], [field]: formattedValue };
    setLocalStopTradingTimes(newTimes);
  }

  async function applyStopTradingTimes() {
    const success = await updateStopTradingTimes(localStopTradingTimes);
    if (success) {
      // 성공 시 로컬 state도 동기화
      setLocalStopTradingTimes(localStopTradingTimes);
    }
  }

  // stopTradingTimes의 시간 형식을 HTML time input용으로 변환 (HH:mm:ss -> HH:mm)
  function formatTimeForInput(timeString) {
    if (!timeString) return '00:00';
    return timeString.substring(0, 5); // HH:mm:ss -> HH:mm
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

  async function downloadLogs() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/trade/logs/download', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || '로그 파일 다운로드 실패');
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trade-logs.txt';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('로그 다운로드 실패:', error);
      alert('로그 다운로드 실패');
    }
  }

  async function deleteBackupLogs() {
    if (!confirm('백업 로그를 모두 삭제할까요?')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/trade/logs/backups', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || '백업 로그 삭제 실패');
        return;
      }
      alert(data.message || `백업 로그 ${data.deleted || 0}개를 삭제했습니다.`);
    } catch (error) {
      console.error('백업 로그 삭제 실패:', error);
      alert('백업 로그 삭제 실패');
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
            krwBalance: data.balance.krwBalance || 0,
            usdtBalance: data.balance.usdtBalance || 0,
            availableMoney: data.balance.availableMoney || 0,
            availableUsdt: data.balance.availableUsdt || 0
          });
        }
        // orderState에 저장된 테더 가격을 모니터 API에서 받아와서 상태에 반영
        if (data.orders && typeof data.orders.tetherPrice === 'number') {
          setTetherPrice(data.orders.tetherPrice);
        }
        // 모니터 API에 포함된 작업 목록으로 상태 갱신 (orderState 한 번 읽기로 통합)
        if (Array.isArray(data.tasks)) {
          setTasks(data.tasks);
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
    if (addingBuyTask) return;
    const token = localStorage.getItem('token');
    const buyInput = document.getElementById('buy');
    const sellInput = document.getElementById('sell');
    const tradeAmountInput = document.getElementById('tradeAmount');
    const isTradeByMoneyRadio = document.querySelector('input[name="trade-type"]:checked');
    const amount = tradeAmountInput?.value.replace(/,/g, '');
    
    if (!amount || Number(amount) <= 0) {
      alert('매수 금액/수량을 입력해주세요');
      return;
    }

    if (buyInput?.value === '' || sellInput?.value === '') {
      alert('매수 기준 김치 프리미엄 또는 매도 기준 김치 프리미엄을 입력해주세요');
      return;
    }

    if (isTradeByMoneyRadio?.value === 'money' && (tetherPrice == null || Number(tetherPrice) <= 0)) {
      alert('테더 가격을 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setAddingBuyTask(true);

    // 작업 추가
    try {
      const isTradeByMoney = isTradeByMoneyRadio?.value === 'money';
      const buyThreshold = Number(buyInput?.value);
      const sellThreshold = Number(sellInput?.value);

      console.log('[trade] addBuyTask: 요청 시작', {
        amount: Number(amount),
        buyThreshold,
        sellThreshold,
        isTradeByMoney,
      });

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
          isTradeByMoney: isTradeByMoney,
          tetherPrice: tetherPrice
        })
      });

      if (res.ok) {
        const data = await res.json();
        console.log('[trade] addBuyTask: 성공', data);
        alert(data.message || '매수 작업이 추가되었습니다');
        // 서버 상태 기준으로 작업 목록 재로딩
        await loadTasks();
      } else {
        const error = await res.json();
        console.error('[trade] addBuyTask: 실패 응답', res.status, error);
        alert(error.error || '매수 작업 추가 실패');
      }
    } catch (error) {
      console.error('매수 작업 추가 실패:', error);
      alert('매수 작업 추가 실패');
    } finally {
      setAddingBuyTask(false);
    }
  }

  async function addSellTask() {
    if (addingSellTask) return;
    const token = localStorage.getItem('token');
    const buyInput = document.getElementById('buy');
    const sellInput = document.getElementById('sell');
    const sellAmountInput = document.getElementById('sellAmount');
    const amount = sellAmountInput?.value.replace(/,/g, '');
    
    if (!amount || Number(amount) <= 0) {
      alert('매도 금액/수량을 입력해주세요');
      return;
    }
    
    if (buyInput?.value === '' || sellInput?.value === '') {
      alert('매수 기준 김치 프리미엄 또는 매도 기준 김치 프리미엄을 입력해주세요');
      return;
    }
    
    if (isTradeByMoney && (tetherPrice == null || Number(tetherPrice) <= 0)) {
      alert('테더 가격을 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    
    setAddingSellTask(true);

    // 작업 추가
    try {
      const sellThreshold = Number(sellInput?.value);
      const buyThreshold = Number(buyInput?.value);

      console.log('[trade] addSellTask: 요청 시작', {
        amount: Number(amount),
        buyThreshold,
        sellThreshold,
        isTradeByMoney,
      });

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
          isTradeByMoney: isTradeByMoney, // 매도 방식 전달
          tetherPrice: tetherPrice
        })
      });

      if (res.ok) {
        const data = await res.json();
        console.log('[trade] addSellTask: 성공', data);
        alert(data.message || '매도 작업이 추가되었습니다');
        // 서버 상태 기준으로 작업 목록 재로딩
        await loadTasks();
      } else {
        const error = await res.json();
        console.error('[trade] addSellTask: 실패 응답', res.status, error);
        alert(error.error || '매도 작업 추가 실패');
      }
    } catch (error) {
      console.error('매도 작업 추가 실패:', error);
      alert('매도 작업 추가 실패');
    } finally {
      setAddingSellTask(false);
    }
  }

  async function deleteTask(taskId) {
    if (!confirm('이 작업을 삭제하시겠습니까?')) {
      return;
    }

    setDeletingTaskId(taskId);

    const token = localStorage.getItem('token');
    try {
      console.log('[trade] deleteTask: 요청 시작', { taskId });

      const res = await fetch(`/api/trade/tasks?id=${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        console.log('[trade] deleteTask: 성공', data);
        alert(data.message || '작업이 삭제되었습니다');
        // 삭제 성공 후 최신 작업 목록 재로딩
        await loadTasks();
      } else {
        console.error('[trade] deleteTask: 실패 응답', res.status, data);
        alert(data.error || '작업 삭제 실패');
      }
    } catch (error) {
      console.error('작업 삭제 실패:', error);
      alert('작업 삭제 실패');
    } finally {
      setDeletingTaskId(null);
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
            marginBottom: '20px'
          }}>
            {/* 첫 번째 줄: 보유 금액, 보유 테더 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              marginBottom: '15px'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>보유 금액</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1976d2' }}>
                  {Number(balance.krwBalance || 0).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}원
                </div>
              </div>
              <div style={{ width: '1px', height: '40px', backgroundColor: '#bbb' }}></div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>보유 테더</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1976d2' }}>
                  {Number(balance.usdtBalance || 0).toFixed(1)} USDT
                </div>
              </div>
            </div>
            {/* 두 번째 줄: 주문 가능 현금, 주문 가능 테더 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>주문 가능 현금</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1976d2' }}>
                  {Number(balance.availableMoney || 0).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}원
                </div>
              </div>
              <div style={{ width: '1px', height: '40px', backgroundColor: '#bbb' }}></div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>주문 가능 테더</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1976d2' }}>
                  {Number(balance.availableUsdt || 0).toFixed(1)} USDT
                </div>
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

          <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1, padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>매수 최대 환율 (USD/KRW)</div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                  현재 환율이 이 값 이상이면 매수 주문을 넣지 않습니다. 비우면 사용 안 함.
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={config.maxBuyExchangeRate}
                  onChange={(e) => setConfig((prev) => ({ ...prev, maxBuyExchangeRate: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginTop: '5px',
                    boxSizing: 'border-box',
                    fontSize: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                  placeholder="예: 1500"
                />
              </div>
              <div style={{ flex: 1, padding: '15px', backgroundColor: '#fff3e0', borderRadius: '4px' }}>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>매도 최저 환율 (USD/KRW)</div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                  현재 환율이 이 값 이하면 매도 주문을 넣지 않습니다. 비우면 사용 안 함.
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={config.minSellExchangeRate}
                  onChange={(e) => setConfig((prev) => ({ ...prev, minSellExchangeRate: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginTop: '5px',
                    boxSizing: 'border-box',
                    fontSize: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                  placeholder="예: 1300"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={saveExchangeRateLimits}
              style={{
                alignSelf: 'flex-start',
                padding: '8px 16px',
                fontSize: '14px',
                backgroundColor: '#607d8b',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              환율 조건 저장
            </button>
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
                  <input id="tradeAmount" type="text" inputMode="decimal" value={tradeAmount ? (() => {
                    const str = String(tradeAmount);
                    if (!str) return '';
                    // 소숫점이 있으면 그대로 유지
                    if (str.includes('.')) {
                      const parts = str.split('.');
                      const intPart = parts[0] ? Number(parts[0]).toLocaleString() : '';
                      return intPart + '.' + (parts[1] || '');
                    }
                    return Number(str).toLocaleString();
                  })() : ''} onChange={(e) => {
                    let value = e.target.value.replace(/,/g, '');
                    // 소숫점은 하나만 허용
                    const dotCount = (value.match(/\./g) || []).length;
                    if (dotCount > 1) {
                      const firstDot = value.indexOf('.');
                      value = value.substring(0, firstDot + 1) + value.substring(firstDot + 1).replace(/\./g, '');
                    }
                    // 숫자, 소숫점, 빈 문자열만 허용 (정규식으로 검증)
                    // 허용 패턴: 빈 문자열, 숫자만, 숫자+소숫점, 숫자+소숫점+숫자, 소숫점만, 소숫점+숫자
                    if (value === '' || /^(\d+\.?\d*|\.\d*)$/.test(value)) {
                      setTradeAmount(value);
                    }
                  }} onBlur={(e) => {
                    let value = e.target.value.replace(/,/g, '');
                    // 마지막이 .으로 끝나면 제거
                    if (value.endsWith('.')) {
                      value = value.slice(0, -1);
                    }
                    if (value && !isNaN(value) && Number(value) >= 0) {
                      setTradeAmount(value);
                    }
                  }} style={{
                    width: '100%',
                    padding: '12px',
                    marginTop: '10px',
                    boxSizing: 'border-box',
                    fontSize: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }} placeholder={isTradeByMoney ? "매수 금액 (원)" : "매수 수량 (USDT)"} />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>현재 보유 금액: {Number(balance.availableMoney || 0).toLocaleString()}원</div>
                  <button onClick={addBuyTask} disabled={addingBuyTask} style={{
                    width: '100%',
                    padding: '12px',
                    marginTop: '15px',
                    fontSize: '16px',
                    backgroundColor: addingBuyTask ? '#90CAF9' : '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: addingBuyTask ? 'default' : 'pointer',
                    fontWeight: 'bold'
                  }}>{addingBuyTask ? '매수 작업 추가 중...' : '매수 작업 추가'}</button>
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
                  <input id="sellAmount" type="text" inputMode="decimal" value={sellAmount ? (() => {
                    const str = String(sellAmount);
                    if (!str) return '';
                    // 소숫점이 있으면 그대로 유지
                    if (str.includes('.')) {
                      const parts = str.split('.');
                      const intPart = parts[0] ? Number(parts[0]).toLocaleString() : '';
                      return intPart + '.' + (parts[1] || '');
                    }
                    return isTradeByMoney ? Number(str).toLocaleString() : Number(str).toLocaleString('ko-KR', { maximumFractionDigits: 8 });
                  })() : ''} onChange={(e) => {
                    let value = e.target.value.replace(/,/g, '');
                    // 소숫점은 하나만 허용
                    const dotCount = (value.match(/\./g) || []).length;
                    if (dotCount > 1) {
                      const firstDot = value.indexOf('.');
                      value = value.substring(0, firstDot + 1) + value.substring(firstDot + 1).replace(/\./g, '');
                    }
                    // 숫자, 소숫점, 빈 문자열만 허용 (정규식으로 검증)
                    // 허용 패턴: 빈 문자열, 숫자만, 숫자+소숫점, 숫자+소숫점+숫자, 소숫점만, 소숫점+숫자
                    if (value === '' || /^(\d+\.?\d*|\.\d*)$/.test(value)) {
                      setSellAmount(value);
                    }
                  }} onBlur={(e) => {
                    let value = e.target.value.replace(/,/g, '');
                    // 마지막이 .으로 끝나면 제거
                    if (value.endsWith('.')) {
                      value = value.slice(0, -1);
                    }
                    if (value && !isNaN(value) && Number(value) >= 0) {
                      setSellAmount(value);
                    }
                  }} style={{
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
                  <button onClick={addSellTask} disabled={addingSellTask} style={{
                    width: '100%',
                    padding: '12px',
                    marginTop: '15px',
                    fontSize: '16px',
                    backgroundColor: addingSellTask ? '#FFCC80' : '#FF9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: addingSellTask ? 'default' : 'pointer',
                    fontWeight: 'bold'
                  }}>{addingSellTask ? '매도 작업 추가 중...' : '매도 작업 추가'}</button>
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

          {/* 거래 중지 시간 설정 */}
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3e0', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0 }}>⏰ 거래 중지 시간 설정</h3>
                {currentTime && (
                  <span style={{ 
                    fontSize: '14px', 
                    color: '#666', 
                    fontWeight: 'normal',
                    padding: '4px 8px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px'
                  }}>
                    현재 시간: {currentTime}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={addStopTradingTime} style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}>+ 추가</button>
              </div>
            </div>
            {localStopTradingTimes.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                거래 중지 시간이 설정되지 않았습니다.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {localStopTradingTimes.map((timeRange, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '10px',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    border: '1px solid #ddd'
                  }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', color: '#666' }}>시작 시간</label>
                      <input
                        type="time"
                        value={formatTimeForInput(timeRange.start)}
                        onChange={(e) => updateStopTradingTime(index, 'start', e.target.value)}
                        style={{
                          padding: '8px',
                          fontSize: '14px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          width: '100%'
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '20px', color: '#999', marginTop: '20px' }}>~</div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', color: '#666' }}>종료 시간</label>
                      <input
                        type="time"
                        value={formatTimeForInput(timeRange.end)}
                        onChange={(e) => updateStopTradingTime(index, 'end', e.target.value)}
                        style={{
                          padding: '8px',
                          fontSize: '14px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          width: '100%'
                        }}
                      />
                    </div>
                    <button
                      onClick={() => removeStopTradingTime(index)}
                      style={{
                        padding: '8px 12px',
                        fontSize: '14px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        marginTop: '20px'
                      }}
                    >삭제</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={applyStopTradingTimes}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              >✅ 적용</button>
            </div>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
              💡 설정된 시간대에는 모든 활성 주문이 취소되고 거래가 중지됩니다.
            </div>
          </div>

          {/* 진행 중인 작업 목록 */}
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>📋 진행 중인 작업</h3>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => {
                  setTaskTab('tasks');
                  // 작업 목록 탭을 눌렀을 때 최신 작업 목록 로딩
                  loadTasks();
                }} style={{
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
                            <button
                              onClick={() => deleteTask(task.id)}
                              disabled={deletingTaskId === task.id}
                              style={{
                                backgroundColor: deletingTaskId === task.id ? '#ef9a9a' : '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '5px 10px',
                                cursor: deletingTaskId === task.id ? 'default' : 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              {deletingTaskId === task.id ? '삭제 중...' : '삭제'}
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                          {/* 매도 주문 대기 상태일 때는 매도가와 수량만 표시 */}
                          {task.status === 'sell_ordered' && (
                            <>
                              {task.price && (
                                <div>매도가: {Number(task.price).toLocaleString()}원</div>
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
                              {task.price && (
                                <div>매수가: {Number(task.price).toLocaleString()}원</div>
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
                              {task.price && (
                                <div>매도가: {Number(task.price).toLocaleString()}원</div>
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
                          {task.uuid && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                              {task.status === 'buy_ordered' ? '매수' : '매도'} UUID: {task.uuid.substring(0, 20)}...
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '10px' }}>
                  <button onClick={downloadLogs} style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    📥 다운로드
                  </button>
                  <button onClick={deleteBackupLogs} style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    🗑️ 백업 삭제
                  </button>
                </div>
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

