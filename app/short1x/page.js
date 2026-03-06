'use client';

import { useState, useEffect } from 'react';
import { isTokenValid } from '../trade/utils';

export default function Short1xPage() {
  const [loginArea, setLoginArea] = useState(true);
  const [qty, setQty] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text }
  const [xrpBalance, setXrpBalance] = useState(null); // '로딩중' | { xrp, xrpEquity } | null
  const [upbitInfo, setUpbitInfo] = useState(null);   // '로딩중' | { upbitXrpBalance, upbitXrpBuyOrderKrw } | null

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && isTokenValid(token)) {
      setLoginArea(false);
    } else if (token) {
      localStorage.removeItem('token');
    }
  }, []);

  useEffect(() => {
    if (loginArea) return;
    setXrpBalance('로딩중');
    setUpbitInfo('로딩중');
    const token = localStorage.getItem('token');
    fetch('/api/short1x/balance', { headers: { 'Authorization': 'Bearer ' + token } })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setXrpBalance(null);
        else setXrpBalance({ xrp: data.xrp, xrpEquity: data.xrpEquity });
      })
      .catch(() => setXrpBalance(null));
    fetch('/api/short1x/upbit-info', { headers: { 'Authorization': 'Bearer ' + token } })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setUpbitInfo(null);
        else setUpbitInfo({ upbitXrpBalance: data.upbitXrpBalance, upbitXrpBuyOrderKrw: data.upbitXrpBuyOrderKrw });
      })
      .catch(() => setUpbitInfo(null));
  }, [loginArea]);

  async function login(e) {
    e.preventDefault();
    const id = document.getElementById('short1x-id').value;
    const pw = document.getElementById('short1x-pw').value;
    try {
      const res = await fetch('/api/trade/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: pw })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.token);
        setLoginArea(false);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: '로그인 실패' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '로그인 실패' });
    }
  }

  function logout() {
    localStorage.removeItem('token');
    setLoginArea(true);
    setQty('');
    setMessage(null);
    setXrpBalance(null);
    setUpbitInfo(null);
  }

  async function placeShortOrder(e) {
    e.preventDefault();
    const trimQty = (qty || '').trim();
    if (!trimQty || Number(trimQty) <= 0) {
      setMessage({ type: 'error', text: 'XRP 수량을 입력해주세요.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/short1x/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ qty: trimQty })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '주문 실패' });
        return;
      }
      setMessage({
        type: 'success',
        text: data.message + (data.orderId ? ` (주문 ID: ${data.orderId})` : '')
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || '주문 요청 실패' });
    } finally {
      setLoading(false);
    }
  }

  if (loginArea) {
    return (
      <div style={{ fontFamily: 'sans-serif', maxWidth: 400, margin: '40px auto', padding: 24 }}>
        <h1 style={{ marginBottom: 8 }}>1x Short (XRP)</h1>
        <p style={{ color: '#666', marginBottom: 24 }}>
          로그인 후 XRPUSDT 1배 숏 주문을 Post-Only로 넣을 수 있습니다.
        </p>
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            id="short1x-id"
            type="text"
            placeholder="아이디"
            required
            style={{ padding: 10, fontSize: 16 }}
          />
          <input
            id="short1x-pw"
            type="password"
            placeholder="비밀번호"
            required
            style={{ padding: 10, fontSize: 16 }}
          />
          <button type="submit" style={{ padding: 12, backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            로그인
          </button>
        </form>
        {message && (
          <p style={{ color: message.type === 'error' ? '#c62828' : '#2e7d32', marginTop: 12 }}>
            {message.text}
          </p>
        )}
        <p style={{ marginTop: 24 }}>
          <a href="/">홈으로</a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 480, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>XRP 1x Short (Post-Only)</h1>
        <button
          type="button"
          onClick={logout}
          style={{ padding: '8px 16px', backgroundColor: '#666', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          로그아웃
        </button>
      </div>
      <p style={{ color: '#666', marginBottom: 24 }}>
        XRPUSDT 선물에 <strong>1배 레버리지</strong>로 숏 포지션을 엽니다. 시장가가 아닌 <strong>Post-Only</strong> 리밋 주문으로 수수료를 최소화합니다.
      </p>
      {upbitInfo === '로딩중' && <p style={{ color: '#666', marginBottom: 8 }}>업비트 정보 조회 중...</p>}
      {upbitInfo && upbitInfo !== '로딩중' && (
        <div style={{ marginBottom: 24, padding: '12px 16px', backgroundColor: '#e3f2fd', borderRadius: 8 }}>
          <p style={{ margin: '0 0 6px 0' }}>
            <strong>업비트 보유 XRP:</strong>{' '}
            {Number(upbitInfo.upbitXrpBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP
          </p>
          <p style={{ margin: 0 }}>
            <strong>업비트 XRP 지정가 매수 주문 금액:</strong>{' '}
            {Number(upbitInfo.upbitXrpBuyOrderKrw).toLocaleString()}원
            <span style={{ color: '#666', fontSize: '0.9em' }}> (기준)</span>
          </p>
        </div>
      )}
      {xrpBalance === '로딩중' && <p style={{ color: '#666', marginBottom: 16 }}>Bybit 보유 XRP 조회 중...</p>}
      {xrpBalance && xrpBalance !== '로딩중' && (
        <p style={{ marginBottom: 24, padding: '12px 16px', backgroundColor: '#f5f5f5', borderRadius: 8 }}>
          <strong>보유 XRP (Bybit UNIFIED):</strong>{' '}
          {Number(xrpBalance.xrp).toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP
        </p>
      )}
      <form onSubmit={placeShortOrder} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ fontWeight: 'bold' }}>
          XRP 수량
          <input
            type="text"
            inputMode="decimal"
            placeholder="예: 100"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            style={{ display: 'block', marginTop: 6, padding: 12, fontSize: 18, width: '100%', boxSizing: 'border-box' }}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 14,
            backgroundColor: loading ? '#999' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 16,
            fontWeight: 'bold'
          }}
        >
          {loading ? '주문 중...' : '1x Short 주문 (Post-Only)'}
        </button>
      </form>
      {message && (
        <p style={{ color: message.type === 'error' ? '#c62828' : '#2e7d32', marginTop: 16 }}>
          {message.text}
        </p>
      )}
      <p style={{ marginTop: 32 }}>
        <a href="/">홈으로</a> · <a href="/trade">거래 설정</a>
      </p>
    </div>
  );
}
