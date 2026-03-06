'use client';

import { useState, useEffect } from 'react';
import { isTokenValid } from '../trade/utils';

function formatNumberInput(value) {
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return '';
  const num = Number(digits);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString();
}

function mapUpbitInfo(data) {
  return {
    upbitXrpBalance: data.upbitXrpBalance,
    upbitKrwBalance: data.upbitKrwBalance,
    upbitXrpBuyOrderKrw: data.upbitXrpBuyOrderKrw,
    xrpPrice: data.xrpPrice,
    usdKrwRate: data.usdKrwRate,
    usdtKrwPrice: data.usdtKrwPrice,
    bybitXrpUsdPrice: data.bybitXrpUsdPrice,
    kimchiPremium: data.kimchiPremium,
    accountError: data.accountError,
    ordersError: data.ordersError,
    priceError: data.priceError,
    kimchiError: data.kimchiError,
  };
}

export default function Short1xPage() {
  const [loginArea, setLoginArea] = useState(true);
  const [qty, setQty] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text }
  const [xrpBalance, setXrpBalance] = useState(null); // '로딩중' | { xrp, xrpEquity } | null
  const [upbitInfo, setUpbitInfo] = useState(null);   // '로딩중' | { upbitXrpBalance, upbitXrpBuyOrderKrw } | null
  const [upbitPrice, setUpbitPrice] = useState('');
  const [upbitVolume, setUpbitVolume] = useState('');
  const [upbitOrderLoading, setUpbitOrderLoading] = useState(false);
  const [withdrawAddresses, setWithdrawAddresses] = useState([]);
  const [withdrawAddressValue, setWithdrawAddressValue] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddressesError, setWithdrawAddressesError] = useState(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

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

    let cancelled = false;

    const fetchInfos = () => {
      const token = localStorage.getItem('token');
      if (!token || cancelled) return;

      fetch('/api/short1x/balance', { headers: { Authorization: 'Bearer ' + token } })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) setXrpBalance(null);
          else setXrpBalance({ xrp: data.xrp, xrpEquity: data.xrpEquity });
        })
        .catch(() => {
          if (!cancelled) setXrpBalance(null);
        });

      fetch('/api/short1x/upbit-info', { headers: { Authorization: 'Bearer ' + token } })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) {
            setUpbitInfo({ accountError: data.error });
          } else {
            setUpbitInfo(mapUpbitInfo(data));
          }
        })
        .catch(() => {
          if (!cancelled) setUpbitInfo({ accountError: '업비트 정보 조회 실패' });
        });
    };

    fetchInfos();
    const id = setInterval(fetchInfos, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loginArea]);

  useEffect(() => {
    if (loginArea) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    setWithdrawAddressesError(null);
    fetch('/api/short1x/upbit-withdraw-addresses', {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setWithdrawAddresses([]);
          setWithdrawAddressesError(data.error);
          return;
        }
        const list = Array.isArray(data.addresses) ? data.addresses : [];
        setWithdrawAddresses(list);
        if (list.length > 0) {
          const defaultValue = `${list[0].withdraw_address}||${list[0].secondary_address || ''}||${list[0].net_type}`;
          setWithdrawAddressValue(defaultValue);
        } else {
          setWithdrawAddressValue('');
        }
      })
      .catch(() => {
        setWithdrawAddresses([]);
        setWithdrawAddressesError('출금 주소를 불러오지 못했습니다.');
      });
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
    setWithdrawAddresses([]);
    setWithdrawAddressValue('');
    setWithdrawAmount('');
    setWithdrawAddressesError(null);
  }

  async function placeUpbitBuyOrder(e) {
    e.preventDefault();
    const price = Number(String(upbitPrice).replace(/,/g, ''));
    const totalKrw = Number(String(upbitVolume).replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(totalKrw) || totalKrw <= 0) {
      setMessage({ type: 'error', text: '지정가(원)와 총 주문 금액(원)을 올바르게 입력해주세요.' });
      return;
    }
    const volume = Math.floor((totalKrw / price) * 1000) / 1000; // 소수점 3자리까지
    if (!Number.isFinite(volume) || volume <= 0) {
      setMessage({ type: 'error', text: '계산된 수량이 올바르지 않습니다.' });
      return;
    }
    setUpbitOrderLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/short1x/upbit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ price, volume }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '업비트 주문 실패' });
        return;
      }
      setMessage({ type: 'success', text: data.message || '주문 접수됨' });
      setUpbitPrice('');
      setUpbitVolume('');
      fetch('/api/short1x/upbit-info', { headers: { Authorization: 'Bearer ' + token } })
        .then((r) => r.json())
        .then((d) => {
          if (d.error) setUpbitInfo({ accountError: d.error });
          else setUpbitInfo(mapUpbitInfo(d));
        })
        .catch(() => setUpbitInfo({ accountError: '업비트 정보 조회 실패' }));
    } catch (err) {
      setMessage({ type: 'error', text: err.message || '주문 요청 실패' });
    } finally {
      setUpbitOrderLoading(false);
    }
  }

  async function withdrawUpbitXrp(e) {
    e.preventDefault();
    const amount = Number(String(withdrawAmount).replace(/,/g, ''));
    if (!withdrawAddressValue) {
      setMessage({ type: 'error', text: '출금 주소를 선택해주세요.' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage({ type: 'error', text: '출금 수량(XRP)을 입력해주세요.' });
      return;
    }

    const [address, secondaryAddress, netType] = withdrawAddressValue.split('||');
    setWithdrawLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/short1x/upbit-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          amount,
          address,
          secondaryAddress,
          netType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error || '업비트 XRP 출금 실패';
        setMessage({ type: 'error', text: errMsg });
        alert(errMsg);
        return;
      }
      setMessage({ type: 'success', text: data.message || '업비트 XRP 출금 요청이 접수되었습니다.' });
      setWithdrawAmount('');
    } catch (err) {
      const errMsg = err.message || '업비트 XRP 출금 실패';
      setMessage({ type: 'error', text: errMsg });
      alert(errMsg);
    } finally {
      setWithdrawLoading(false);
    }
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
      {/* Upbit 영역 */}
      <div style={{ marginBottom: 24, padding: '12px 16px', backgroundColor: '#e3f2fd', borderRadius: 8 }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 'bold' }}>Upbit 영역</h2>
        {upbitInfo === '로딩중' && (
          <p style={{ color: '#666', margin: '0 0 8px 0' }}>업비트 정보 조회 중...</p>
        )}
        {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.accountError && (
          <p style={{ color: '#c62828', margin: '0 0 4px 0' }}>
            {upbitInfo.accountError}
          </p>
        )}
        {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.ordersError && (
          <p style={{ color: '#c62828', margin: '0 0 4px 0' }}>
            {upbitInfo.ordersError}
          </p>
        )}
        {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.priceError && (
          <p style={{ color: '#c62828', margin: '0 0 8px 0' }}>
            {upbitInfo.priceError}
          </p>
        )}
        {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.kimchiError && (
          <p style={{ color: '#c62828', margin: '0 0 8px 0' }}>
            {upbitInfo.kimchiError}
          </p>
        )}

        <p style={{ margin: '0 0 4px 0' }}>
          <strong>업비트 현금 잔고 (KRW):</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.upbitKrwBalance != null
            ? `${Number(upbitInfo.upbitKrwBalance).toLocaleString()}원`
            : '알 수 없음'}
        </p>
        <p style={{ margin: '0 0 4px 0' }}>
          <strong>업비트 보유 XRP:</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.upbitXrpBalance != null
            ? `${Number(upbitInfo.upbitXrpBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP`
            : '알 수 없음'}
        </p>
        <p style={{ margin: '0 0 4px 0' }}>
          <strong>현재 XRP 가격:</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.xrpPrice != null
            ? `${Number(upbitInfo.xrpPrice).toLocaleString()}원`
            : '알 수 없음'}
        </p>
        <p style={{ margin: '0 0 4px 0' }}>
          <strong>업비트 XRP 지정가 매수 주문 금액:</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.upbitXrpBuyOrderKrw != null
            ? `${Number(upbitInfo.upbitXrpBuyOrderKrw).toLocaleString()}원`
            : '알 수 없음'}
          <span style={{ color: '#666', fontSize: '0.9em' }}> (기준)</span>
        </p>
        <p style={{ margin: '0 0 4px 0' }}>
          <strong>환율 (USD/KRW):</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.usdKrwRate != null
            ? `${Number(upbitInfo.usdKrwRate).toFixed(1)}원`
            : '알 수 없음'}
        </p>
        <p style={{ margin: '0 0 4px 0' }}>
          <strong>Upbit USDT 가격 (USDT/KRW):</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.usdtKrwPrice != null
            ? `${Number(upbitInfo.usdtKrwPrice).toFixed(1)}원`
            : '알 수 없음'}
        </p>
        <p style={{ margin: '0 0 12px 0' }}>
          <strong>김치 프리미엄 (XRP):</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.kimchiPremium != null
            ? `${upbitInfo.kimchiPremium.toFixed(2)}%`
            : '알 수 없음'}
        </p>
        <form onSubmit={placeUpbitBuyOrder} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#555' }}>지정가(원)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="예: 1,000"
              value={upbitPrice}
              onChange={(e) => setUpbitPrice(formatNumberInput(e.target.value))}
              style={{ width: 120, padding: '6px 8px' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#555' }}>총 주문 금액(원)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="예: 30,000,000"
              value={upbitVolume}
              onChange={(e) => setUpbitVolume(formatNumberInput(e.target.value))}
              style={{ width: 140, padding: '6px 8px' }}
            />
          </label>
          <button
            type="submit"
            disabled={upbitOrderLoading}
            style={{
              padding: '8px 14px',
              backgroundColor: upbitOrderLoading ? '#999' : '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: upbitOrderLoading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            {upbitOrderLoading ? '주문 중...' : '매수 주문'}
          </button>
        </form>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>XRP 출금</p>
          {withdrawAddressesError && (
            <p style={{ color: '#c62828', margin: '0 0 8px 0' }}>{withdrawAddressesError}</p>
          )}
          <form onSubmit={withdrawUpbitXrp} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 240 }}>
              <span style={{ fontSize: 12, color: '#555' }}>출금 주소 선택</span>
              <select
                value={withdrawAddressValue}
                onChange={(e) => setWithdrawAddressValue(e.target.value)}
                style={{ padding: '8px 10px' }}
              >
                {withdrawAddresses.length === 0 && (
                  <option value="">등록된 XRP 출금 주소 없음</option>
                )}
                {withdrawAddresses.map((item) => {
                  const value = `${item.withdraw_address}||${item.secondary_address || ''}||${item.net_type}`;
                  const label = `${item.exchange_name || item.wallet_type || item.beneficiary_name || '등록 주소'} / ${item.net_type}${item.secondary_address ? ` / 태그 ${item.secondary_address}` : ''}`;
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#555' }}>출금 수량(XRP)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="예: 100"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(formatNumberInput(e.target.value))}
                style={{ width: 120, padding: '8px 10px' }}
              />
            </label>
            <button
              type="submit"
              disabled={withdrawLoading || withdrawAddresses.length === 0}
              style={{
                padding: '8px 14px',
                backgroundColor: withdrawLoading || withdrawAddresses.length === 0 ? '#999' : '#6a1b9a',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: withdrawLoading || withdrawAddresses.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              {withdrawLoading ? '출금 중...' : 'XRP 출금'}
            </button>
          </form>
        </div>
      </div>

      {/* Bybit 영역 */}
      <div style={{ marginBottom: 24, padding: '12px 16px', backgroundColor: '#f5f5f5', borderRadius: 8 }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 'bold' }}>Bybit 영역</h2>
        <p style={{ color: '#666', marginBottom: 16 }}>
          XRPUSDT 선물에 <strong>1배 레버리지</strong>로 숏 포지션을 엽니다. 시장가가 아닌 <strong>Post-Only</strong>{' '}
          리밋 주문으로 수수료를 최소화합니다.
        </p>
        <p style={{ margin: '0 0 8px 0' }}>
          <strong>현재 Bybit XRPUSDT:</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.bybitXrpUsdPrice != null
            ? `${Number(upbitInfo.bybitXrpUsdPrice).toFixed(4)} USDT` +
              (upbitInfo.usdtKrwPrice != null
                ? ` (~${Math.round(
                    Number(upbitInfo.bybitXrpUsdPrice) * Number(upbitInfo.usdtKrwPrice)
                  ).toLocaleString()}원)`
                : '')
            : '알 수 없음'}
        </p>
        {xrpBalance === '로딩중' && <p style={{ color: '#666', marginBottom: 16 }}>Bybit 보유 XRP 조회 중...</p>}
        {xrpBalance && xrpBalance !== '로딩중' && (
          <p style={{ marginBottom: 16, padding: '8px 12px', backgroundColor: '#fff', borderRadius: 6 }}>
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
      </div>
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
