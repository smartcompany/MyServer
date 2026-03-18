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

function formatDecimalInput(value) {
  const s = String(value).replace(/[^\d.]/g, '');
  const parts = s.split('.');
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
  return s;
}

function mapUpbitInfo(data) {
  return {
    upbitXrpBalance: data.upbitXrpBalance,
    upbitKrwBalance: data.upbitKrwBalance,
    upbitUsdtBalance: data.upbitUsdtBalance,
    upbitXrpBuyOrderKrw: data.upbitXrpBuyOrderKrw,
    upbitUsdtBuyOrderKrw: data.upbitUsdtBuyOrderKrw,
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
  const [shortPrice, setShortPrice] = useState(''); // Bybit 지정가 (USDT)
  const [shortPct, setShortPct] = useState(100);    // Bybit 사용 비율 (0~100%)
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text }
  const [xrpBalance, setXrpBalance] = useState(null); // '로딩중' | { xrp, xrpEquity } | null
  const [bybitPosition, setBybitPosition] = useState(null); // '로딩중' | { size, side, avgPrice, positionMargin } | null
  const [upbitInfo, setUpbitInfo] = useState(null);   // '로딩중' | { upbitXrpBalance, upbitXrpBuyOrderKrw } | null
  const [upbitPrice, setUpbitPrice] = useState('');
  const [upbitVolume, setUpbitVolume] = useState('');
  const [upbitOrderLoading, setUpbitOrderLoading] = useState(false);
  const [upbitSellPrice, setUpbitSellPrice] = useState('');
  const [upbitSellVolume, setUpbitSellVolume] = useState('');
  const [upbitSellOrderLoading, setUpbitSellOrderLoading] = useState(false);
  const [upbitSpotAsset, setUpbitSpotAsset] = useState('XRP'); // 'XRP' | 'USDT'
  const [withdrawAddresses, setWithdrawAddresses] = useState([]);
  const [withdrawAddressValue, setWithdrawAddressValue] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddressesError, setWithdrawAddressesError] = useState(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawAsset, setWithdrawAsset] = useState('XRP'); // 'XRP' | 'USDT'
  const [bybitWithdrawAmount, setBybitWithdrawAmount] = useState('');
  const [bybitWithdrawLoading, setBybitWithdrawLoading] = useState(false);
  const [upbitDepositAddresses, setUpbitDepositAddresses] = useState([]); // 업비트 입금 주소 (XRP/USDT)
  const [upbitDepositAddressesError, setUpbitDepositAddressesError] = useState(null);
  const [bybitWithdrawAsset, setBybitWithdrawAsset] = useState('XRP'); // 'XRP' | 'USDT'
  const [bybitWithdrawDepositValue, setBybitWithdrawDepositValue] = useState(''); // 선택한 입금 주소 "address||tag"
  const [lastOrderId, setLastOrderId] = useState(null); // 마지막 주문 ID (상태 확인용)
  const [orderStatusLoading, setOrderStatusLoading] = useState(false);
  const [bybitSymbol, setBybitSymbol] = useState('XRPUSD'); // 'XRPUSD' | 'XRPUSDT'
  const [bybitFunding, setBybitFunding] = useState(null);  // { xrpusd: { fundingRateAnnualized, avgFundingRate10dAnnualized }, xrpusdt: {...} }
  const [remainderQty, setRemainderQty] = useState(null); // 부분 체결 시 미체결 수량 (나머지로 주문용)

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
    setBybitPosition('로딩중');

    let cancelled = false;

    const fetchInfos = () => {
      const token = localStorage.getItem('token');
      if (!token || cancelled) return;

      fetch('/api/short1x/balance', { headers: { Authorization: 'Bearer ' + token } })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) setXrpBalance(null);
          else
            setXrpBalance({
              xrp: data.xrp,
              xrpEquity: data.xrpEquity,
              xrpTotal: data.xrpTotal,
              usdAvailable: data.usdAvailable,
              usdMarginBalance: data.usdMarginBalance,
              totalWalletBalance: data.totalWalletBalance,
              totalInitialMargin: data.totalInitialMargin,
            });
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

      fetch(`/api/short1x/bybit-position?symbol=${encodeURIComponent(bybitSymbol)}`, {
        headers: { Authorization: 'Bearer ' + token },
      })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) {
            setBybitPosition(null);
          } else {
            setBybitPosition(data);
          }
        })
        .catch(() => {
          if (!cancelled) setBybitPosition(null);
        });

      fetch('/api/short1x/bybit-funding', { headers: { Authorization: 'Bearer ' + token } })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) setBybitFunding(null);
          else setBybitFunding(data);
        })
        .catch(() => {
          if (!cancelled) setBybitFunding(null);
        });
    };

    fetchInfos();
    const id = setInterval(fetchInfos, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loginArea, bybitSymbol]);

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
        // 기본값: 현재 선택된 자산(XRP/USDT)에 맞는 첫 번째 주소
        const firstForAsset = list.find((item) => item.currency === withdrawAsset);
        if (firstForAsset) {
          const defaultValue = `${firstForAsset.withdraw_address}||${firstForAsset.secondary_address || ''}||${firstForAsset.net_type}`;
          setWithdrawAddressValue(defaultValue);
        } else {
          setWithdrawAddressValue('');
        }
      })
      .catch(() => {
        setWithdrawAddresses([]);
        setWithdrawAddressesError('출금 주소를 불러오지 못했습니다.');
      });

    fetch('/api/short1x/upbit-deposit-addresses', {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setUpbitDepositAddresses([]);
          setUpbitDepositAddressesError(data.error);
          setBybitWithdrawDepositValue('');
          return;
        }
        setUpbitDepositAddressesError(null);
        const list = Array.isArray(data.addresses) ? data.addresses : [];
        setUpbitDepositAddresses(list);
        if (list.length > 0) {
          const first = `${list[0].deposit_address}||${list[0].secondary_address || ''}`;
          setBybitWithdrawDepositValue(first);
        } else {
          setBybitWithdrawDepositValue('');
        }
      })
      .catch(() => {
        setUpbitDepositAddresses([]);
        setUpbitDepositAddressesError('입금 주소 조회 실패');
        setBybitWithdrawDepositValue('');
      });
  }, [loginArea]);

  // 슬라이더(shortPct)만 바뀔 때 마진 기준으로 XRP 수량 재계산. 지정가(shortPrice) 변경 시에는 사용자가 입력한 수량을 덮어쓰지 않음.
  useEffect(() => {
    if (loginArea || !xrpBalance || xrpBalance === '로딩중') return;
    recomputeQtyFromPct(shortPct);
  }, [shortPct]);

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
        const data = await res.json().catch(() => ({}));
        const msg = res.status === 429
          ? (data.error || '로그인 시도 횟수 초과. 15분 후 다시 시도해주세요.')
          : (data.error || '로그인 실패');
        setMessage({ type: 'error', text: msg });
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
        body: JSON.stringify({ price, volume, asset: upbitSpotAsset }),
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

  async function placeUpbitSellOrder(e) {
    e.preventDefault();
    const price = Number(String(upbitSellPrice).replace(/,/g, ''));
    const volume = Number(String(upbitSellVolume).replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(volume) || volume <= 0) {
      setMessage({
        type: 'error',
        text: `지정가(원)와 ${upbitSpotAsset} 수량을 올바르게 입력해주세요.`,
      });
      return;
    }
    setUpbitSellOrderLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/short1x/upbit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ price, volume, side: 'ask', asset: upbitSpotAsset }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '업비트 매도 주문 실패' });
        return;
      }
      setMessage({ type: 'success', text: data.message || '매도 주문 접수됨' });
      setUpbitSellPrice('');
      setUpbitSellVolume('');
      fetch('/api/short1x/upbit-info', { headers: { Authorization: 'Bearer ' + token } })
        .then((r) => r.json())
        .then((d) => {
          if (d.error) setUpbitInfo({ accountError: d.error });
          else setUpbitInfo(mapUpbitInfo(d));
        })
        .catch(() => setUpbitInfo({ accountError: '업비트 정보 조회 실패' }));
    } catch (err) {
      setMessage({ type: 'error', text: err.message || '매도 주문 요청 실패' });
    } finally {
      setUpbitSellOrderLoading(false);
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
      setMessage({
        type: 'error',
        text: `출금 수량(${withdrawAsset})을 입력해주세요.`,
      });
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
          asset: withdrawAsset,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error || '업비트 XRP 출금 실패';
        setMessage({ type: 'error', text: errMsg });
        alert(errMsg);
        return;
      }
      const successMsg =
        data.message ||
        `업비트 ${withdrawAsset} 출금 요청이 접수되었습니다.${
          amount ? ` (출금 수량: ${amount.toLocaleString()} ${withdrawAsset})` : ''
        }`;
      setMessage({ type: 'success', text: successMsg });
      alert(successMsg);
      setWithdrawAmount('');
    } catch (err) {
      const errMsg = err.message || `업비트 ${withdrawAsset} 출금 실패`;
      setMessage({ type: 'error', text: errMsg });
      alert(errMsg);
    } finally {
      setWithdrawLoading(false);
    }
  }

  async function bybitWithdraw(e) {
    e.preventDefault();
    const amount = Number(String(bybitWithdrawAmount).replace(/,/g, ''));
    if (!bybitWithdrawDepositValue) {
      setMessage({ type: 'error', text: `업비트 ${bybitWithdrawAsset} 입금 주소를 선택해주세요.` });
      return;
    }
    const [address, tag] = bybitWithdrawDepositValue.split('||');
    if (!address || !address.trim()) {
      setMessage({ type: 'error', text: '출금 주소를 선택해주세요.' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage({ type: 'error', text: `출금 수량(${bybitWithdrawAsset})을 입력해주세요.` });
      return;
    }
    setBybitWithdrawLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/short1x/bybit-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          amount,
          address: address.trim(),
          tag: (tag || '').trim() || undefined,
          asset: bybitWithdrawAsset,
          chain: bybitWithdrawAsset === 'USDT' ? 'TRX' : 'XRP',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error || `Bybit ${bybitWithdrawAsset} 출금 실패`;
        setMessage({ type: 'error', text: errMsg });
        alert(errMsg);
        return;
      }
      const successMsg =
        data.message || `Bybit ${bybitWithdrawAsset} 출금 요청이 접수되었습니다.`;
      setMessage({ type: 'success', text: successMsg });
      alert(successMsg);
      setBybitWithdrawAmount('');
    } catch (err) {
      const errMsg = err.message || 'Bybit XRP 출금 실패';
      setMessage({ type: 'error', text: errMsg });
      alert(errMsg);
    } finally {
      setBybitWithdrawLoading(false);
    }
  }

  async function placeShortOrder(side) {
    console.warn('[short1x][placeShortOrder] 호출됨', { side, qty, shortPrice });
    let trimQty = (qty || '').trim();
    const trimPrice = (shortPrice || '').trim();

    // 청산(Buy): 입력 수량 대신 현재 포지션을 기준으로 비율만큼 계산 (Close by Limit/reduce-only 용도)
    if (
      side === 'Buy' &&
      bybitPosition &&
      bybitPosition !== '로딩중' &&
      bybitPosition.size != null &&
      Number(bybitPosition.size) !== 0
    ) {
      const posAbs = Math.abs(Number(bybitPosition.size));
      if (Number.isFinite(posAbs) && posAbs > 0) {
        const ratio = Math.max(0, Math.min(100, Number(shortPct))) / 100;
        const closeQtyRaw = posAbs * ratio;
        const closeQty =
          bybitSymbol === 'XRPUSD'
            ? String(Math.round(closeQtyRaw))
            : (Math.floor(closeQtyRaw * 10) / 10).toFixed(1).replace(/\.0$/, '');
        trimQty = closeQty;
        setQty(closeQty); // UI에도 반영
      }
    } else if (side === 'Buy') {
      const msg = `청산 수량을 계산하려면 현재 ${bybitSymbol} 포지션 정보가 필요합니다. (포지션 조회 중이거나 0으로 조회됨)\n\nBybit 포지션을 새로고침한 뒤 다시 시도해주세요.`;
      setMessage({ type: 'error', text: msg });
      alert(msg);
      return;
    }

    if (!trimQty || Number(trimQty) <= 0 || !Number.isFinite(Number(trimQty))) {
      setMessage({
        type: 'error',
        text: bybitSymbol === 'XRPUSD' ? 'USD 금액을 올바르게 입력해주세요.' : 'XRP 수량을 올바르게 입력해주세요.',
      });
      return;
    }
    if (!trimPrice || Number(trimPrice) <= 0 || !Number.isFinite(Number(trimPrice))) {
      setMessage({ type: 'error', text: '지정가 가격(USDT)을 올바르게 입력해주세요.' });
      return;
    }
    const notionalUsd = bybitSymbol === 'XRPUSD' ? Number(trimQty) : Number(trimQty) * Number(trimPrice);
    // 청산(reduce-only)은 소액 포지션도 닫아야 하므로 최소 5 USD 제한을 적용하지 않음
    if (side !== 'Buy' && notionalUsd < 5) {
      const hint =
        bybitSymbol === 'XRPUSD'
          ? 'XRPUSD는 입력값이 XRP 수량이 아니라 USD 금액입니다.'
          : 'XRPUSDT는 입력값이 XRP 수량입니다.';
      const msg = `주문 금액이 최소 5 USD 이상이어야 합니다. (현재 약 ${notionalUsd.toFixed(2)} USD)\n\n${hint}`;
      setMessage({ type: 'error', text: msg });
      alert(msg);
      return;
    }

    const payload = { qty: trimQty, price: trimPrice, side, symbol: bybitSymbol };
    console.warn('[short1x][placeShortOrder] 요청 파라미터', {
      url: '/api/short1x/order',
      method: 'POST',
      body: payload,
      notionalUsd: notionalUsd.toFixed(2),
    });

    setLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        const errMsg = '로그인 토큰이 없습니다. 다시 로그인해주세요.';
        setMessage({ type: 'error', text: errMsg });
        alert(errMsg);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/short1x/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      console.warn('[short1x][placeShortOrder] 응답', {
        ok: res.ok,
        status: res.status,
        data,
      });
      if (!res.ok) {
        const errMsg = data.error || '주문 실패';
        const detail =
          data.errorDetail ||
          (data.retCode != null ? `${errMsg} (retCode: ${data.retCode})` : errMsg);
        setMessage({ type: 'error', text: detail });
        alert(detail);
        return;
      }
      const successMsg =
        data.message +
        (data.orderId ? ` (주문 ID: ${data.orderId})` : '') +
        ' 미체결 시 거래소에서 자동 취소될 수 있습니다.';
      setMessage({
        type: 'success',
        text: successMsg
      });
      setLastOrderId(data.orderId || null);
      alert(successMsg);
    } catch (err) {
      const errMsg =
        err?.name === 'AbortError'
          ? '주문 요청이 시간 초과되었습니다. 네트워크/서버 상태를 확인하고 다시 시도해주세요.'
          : err.message || '주문 요청 실패';
      setMessage({ type: 'error', text: errMsg });
      alert(errMsg);
    } finally {
      setLoading(false);
    }
  }

  function recomputeQtyFromPct(pct) {
    if (!xrpBalance || xrpBalance === '로딩중') return;
    const ratio = Math.max(0, Math.min(100, pct)) / 100;

    const usdAvailableRaw = Number(xrpBalance.usdAvailable);
    const usdAvailable =
      Number.isFinite(usdAvailableRaw) && usdAvailableRaw > 0
        ? Math.floor(usdAvailableRaw)
        : NaN;

    if (bybitSymbol === 'XRPUSD') {
      // XRPUSD: 입력값 = USD 금액. 가용 마진(USD)에 비율 적용
      if (!Number.isFinite(usdAvailable) || usdAvailable <= 0) {
        setQty('');
        return;
      }
      const safe = Math.floor(usdAvailable * ratio * 0.999);
      setQty(safe > 0 ? String(safe) : '');
      return;
    }

    // XRPUSDT: 입력값 = XRP 수량. 가용 마진 ÷ 지정가 = 최대 XRP, 비율 적용
    const price = Number(shortPrice);
    let baseQty = NaN;
    if (Number.isFinite(price) && price > 0 && Number.isFinite(usdAvailable) && usdAvailable > 0) {
      baseQty = usdAvailable / price;
    } else {
      const availableXrp = Number(xrpBalance.xrp);
      if (Number.isFinite(availableXrp) && availableXrp > 0) {
        baseQty = availableXrp;
      }
    }
    if (!Number.isFinite(baseQty) || baseQty <= 0) {
      setQty('');
      return;
    }
    const safe = baseQty * ratio * 0.999;
    const rounded = Math.floor(safe * 100) / 100;
    if (rounded > 0) {
      setQty(rounded.toFixed(2));
    } else {
      setQty('');
    }
  }

  function fillMaxShortQty() {
    setShortPct(100);
    recomputeQtyFromPct(100);
  }

  async function checkOrderStatus() {
    if (!lastOrderId) return;
    setOrderStatusLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/short1x/order-status?orderId=${encodeURIComponent(lastOrderId)}`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      const data = await res.json().catch(() => ({}));
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
        return;
      }
      if (!data.found) {
        setMessage({ type: 'error', text: data.message || '주문을 찾을 수 없습니다.' });
        return;
      }
      const status = data.orderStatus;
      const statusKo =
        status === 'Filled'
          ? '체결됨'
          : status === 'Cancelled'
            ? '취소됨'
            : status === 'Rejected'
              ? '거절됨'
              : status === 'PartiallyFilled'
                ? '부분 체결'
                : status === 'New'
                  ? '대기 중'
                  : status || '알 수 없음';
      let text = `주문 상태: ${statusKo}`;
      if (status === 'Cancelled' && data.rejectReason) {
        const reason = data.rejectReason;
        const reasonKo =
          reason === 'EC_PostOnlyWillTakeLiquidity'
            ? 'Post-Only 주문이 유동성을 가져가서 취소됨 (지정가를 시장가보다 유리하게 조정 후 다시 주문하세요)'
            : reason;
        text += ` (사유: ${reasonKo})`;
      }
      if (status === 'Rejected' && data.rejectReason) {
        text += ` (사유: ${data.rejectReason})`;
      }
      if (status === 'Filled' && data.cumExecQty) {
        text += ` · 체결 수량: ${data.cumExecQty}`;
      }
      if (status === 'PartiallyFilled' && data.leavesQty != null && Number(data.leavesQty) > 0) {
        text += ` · 미체결 수량: ${data.leavesQty}`;
        setRemainderQty(String(data.leavesQty));
      } else {
        setRemainderQty(null);
      }
      setMessage({ type: status === 'Filled' ? 'success' : 'error', text });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || '상태 조회 실패' });
    } finally {
      setOrderStatusLoading(false);
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
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.upbitXrpBalance != null ? (
            <>
              {Number(upbitInfo.upbitXrpBalance).toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}{' '}
              XRP
              {upbitInfo.xrpPrice != null && (
                <span style={{ marginLeft: 6, color: '#666' }}>
                  (
                  {(
                    Number(upbitInfo.upbitXrpBalance) * Number(upbitInfo.xrpPrice)
                  ).toLocaleString()}
                  원)
                </span>
              )}
            </>
          ) : (
            '알 수 없음'
          )}
        </p>
        <p style={{ margin: '0 0 4px 0' }}>
          <strong>업비트 보유 USDT:</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.upbitUsdtBalance != null ? (
            <>
              {Number(upbitInfo.upbitUsdtBalance).toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}{' '}
              USDT
              {upbitInfo.usdtKrwPrice != null && (
                <span style={{ marginLeft: 6, color: '#666' }}>
                  (
                  {(
                    Number(upbitInfo.upbitUsdtBalance) * Number(upbitInfo.usdtKrwPrice)
                  ).toLocaleString()}
                  원)
                </span>
              )}
            </>
          ) : (
            '알 수 없음'
          )}
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
          <strong>업비트 USDT 지정가 매수 주문 금액:</strong>{' '}
          {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.upbitUsdtBuyOrderKrw != null
            ? `${Number(upbitInfo.upbitUsdtBuyOrderKrw).toLocaleString()}원`
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

        <div style={{ margin: '0 0 8px 0' }}>
          <label style={{ fontSize: 13, color: '#555', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            거래 대상:
            <select
              value={upbitSpotAsset}
              onChange={(e) => setUpbitSpotAsset(e.target.value === 'USDT' ? 'USDT' : 'XRP')}
              style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
            >
              <option value="XRP">XRP</option>
              <option value="USDT">USDT</option>
            </select>
          </label>
        </div>

        <form onSubmit={placeUpbitBuyOrder} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#555' }}>지정가(원)</span>
              <button
                type="button"
                onClick={() => {
                  if (!upbitInfo || upbitInfo === '로딩중') return;
                  const priceSrc =
                    upbitSpotAsset === 'USDT'
                      ? upbitInfo.usdtKrwPrice
                      : upbitInfo.xrpPrice;
                  if (priceSrc == null) return;
                  setUpbitPrice(
                    formatNumberInput(String(Math.round(Number(priceSrc))))
                  );
                }}
                disabled={
                  !upbitInfo ||
                  upbitInfo === '로딩중' ||
                  (upbitSpotAsset === 'USDT'
                    ? upbitInfo.usdtKrwPrice == null
                    : upbitInfo.xrpPrice == null)
                }
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  backgroundColor:
                    !upbitInfo ||
                    upbitInfo === '로딩중' ||
                    (upbitSpotAsset === 'USDT'
                      ? upbitInfo.usdtKrwPrice == null
                      : upbitInfo.xrpPrice == null)
                      ? '#ccc'
                      : '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor:
                    !upbitInfo ||
                    upbitInfo === '로딩중' ||
                    (upbitSpotAsset === 'USDT'
                      ? upbitInfo.usdtKrwPrice == null
                      : upbitInfo.xrpPrice == null)
                      ? 'not-allowed'
                      : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                현재가
              </button>
            </div>
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
        <form onSubmit={placeUpbitSellOrder} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#555' }}>지정가(원)</span>
              <button
                type="button"
                onClick={() => {
                  if (!upbitInfo || upbitInfo === '로딩중') return;
                  const priceSrc =
                    upbitSpotAsset === 'USDT'
                      ? upbitInfo.usdtKrwPrice
                      : upbitInfo.xrpPrice;
                  if (priceSrc == null) return;
                  setUpbitSellPrice(
                    formatNumberInput(String(Math.round(Number(priceSrc))))
                  );
                }}
                disabled={
                  !upbitInfo ||
                  upbitInfo === '로딩중' ||
                  (upbitSpotAsset === 'USDT'
                    ? upbitInfo.usdtKrwPrice == null
                    : upbitInfo.xrpPrice == null)
                }
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  backgroundColor:
                    !upbitInfo ||
                    upbitInfo === '로딩중' ||
                    (upbitSpotAsset === 'USDT'
                      ? upbitInfo.usdtKrwPrice == null
                      : upbitInfo.xrpPrice == null)
                      ? '#ccc'
                      : '#c62828',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor:
                    !upbitInfo ||
                    upbitInfo === '로딩중' ||
                    (upbitSpotAsset === 'USDT'
                      ? upbitInfo.usdtKrwPrice == null
                      : upbitInfo.xrpPrice == null)
                      ? 'not-allowed'
                      : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                현재가
              </button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="예: 1,000"
              value={upbitSellPrice}
              onChange={(e) => setUpbitSellPrice(formatNumberInput(e.target.value))}
              style={{ width: 120, padding: '6px 8px' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#555' }}>
                {upbitSpotAsset === 'USDT' ? 'USDT 수량' : 'XRP 수량'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (
                    upbitSpotAsset === 'XRP' &&
                    upbitInfo &&
                    upbitInfo !== '로딩중' &&
                    upbitInfo.upbitXrpBalance != null
                  ) {
                    const all = Number(upbitInfo.upbitXrpBalance);
                    setUpbitSellVolume(all % 1 === 0 ? String(all) : all.toFixed(4));
                  }
                }}
                disabled={
                  upbitSpotAsset === 'USDT' ||
                  !upbitInfo ||
                  upbitInfo === '로딩중' ||
                  upbitInfo.upbitXrpBalance == null ||
                  Number(upbitInfo.upbitXrpBalance) <= 0
                }
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  backgroundColor:
                    upbitSpotAsset === 'USDT' ||
                    !upbitInfo ||
                    upbitInfo === '로딩중' ||
                    upbitInfo.upbitXrpBalance == null ||
                    Number(upbitInfo.upbitXrpBalance) <= 0
                      ? '#ccc'
                      : '#c62828',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor:
                    upbitSpotAsset === 'USDT' ||
                    !upbitInfo ||
                    upbitInfo === '로딩중' ||
                    upbitInfo.upbitXrpBalance == null ||
                    Number(upbitInfo.upbitXrpBalance) <= 0
                      ? 'not-allowed'
                      : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                전부
              </button>
            </div>
            <input
              type="text"
              inputMode="decimal"
              placeholder="예: 100"
              value={upbitSellVolume}
              onChange={(e) => setUpbitSellVolume(formatDecimalInput(e.target.value))}
              style={{ width: 120, padding: '6px 8px' }}
            />
          </label>
          <button
            type="submit"
            disabled={upbitSellOrderLoading}
            style={{
              padding: '8px 14px',
              backgroundColor: upbitSellOrderLoading ? '#999' : '#c62828',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: upbitSellOrderLoading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            {upbitSellOrderLoading ? '주문 중...' : '매도 주문'}
          </button>
        </form>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>업비트 출금</p>
          <div style={{ margin: '0 0 8px 0' }}>
            <label style={{ fontSize: 13, color: '#555', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              출금 자산:
              <select
                value={withdrawAsset}
                onChange={(e) => {
                  const next = e.target.value === 'USDT' ? 'USDT' : 'XRP';
                  setWithdrawAsset(next);
                  // 자산 변경 시 해당 자산의 첫 주소를 기본값으로 재선택
                  const firstForAsset =
                    withdrawAddresses.find((item) => item.currency === next) || null;
                  if (firstForAsset) {
                    const value = `${firstForAsset.withdraw_address}||${firstForAsset.secondary_address || ''}||${firstForAsset.net_type}`;
                    setWithdrawAddressValue(value);
                  } else {
                    setWithdrawAddressValue('');
                  }
                }}
                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
              >
                <option value="XRP">XRP</option>
                <option value="USDT">USDT</option>
              </select>
            </label>
          </div>
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
                {withdrawAddresses.filter((item) => item.currency === withdrawAsset).length === 0 && (
                  <option value="">{`등록된 ${withdrawAsset} 출금 주소 없음`}</option>
                )}
                {withdrawAddresses
                  .filter((item) => item.currency === withdrawAsset)
                  .map((item) => {
                  const value = `${item.withdraw_address}||${item.secondary_address || ''}||${item.net_type}`;
                  const label = [
                    item.withdraw_address,
                    item.secondary_address ? `태그 ${item.secondary_address}` : null,
                    item.net_type ? item.net_type : null,
                  ].filter(Boolean).join(' / ');
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#555' }}>
                  출금 수량({withdrawAsset})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!upbitInfo || upbitInfo === '로딩중') return;
                    if (withdrawAsset === 'XRP' && upbitInfo.upbitXrpBalance != null) {
                      const all = Number(upbitInfo.upbitXrpBalance);
                      setWithdrawAmount(all % 1 === 0 ? String(all) : all.toFixed(4));
                    } else if (withdrawAsset === 'USDT' && upbitInfo.upbitUsdtBalance != null) {
                      const all = Number(upbitInfo.upbitUsdtBalance);
                      setWithdrawAmount(all % 1 === 0 ? String(all) : all.toFixed(4));
                    }
                  }}
                  disabled={
                    !upbitInfo ||
                    upbitInfo === '로딩중' ||
                    (withdrawAsset === 'XRP'
                      ? upbitInfo.upbitXrpBalance == null || Number(upbitInfo.upbitXrpBalance) <= 0
                      : upbitInfo.upbitUsdtBalance == null || Number(upbitInfo.upbitUsdtBalance) <= 0)
                  }
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    backgroundColor:
                      !upbitInfo ||
                      upbitInfo === '로딩중' ||
                      (withdrawAsset === 'XRP'
                        ? upbitInfo.upbitXrpBalance == null || Number(upbitInfo.upbitXrpBalance) <= 0
                        : upbitInfo.upbitUsdtBalance == null || Number(upbitInfo.upbitUsdtBalance) <= 0)
                        ? '#ccc'
                        : '#6a1b9a',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor:
                      !upbitInfo ||
                      upbitInfo === '로딩중' ||
                      (withdrawAsset === 'XRP'
                        ? upbitInfo.upbitXrpBalance == null || Number(upbitInfo.upbitXrpBalance) <= 0
                        : upbitInfo.upbitUsdtBalance == null || Number(upbitInfo.upbitUsdtBalance) <= 0)
                        ? 'not-allowed'
                        : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  전부
                </button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder="예: 100"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(formatDecimalInput(e.target.value))}
                style={{ width: 120, padding: '8px 10px' }}
              />
            </label>
            <button
              type="submit"
              disabled={
                withdrawLoading ||
                withdrawAddresses.filter((item) => item.currency === withdrawAsset).length === 0
              }
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
              {withdrawLoading ? '출금 중...' : `${withdrawAsset} 출금`}
            </button>
          </form>
        </div>
      </div>

      {/* Bybit 영역 */}
      <div style={{ marginBottom: 24, padding: '12px 16px', backgroundColor: '#f5f5f5', borderRadius: 8 }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 'bold' }}>Bybit 영역</h2>
        <div style={{ margin: '0 0 8px 0' }}>
          <label style={{ fontSize: 13, color: '#555', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            선물 심볼:
            <select
              value={bybitSymbol}
              onChange={(e) => {
                const next = e.target.value === 'XRPUSDT' ? 'XRPUSDT' : 'XRPUSD';
                if (next !== bybitSymbol) {
                  setBybitSymbol(next);
                  setQty(''); // 단위가 달라지므로 입력 초기화 (XRPUSD=USD, XRPUSDT=XRP)
                }
              }}
              style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
            >
              <option value="XRPUSD">XRPUSD (inverse)</option>
              <option value="XRPUSDT">XRPUSDT (linear)</option>
            </select>
          </label>
        </div>
        <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#333' }}>
          {bybitFunding && (bybitSymbol === 'XRPUSDT' ? bybitFunding.xrpusdt : bybitFunding.xrpusd) ? (
            (() => {
              const info = bybitSymbol === 'XRPUSDT' ? bybitFunding.xrpusdt : bybitFunding.xrpusd;
              const rawRate = info.fundingRate; // 8h당 펀딩피 (소수, 예: 0.0001 = 0.01%)
              const avg10 = info.avgFundingRate10d; // 10일 평균 펀딩피 (소수)
              const sum10 = info.sumFundingRate10d; // 10일 합산 펀딩피 (소수)
              return (
                <>
                  <strong>{bybitSymbol} 현재 펀딩피:</strong>{' '}
                  {rawRate != null ? `${Number(rawRate) >= 0 ? '+' : ''}${(Number(rawRate) * 100).toFixed(4)}% (8h)` : '—'}
                  {' · '}
                  <strong>10일 평균 펀딩피:</strong>{' '}
                  {avg10 != null ? `${Number(avg10) >= 0 ? '+' : ''}${(Number(avg10) * 100).toFixed(4)}% (8h)` : '—'}
                  {' · '}
                  <strong>10일 합산 펀딩피:</strong>{' '}
                  {sum10 != null ? `${Number(sum10) >= 0 ? '+' : ''}${(Number(sum10) * 100).toFixed(4)}% (10일)` : '—'}
                </>
              );
            })()
          ) : (
            <>펀딩 레이트 조회 중… (1배 숏 시 펀딩 수급/지급 참고)</>
          )}
        </p>
        <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#888' }}>
          최소 주문 금액: 5 USD (수량 × 지정가가 5 USD 이상이어야 합니다)
        </p>
        <p style={{ margin: '0 0 8px 0' }}>
          <strong>현재 Bybit {bybitSymbol}(선물):</strong>{' '}
          {(() => {
            if (!upbitInfo || upbitInfo === '로딩중') return '알 수 없음';
            let price =
              bybitSymbol === 'XRPUSDT'
                ? upbitInfo.bybitXrpUsdtPrice
                : upbitInfo.bybitXrpUsdPrice;
            // XRPUSDT 가격이 없으면 XRPUSD 가격으로라도 표시
            if (price == null && bybitSymbol === 'XRPUSDT' && upbitInfo.bybitXrpUsdPrice != null) {
              price = upbitInfo.bybitXrpUsdPrice;
            }
            if (price == null) return '알 수 없음';
            const base = `${Number(price).toFixed(4)} USDT`;
            if (upbitInfo.usdtKrwPrice != null) {
              const krw = Number(price) * Number(upbitInfo.usdtKrwPrice);
              return `${base} (~${Math.round(krw).toLocaleString()}원)`;
            }
            return base;
          })()}
        </p>
        <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#444' }}>
          {(() => {
            if (
              !xrpBalance ||
              xrpBalance === '로딩중' ||
              !upbitInfo ||
              upbitInfo === '로딩중' ||
              upbitInfo.usdtKrwPrice == null ||
              upbitInfo.xrpPrice == null
            ) {
              return 'Bybit USDT + 업비트 XRP 총 평가액을 계산할 수 없습니다.';
            }
            const bybitUsdt = Number(xrpBalance.usdMarginBalance);
            const upbitXrp = Number(upbitInfo.upbitXrpBalance);
            if (!Number.isFinite(bybitUsdt) || !Number.isFinite(upbitXrp)) {
              return 'Bybit USDT + 업비트 XRP 총 평가액을 계산할 수 없습니다.';
            }
            const bybitKrw = bybitUsdt * Number(upbitInfo.usdtKrwPrice);
            const upbitKrw = upbitXrp * Number(upbitInfo.xrpPrice);
            const total = bybitKrw + upbitKrw;
            return `Bybit USDT 평가액: 약 ${Math.round(bybitKrw).toLocaleString()}원, 업비트 XRP 평가액: 약 ${Math.round(
              upbitKrw
            ).toLocaleString()}원, 합계: 약 ${Math.round(total).toLocaleString()}원`;
          })()}
        </p>
        <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#555' }}>
          {xrpBalance && xrpBalance !== '로딩중' && upbitInfo && upbitInfo !== '로딩중'
            ? (() => {
                if (bybitSymbol === 'XRPUSDT') {
                  const usdtAvail = Number(xrpBalance.usdtAvailable);
                  if (!Number.isFinite(usdtAvail)) {
                    return '현재 Bybit USDT 잔고 정보를 불러오는 중입니다.';
                  }
                  const krw =
                    upbitInfo.usdtKrwPrice != null
                      ? usdtAvail * Number(upbitInfo.usdtKrwPrice)
                      : null;
                  return `현재 Bybit 보유 USDT: ${usdtAvail.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })} USDT${
                    krw != null
                      ? ` (현재 USDT 가격 기준 약 ${Math.round(krw).toLocaleString()}원)`
                      : ''
                  }`;
                }

                if (upbitInfo.xrpPrice == null) {
                  return '현재 Bybit XRP 보유 수량 또는 XRP 가격 정보를 불러오는 중입니다.';
                }
                const xrpAmount = Number(xrpBalance.xrp);
                const krw = xrpAmount * Number(upbitInfo.xrpPrice);
                return `현재 Bybit 보유 XRP: ${xrpAmount.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })} XRP (현재 XRP 가격 기준 약 ${Math.round(krw).toLocaleString()}원)`;
              })()
            : '현재 Bybit XRP/USDT 보유 수량 정보를 불러오는 중입니다.'}
        </p>
        {xrpBalance === '로딩중' && <p style={{ color: '#666', marginBottom: 8 }}>Bybit 보유 XRP 조회 중...</p>}
        {xrpBalance && xrpBalance !== '로딩중' && (
          <div style={{ marginBottom: 16, padding: '8px 12px', backgroundColor: '#fff', borderRadius: 6 }}>
            {xrpBalance.totalWalletBalance != null && (
              <p style={{ margin: '0 0 4px 0' }}>
                <strong>지갑 잔고 (Wallet, USD):</strong>{' '}
                {Number(xrpBalance.totalWalletBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </p>
            )}
            <p style={{ margin: '0 0 4px 0' }}>
              <strong>마진 사용가능 (Available, USD):</strong>{' '}
              {xrpBalance.usdAvailable != null
                ? `${Number(xrpBalance.usdAvailable).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                : '—'}
              {xrpBalance.totalWalletBalance != null && xrpBalance.usdAvailable != null && Number(xrpBalance.totalInitialMargin) > 0 && (
                <span style={{ fontSize: 12, color: '#666' }}>
                  {' '}(포지션/주문 마진 {Number(xrpBalance.totalInitialMargin).toFixed(2)} USD 사용 중)
                </span>
              )}
            </p>
            {xrpBalance.usdMarginBalance != null && (
              <p style={{ margin: '0 0 4px 0' }}>
                <strong>마진 잔고 (Margin Balance, USD):</strong>{' '}
                {Number(xrpBalance.usdMarginBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </p>
            )}
            {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.bybitXrpUsdPrice != null && xrpBalance.usdAvailable != null && Number(xrpBalance.usdAvailable) > 0 && (
              <p style={{ margin: 0, fontSize: 12, color: '#555' }}>
                사용 가능 마진 (XRP 환산): 약{' '}
                {(Number(xrpBalance.usdAvailable) / Number(upbitInfo.bybitXrpUsdPrice)).toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP
                {' '}(현재가 기준)
              </p>
            )}
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#777' }}>
              지갑 XRP: {Number(xrpBalance.xrp).toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP
              {xrpBalance.xrpTotal != null && ` (총 ${Number(xrpBalance.xrpTotal).toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP)`}
            </p>
            {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.bybitXrpUsdPrice != null && (
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#666' }}>
                실시간 USD 환산 (보유 XRP × 현재가):{' '}
                {(Number(xrpBalance.xrp) * Number(upbitInfo.bybitXrpUsdPrice)).toFixed(2)} USD
              </p>
            )}
          </div>
        )}
        {bybitPosition === '로딩중' && (
          <p style={{ color: '#666', marginBottom: 8 }}>{bybitSymbol} 포지션 조회 중...</p>
        )}
        {bybitPosition && bybitPosition !== '로딩중' && !bybitPosition.size && (
          <p style={{ marginBottom: 8 }}>현재 열린 {bybitSymbol} 포지션이 없습니다.</p>
        )}
        {bybitPosition && bybitPosition !== '로딩중' && bybitPosition.size && Number(bybitPosition.size) !== 0 && (
          <div style={{ marginBottom: 16, padding: '8px 12px', backgroundColor: '#fff', borderRadius: 6 }}>
            <p style={{ margin: '0 0 4px 0' }}>
              <strong>현재 {bybitPosition.symbol || bybitSymbol} 포지션:</strong>{' '}
              {bybitPosition.side || (Number(bybitPosition.size) > 0 ? 'Sell' : 'Buy')} {' '}
              {Number(bybitPosition.size).toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP
              {bybitPosition.avgPrice && (
                <>
                  {' @ '}
                  {Number(bybitPosition.avgPrice).toFixed(4)} USDT
                </>
              )}
            </p>
            {bybitPosition.positionMargin && (
              <p style={{ margin: 0 }}>
                <strong>포지션 증거금:</strong>{' '}
                {Number(bybitPosition.positionMargin).toLocaleString(undefined, { maximumFractionDigits: 4 })} (Bybit positionIM)
              </p>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontWeight: 'bold' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{bybitSymbol === 'XRPUSD' ? '주문 금액 (USD 기준)' : 'XRP 수량'}</span>
                {xrpBalance && xrpBalance !== '로딩중' && (
                  <button
                    type="button"
                    onClick={fillMaxShortQty}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#1976d2',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: 0,
                    }}
                  >
                    100%
                  </button>
                )}
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder={bybitSymbol === 'XRPUSD' ? '예: 100 (USD)' : '예: 100'}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                style={{ display: 'block', marginTop: 6, padding: 10, fontSize: 16, width: '100%', boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ fontWeight: 'bold' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>지정가 (USDT)</span>
                <button
                  type="button"
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: 'none',
                    backgroundColor:
                      upbitInfo && upbitInfo !== '로딩중' && upbitInfo.bybitXrpUsdPrice != null
                        ? '#1976d2'
                        : '#90a4ae',
                    color: '#fff',
                    cursor:
                      upbitInfo && upbitInfo !== '로딩중' && upbitInfo.bybitXrpUsdPrice != null
                        ? 'pointer'
                        : 'not-allowed'
                  }}
                  disabled={
                    !(
                      upbitInfo &&
                      upbitInfo !== '로딩중' &&
                      upbitInfo.bybitXrpUsdPrice != null
                    )
                  }
                  onClick={() => {
                    if (
                      upbitInfo &&
                      upbitInfo !== '로딩중' &&
                      upbitInfo.bybitXrpUsdPrice != null
                    ) {
                      setShortPrice(Number(upbitInfo.bybitXrpUsdPrice).toFixed(4));
                    }
                  }}
                >
                  현재가
                </button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder={
                  upbitInfo && upbitInfo !== '로딩중' && upbitInfo.bybitXrpUsdPrice != null
                    ? `예: ${Number(upbitInfo.bybitXrpUsdPrice).toFixed(4)}`
                    : '예: 0.5000'
                }
                value={shortPrice}
                onChange={(e) => setShortPrice(e.target.value)}
                style={{ display: 'block', marginTop: 6, padding: 10, fontSize: 16, width: '100%', boxSizing: 'border-box' }}
              />
            </label>
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555', marginBottom: 4 }}>
                <span>포지션 크기 비율</span>
                <span>{shortPct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={shortPct}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setShortPct(v);
                  recomputeQtyFromPct(v);
                }}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={loading}
              onClick={() => placeShortOrder('Sell')}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: loading ? '#999' : '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 'bold'
              }}
            >
              {loading ? '주문 중...' : '1x Short 진입 (Sell, Post-Only)'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => placeShortOrder('Buy')}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: loading ? '#999' : '#388e3c',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 'bold'
              }}
            >
              {loading ? '주문 중...' : '숏 포지션 청산 (Buy, Post-Only)'}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>Bybit → 업비트 출금</p>
          <p style={{ margin: '0 0 8px 4px', fontSize: 12, color: '#555' }}>
            출금 자산:
            <select
              value={bybitWithdrawAsset}
              onChange={(e) => {
                const v = e.target.value === 'USDT' ? 'USDT' : 'XRP';
                setBybitWithdrawAsset(v);
                setBybitWithdrawDepositValue('');
                setBybitWithdrawAmount('');
              }}
              style={{ marginLeft: 8, padding: '2px 6px', fontSize: 12, borderRadius: 4, border: '1px solid #ccc' }}
            >
              <option value="XRP">XRP</option>
              <option value="USDT">USDT</option>
            </select>
          </p>
          <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#666' }}>
            Bybit 주소록에 등록된 주소만 출금 가능합니다. 선택한 자산에 맞는 업비트 입금 주소를 API로 불러와 선택합니다.
          </p>
          {upbitDepositAddressesError && (
            <p style={{ color: '#c62828', margin: '0 0 8px 0' }}>{upbitDepositAddressesError}</p>
          )}
          <form onSubmit={bybitWithdraw} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 240 }}>
              <span style={{ fontSize: 12, color: '#555' }}>
                업비트 {bybitWithdrawAsset} 입금 주소 선택
              </span>
              <select
                value={bybitWithdrawDepositValue}
                onChange={(e) => setBybitWithdrawDepositValue(e.target.value)}
                style={{ padding: '8px 10px' }}
              >
                {upbitDepositAddresses.filter((a) => a.currency === bybitWithdrawAsset).length === 0 && (
                  <option value="">
                    업비트에 등록된 {bybitWithdrawAsset} 입금 주소 없음
                  </option>
                )}
                {upbitDepositAddresses
                  .filter((item) => item.currency === bybitWithdrawAsset)
                  .map((item, idx) => {
                    const value = `${item.withdraw_address}||${item.secondary_address || ''}`;
                    const label = [
                      item.exchange_name || '업비트',
                      item.withdraw_address,
                      item.secondary_address ? `태그 ${item.secondary_address}` : null,
                    ]
                      .filter(Boolean)
                      .join(' / ');
                    return (
                      <option key={idx} value={value}>
                        {label}
                      </option>
                    );
                  })}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#555' }}>
                출금 수량 ({bybitWithdrawAsset})
                {bybitWithdrawAsset === 'XRP' && xrpBalance && xrpBalance !== '로딩중' && xrpBalance.xrp != null && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const available = Number(xrpBalance.xrp);
                      const fee = 0.25;
                      const maxSend = Math.max(0, available - fee);
                      setBybitWithdrawAmount(maxSend % 1 === 0 ? String(maxSend) : maxSend.toFixed(4));
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const available = Number(xrpBalance.xrp); const fee = 0.25; const maxSend = Math.max(0, available - fee); setBybitWithdrawAmount(maxSend % 1 === 0 ? String(maxSend) : maxSend.toFixed(4)); } }}
                    style={{ marginLeft: 8, color: '#1976d2', cursor: Number(xrpBalance.xrp) > 0.25 ? 'pointer' : 'default', textDecoration: Number(xrpBalance.xrp) > 0.25 ? 'underline' : 'none' }}
                  >
                    출금 가능: {Number(xrpBalance.xrp).toLocaleString(undefined, { maximumFractionDigits: 4 })} XRP
                  </span>
                )}
                {bybitWithdrawAsset === 'XRP' && (!xrpBalance || xrpBalance === '로딩중') && (
                  <span style={{ marginLeft: 8, color: '#999' }}>
                    출금 가능: {xrpBalance === '로딩중' ? '조회 중...' : '— (잔액 조회 후 표시)'}
                  </span>
                )}
                {bybitWithdrawAsset === 'XRP' && xrpBalance && xrpBalance !== '로딩중' && xrpBalance.xrp == null && (
                  <span style={{ marginLeft: 8, color: '#999' }}>출금 가능: —</span>
                )}
                {bybitWithdrawAsset === 'XRP' && (
                  <span style={{ marginLeft: 8, color: '#666' }}>
                    출금 수수료: 0.25 XRP
                    {upbitInfo && upbitInfo !== '로딩중' && upbitInfo.xrpPrice != null && (
                      <> (약 {Math.round(0.25 * Number(upbitInfo.xrpPrice)).toLocaleString()}원)</>
                    )}
                  </span>
                )}
                {bybitWithdrawAsset === 'USDT' && (
                  <span style={{ marginLeft: 8, color: '#666' }}>
                    출금 수수료: 네트워크/거래소 정책에 따름 (Bybit/업비트에서 확인 필요)
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="예: 100"
                  value={bybitWithdrawAmount}
                  onChange={(e) => setBybitWithdrawAmount(formatDecimalInput(e.target.value))}
                  style={{ width: 120, padding: '8px 10px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (bybitWithdrawAsset === 'XRP') {
                      if (xrpBalance && xrpBalance !== '로딩중' && xrpBalance.xrp != null) {
                        const available = Number(xrpBalance.xrp);
                        const fee = 0.25;
                        const maxSend = Math.max(0, available - fee);
                        setBybitWithdrawAmount(
                          maxSend % 1 === 0 ? String(maxSend) : maxSend.toFixed(4)
                        );
                      }
                    } else if (bybitWithdrawAsset === 'USDT') {
                      if (
                        xrpBalance &&
                        xrpBalance !== '로딩중' &&
                        xrpBalance.usdtAvailable != null
                      ) {
                        const available = Number(xrpBalance.usdtAvailable);
                        const maxSend = Math.max(0, available);
                        setBybitWithdrawAmount(
                          maxSend % 1 === 0 ? String(maxSend) : maxSend.toFixed(4)
                        );
                      }
                    }
                  }}
                  disabled={
                    bybitWithdrawAsset === 'XRP'
                      ? !xrpBalance ||
                        xrpBalance === '로딩중' ||
                        xrpBalance.xrp == null ||
                        Number(xrpBalance.xrp) <= 0.25
                      : !xrpBalance ||
                        xrpBalance === '로딩중' ||
                        xrpBalance.usdtAvailable == null ||
                        Number(xrpBalance.usdtAvailable) <= 0
                  }
                  style={{
                    padding: '8px 12px',
                    fontSize: 12,
                    backgroundColor:
                      bybitWithdrawAsset === 'XRP'
                        ? !xrpBalance ||
                          xrpBalance === '로딩중' ||
                          xrpBalance.xrp == null ||
                          Number(xrpBalance.xrp) <= 0.25
                          ? '#ccc'
                          : '#1976d2'
                        : !xrpBalance ||
                          xrpBalance === '로딩중' ||
                          xrpBalance.usdtAvailable == null ||
                          Number(xrpBalance.usdtAvailable) <= 0
                        ? '#ccc'
                        : '#1976d2',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor:
                      bybitWithdrawAsset === 'XRP'
                        ? !xrpBalance ||
                          xrpBalance === '로딩중' ||
                          xrpBalance.xrp == null ||
                          Number(xrpBalance.xrp) <= 0.25
                          ? 'not-allowed'
                          : 'pointer'
                        : !xrpBalance ||
                          xrpBalance === '로딩중' ||
                          xrpBalance.usdtAvailable == null ||
                          Number(xrpBalance.usdtAvailable) <= 0
                        ? 'not-allowed'
                        : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  전부
                </button>
              </div>
            </label>
            <button
              type="submit"
              disabled={
                bybitWithdrawLoading ||
                upbitDepositAddresses.filter((a) => a.currency === bybitWithdrawAsset).length === 0 ||
                !bybitWithdrawDepositValue ||
                !xrpBalance ||
                xrpBalance === '로딩중'
              }
              style={{
                padding: '8px 14px',
                backgroundColor:
                  bybitWithdrawLoading ||
                  upbitDepositAddresses.filter((a) => a.currency === bybitWithdrawAsset).length === 0 ||
                  !bybitWithdrawDepositValue ||
                  !xrpBalance ||
                  xrpBalance === '로딩중'
                    ? '#999'
                    : '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor:
                  bybitWithdrawLoading ||
                  upbitDepositAddresses.filter((a) => a.currency === bybitWithdrawAsset).length === 0 ||
                  !bybitWithdrawDepositValue ||
                  !xrpBalance ||
                  xrpBalance === '로딩중'
                    ? 'not-allowed'
                    : 'pointer',
                fontWeight: 'bold',
              }}
            >
              {bybitWithdrawLoading
                ? '출금 중...'
                : `Bybit → 업비트 ${bybitWithdrawAsset} 출금`}
            </button>
          </form>
        </div>
      </div>
      {message && (
        <p style={{ color: message.type === 'error' ? '#c62828' : '#2e7d32', marginTop: 16 }}>
          {message.text}
        </p>
      )}
      {lastOrderId && (
        <p style={{ marginTop: 8 }}>
          <button
            type="button"
            disabled={orderStatusLoading}
            onClick={checkOrderStatus}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              backgroundColor: orderStatusLoading ? '#999' : '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: orderStatusLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {orderStatusLoading ? '조회 중...' : '주문 상태 확인'}
          </button>
          {remainderQty != null && remainderQty !== '' && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => {
                  setQty(remainderQty);
                  setRemainderQty(null);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  backgroundColor: '#2e7d32',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                나머지 수량({remainderQty})으로 주문
              </button>
            </>
          )}
        </p>
      )}
      <p style={{ marginTop: 32 }}>
        <a href="/">홈으로</a> · <a href="/trade">거래 설정</a>
      </p>
    </div>
  );
}
