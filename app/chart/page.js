'use client';

import { useEffect, useRef, useState } from 'react';
import { Chart as ChartJS } from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

const parseDt = (s) => {
  if (!s) return null;
  const normalized = String(s).replace(' ', 'T').trim();
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
};

const upColor = '#ef4444';
const downColor = '#3b82f6';

// USDT 봉 몸통을 그리는 플러그인 (UsdKrwRate와 동일)
const candlestickBodiesPlugin = {
  id: 'candlestickBodies',
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins?.candlestickBodies;
    if (!opts?.data?.length) return;
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y1;
    if (!xScale || !yScale) return;
    const data = opts.data;
    const minBarWidth = 2;
    const maxBarWidth = 12;
    const count = data.length;
    const barWidth = Math.max(
      minBarWidth,
      Math.min(maxBarWidth, (xScale.width / Math.max(count, 1)) * 0.6)
    );
    data.forEach((d) => {
      if (d == null || d.x == null) return;
      const low = Array.isArray(d.y)
        ? d.y[0]
        : d.o != null && d.c != null
          ? Math.min(d.o, d.c)
          : null;
      const high = Array.isArray(d.y)
        ? d.y[1]
        : d.o != null && d.c != null
          ? Math.max(d.o, d.c)
          : null;
      if (low == null || high == null) return;
      const x = xScale.getPixelForValue(d.x);
      const yTop = yScale.getPixelForValue(high);
      const yBottom = yScale.getPixelForValue(low);
      const color =
        d.c != null && d.o != null && d.c >= d.o ? upColor : downColor;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x - barWidth / 2, yTop, barWidth, yBottom - yTop);
      ctx.fill();
      ctx.stroke();
    });
  },
};

ChartJS.register(candlestickBodiesPlugin);

// 차트 영역 밖으로 선/봉이 그려지지 않도록 클리핑
const chartAreaClipPlugin = {
  id: 'chartAreaClip',
  beforeDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const area = chart.chartArea;
    if (!area) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();
  },
  afterDatasetsDraw(chart) {
    chart.ctx.restore();
  },
};

ChartJS.register(chartAreaClipPlugin);

// 마우스/터치로 선택한 위치에 세로·가로 점선(크로스헤어) 그리기
const verticalCrosshairPlugin = {
  id: 'verticalCrosshair',
  afterDatasetsDraw(chart) {
    const area = chart.chartArea;
    if (!area) return;
    const opts = chart.options.plugins?.verticalCrosshair || {};
    const x = opts.x;
    const y = opts.y;
    const ctx = chart.ctx;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(161, 161, 170, 0.8)';
    ctx.lineWidth = 1;
    if (typeof x === 'number' && x >= area.left && x <= area.right) {
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
    }
    if (typeof y === 'number' && y >= area.top && y <= area.bottom) {
      ctx.beginPath();
      ctx.moveTo(area.left, y);
      ctx.lineTo(area.right, y);
      ctx.stroke();
    }
    ctx.restore();
  },
};

ChartJS.register(verticalCrosshairPlugin);

export default function ChartPage() {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [status, setStatus] = useState('로딩 중…');
  const [error, setError] = useState(null);
  const [crosshairData, setCrosshairData] = useState(null); // { x, y, value, dateLabel }
  const setCrosshairDataRef = useRef(setCrosshairData);
  setCrosshairDataRef.current = setCrosshairData;
  /** (px, py)는 캔버스 기준 좌표. 플롯 영역(chartArea) 안이면 true */
  const isPointInChartAreaRef = useRef(() => false);

  useEffect(() => {
    let chart = chartRef.current;
    const zoomFactor = 0.75;

    async function load() {
      try {
        setError(null);
        const res = await fetch('/api/chart/data');
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || res.statusText);
        }
        const { usdKrw, usdt } = await res.json();

        const usdPoints = (usdKrw?.series || [])
          .map((s) => ({ x: parseDt(s.datetime), y: s.usd_krw }))
          .filter((p) => p.x != null && p.y != null);

        const usdtBars = (usdt?.series || [])
          .map((s) => {
            const x = parseDt(s.datetime);
            if (x == null || s.open == null || s.close == null) return null;
            const o = Number(s.open);
            const c = Number(s.close);
            return { x, y: [Math.min(o, c), Math.max(o, c)], o, c };
          })
          .filter(Boolean);

        if (!usdPoints.length && !usdtBars.length) {
          setStatus('표시할 데이터가 부족합니다.');
          return;
        }

        setStatus(
          `USD/KRW ${usdKrw?.start_date || '-'}~${usdKrw?.end_date || '-'} · USDT ${usdt?.start_date || '-'}~${usdt?.end_date || '-'}`
        );

        let y1Min = Infinity,
          y1Max = -Infinity;
        usdtBars.forEach((b) => {
          const [low, high] = b.y;
          if (low < y1Min) y1Min = low;
          if (high > y1Max) y1Max = high;
        });
        const y1Padding = (y1Max - y1Min) * 0.02 || 1;
        if (y1Min === Infinity) y1Min = 0;
        if (y1Max === -Infinity) y1Max = 1500;
        y1Min -= y1Padding;
        y1Max += y1Padding;

        const allDates = [...usdPoints, ...usdtBars]
          .map((p) => p.x.getTime())
          .filter((t) => !Number.isNaN(t));
        if (!allDates.length) return;
        const xMinFull = Math.min(...allDates);
        const xMaxFull = Math.max(...allDates);
        let visibleMin = xMinFull;
        let visibleMax = xMaxFull;

        if (chartRef.current) chart?.destroy();

        chart = new ChartJS(canvasRef.current, {
          type: 'line',
          data: {
            datasets: [
              {
                label: 'USD/KRW',
                data: usdPoints,
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4,
                yAxisID: 'y',
                order: 2,
              },
              {
                label: 'USDT/KRW (봉)',
                data: usdtBars,
                borderColor: 'transparent',
                backgroundColor: (ctx) => {
                  const r = ctx.raw;
                  if (r == null || r.o == null || r.c == null) return downColor;
                  return r.c >= r.o ? upColor : downColor;
                },
                borderWidth: 0,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: (ctx) => {
                  const r = ctx.raw;
                  if (r == null || r.o == null || r.c == null) return downColor;
                  return r.c >= r.o ? upColor : downColor;
                },
                fill: false,
                tension: 0,
                yAxisID: 'y1',
                order: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              candlestickBodies: { data: usdtBars },
              legend: {
                display: true,
                labels: { color: '#a1a1aa', usePointStyle: true },
              },
              tooltip: {
                backgroundColor: 'rgba(24, 24, 27, 0.88)',
                titleColor: '#e4e4e7',
                bodyColor: '#e4e4e7',
                borderColor: 'rgba(39, 39, 42, 0.9)',
                borderWidth: 1,
                callbacks: {
                  title: (items) => {
                    if (!items.length || !items[0].raw) return '';
                    const x = items[0].raw.x;
                    if (x instanceof Date)
                      return x.toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                    return '';
                  },
                  label: () => '',
                  afterBody: (items) => {
                    if (!items.length) return [];
                    const raw = items[0].raw;
                    const x = raw?.x;
                    if (!x) return [];
                    const t = x instanceof Date ? x.getTime() : Number(x);
                    let usdVal = null;
                    let usdtO = null,
                      usdtC = null;
                    let minUsd = Infinity,
                      minUsdt = Infinity;
                    usdPoints.forEach((p) => {
                      const d = Math.abs(
                        (p.x instanceof Date ? p.x.getTime() : p.x) - t
                      );
                      if (d < minUsd) {
                        minUsd = d;
                        usdVal = p.y;
                      }
                    });
                    usdtBars.forEach((p) => {
                      const d = Math.abs(
                        (p.x instanceof Date ? p.x.getTime() : p.x) - t
                      );
                      if (d < minUsdt) {
                        minUsdt = d;
                        usdtO = p.o;
                        usdtC = p.c;
                      }
                    });
                    const lines = [];
                    if (usdVal != null)
                      lines.push(
                        'USD/KRW: ' +
                          Number(usdVal).toLocaleString('ko-KR') +
                          ' 원'
                      );
                    if (usdtC != null)
                      lines.push(
                        'USDT 종가: ' +
                          Number(usdtC).toLocaleString('ko-KR') +
                          ' 원'
                      );
                    if (usdtO != null)
                      lines.push(
                        'USDT 시가: ' +
                          Number(usdtO).toLocaleString('ko-KR') +
                          ' 원'
                      );
                    if (usdVal != null && usdtC != null) {
                      const gimp = usdtC - usdVal;
                      const gimpPct = (gimp / usdVal) * 100;
                      const sign = gimp >= 0 ? '+' : '';
                      lines.push(
                        '김프: ' +
                          sign +
                          Number(gimp).toFixed(2) +
                          ' 원 (' +
                          sign +
                          Number(gimpPct).toFixed(2) +
                          '%)'
                      );
                    }
                    return lines;
                  },
                },
              },
            },
            scales: {
              x: {
                type: 'time',
                min: visibleMin,
                max: visibleMax,
                time: {
                  unit: 'day',
                  displayFormats: {
                    hour: 'HH:mm',
                    day: 'M/d',
                    week: 'M/d',
                    month: 'yyyy/M',
                  },
                },
                grid: { color: '#27272a' },
                ticks: { color: '#71717a', maxTicksLimit: 12 },
              },
              y: {
                type: 'linear',
                position: 'left',
                grid: { color: '#27272a', drawOnChartArea: true },
                ticks: {
                  color: '#71717a',
                  callback: (v) => v?.toLocaleString('ko-KR'),
                },
                title: {
                  display: true,
                  text: 'USD/KRW',
                  color: '#a78bfa',
                },
              },
              y1: {
                type: 'linear',
                position: 'right',
                min: y1Min,
                max: y1Max,
                grid: { drawOnChartArea: false },
                ticks: {
                  color: '#71717a',
                  callback: (v) => v?.toLocaleString('ko-KR'),
                },
                title: {
                  display: true,
                  text: 'USDT/KRW',
                  color: '#94a3b8',
                },
              },
            },
          },
        });

        chartRef.current = chart;

        // 선택된 위치에 크로스헤어와 라벨 정보 설정
        const updateCrosshair = (px, py) => {
          if (!chart?.options?.plugins) return;
          chart.options.plugins.verticalCrosshair = { x: px, y: py };
          chart.update('none');
          const yScale = chart.scales?.y1;
          const xScale = chart.scales?.x;
          let value = null;
          let dateLabel = '';
          if (yScale && typeof py === 'number') {
            const v = yScale.getValueForPixel(py);
            if (v != null && !Number.isNaN(v)) value = v;
          }
          if (xScale && typeof px === 'number') {
            const v = xScale.getValueForPixel(px);
            const d = v instanceof Date ? v : v != null ? new Date(v) : null;
            if (d && !Number.isNaN(d.getTime())) {
              dateLabel = d.toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
              });
            }
          }
          setCrosshairDataRef.current?.(
            value == null && !dateLabel ? null : { x: px, y: py, value, dateLabel }
          );
        };

        const clearCrosshair = () => {
          if (chart?.options?.plugins) chart.options.plugins.verticalCrosshair = { x: null, y: null };
          if (chart) chart.update('none');
          setCrosshairDataRef.current?.(null);
        };

        isPointInChartAreaRef.current = (px, py) => {
          const ch = chartRef.current;
          if (!ch?.chartArea) return false;
          const a = ch.chartArea;
          return px >= a.left && px <= a.right && py >= a.top && py <= a.bottom;
        };

        const applyZoom = () => {
          if (!chart) return;
          chart.options.scales.x.min = chart.options.scales.x.min;
          chart.options.scales.x.max = chart.options.scales.x.max;
          chart.update('none');
        };

        const zoomInBtn = document.getElementById('chartZoomIn');
        const zoomOutBtn = document.getElementById('chartZoomOut');
        if (zoomInBtn) {
          zoomInBtn.onclick = () => {
            const span = visibleMax - visibleMin;
            const center = visibleMin + span / 2;
            const newSpan = Math.max(
              span * zoomFactor,
              (xMaxFull - xMinFull) * 0.05
            );
            visibleMin = Math.max(xMinFull, center - newSpan / 2);
            visibleMax = Math.min(xMaxFull, center + newSpan / 2);
            chart.options.scales.x.min = visibleMin;
            chart.options.scales.x.max = visibleMax;
            chart.update('none');
          };
        }
        if (zoomOutBtn) {
          zoomOutBtn.onclick = () => {
            const span = visibleMax - visibleMin;
            const center = visibleMin + span / 2;
            const newSpan = Math.min(span / zoomFactor, xMaxFull - xMinFull);
            visibleMin = Math.max(xMinFull, center - newSpan / 2);
            visibleMax = Math.min(xMaxFull, center + newSpan / 2);
            chart.options.scales.x.min = visibleMin;
            chart.options.scales.x.max = visibleMax;
            chart.update('none');
          };
        }

        let isPanning = false;
        let isCrosshair = false;
        let panStartX = 0;
        let panStartMin = 0;
        let panStartMax = 0;
        let isCrosshairVisible = false; // 점선이 켜져 있는지 (클릭으로 토글)
        let leftMouseDown = false;
        let mouseStartedInChartArea = false;
        let dragMode = null; // null | 'pan' | 'crosshair'
        let startX = 0;
        let startY = 0;
        let crosshairVisibleAtDown = false;
        const DRAG_THRESHOLD_PX = 5;
        let touchDragMode = null;
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartedOnChart = false;
        let crosshairVisibleAtTouchStart = false;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.onmousedown = (e) => {
            if (e.button === 0) {
              const rect = canvas.getBoundingClientRect();
              const px = e.clientX - rect.left;
              const py = e.clientY - rect.top;
              mouseStartedInChartArea = isPointInChartAreaRef.current(px, py);
              leftMouseDown = true;
              dragMode = null;
              startX = e.clientX;
              startY = e.clientY;
              crosshairVisibleAtDown = isCrosshairVisible;
              panStartX = e.clientX;
              panStartMin = visibleMin;
              panStartMax = visibleMax;
            } else if (e.button === 2) {
              const rect = canvas.getBoundingClientRect();
              const px = e.clientX - rect.left;
              const py = e.clientY - rect.top;
              if (isPointInChartAreaRef.current(px, py)) {
                isCrosshair = true;
                isCrosshairVisible = true;
                updateCrosshair(px, py);
              }
            }
          };
          canvas.oncontextmenu = (e) => e.preventDefault();
          // 터치: 탭=점선 토글, 드래그=점선 있을 때 점선 이동 / 없을 때 패닝
          canvas.ontouchstart = (e) => {
            if (e.touches.length === 0) return;
            if (e.touches.length >= 2) return;
            const rect = canvas.getBoundingClientRect();
            const px = e.touches[0].clientX - rect.left;
            const py = e.touches[0].clientY - rect.top;
            touchStartedOnChart = isPointInChartAreaRef.current(px, py);
            touchDragMode = null;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            crosshairVisibleAtTouchStart = isCrosshairVisible;
            panStartX = e.touches[0].clientX;
            panStartMin = visibleMin;
            panStartMax = visibleMax;
            e.preventDefault();
          };
        }
        const onTouchMove = (e) => {
          if (e.touches.length === 0) return;
          if (e.touches.length >= 2) return;
          if (!touchStartedOnChart) return;
          const tx = e.touches[0].clientX;
          const ty = e.touches[0].clientY;
          if (touchDragMode === null && chart) {
            const dx = tx - touchStartX;
            const dy = ty - touchStartY;
            if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
              if (crosshairVisibleAtTouchStart) {
                touchDragMode = 'crosshair';
                isCrosshair = true;
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) updateCrosshair(tx - rect.left, ty - rect.top);
              } else {
                touchDragMode = 'pan';
                isPanning = true;
              }
            }
          }
          if (touchDragMode === 'crosshair' && isCrosshair && chart) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) updateCrosshair(tx - rect.left, ty - rect.top);
            e.preventDefault();
            return;
          }
          if (touchDragMode === 'pan' && isPanning && chart) {
            const xScale = chart.scales.x;
            if (xScale && xScale.width > 0) {
              const deltaX = tx - panStartX;
              const span = panStartMax - panStartMin;
              const timeDelta = (deltaX / xScale.width) * span;
              let newMin = panStartMin - timeDelta;
              let newMax = panStartMax - timeDelta;
              if (newMin < xMinFull) {
                newMin = xMinFull;
                newMax = Math.min(xMaxFull, newMin + span);
              }
              if (newMax > xMaxFull) {
                newMax = xMaxFull;
                newMin = Math.max(xMinFull, newMax - span);
              }
              visibleMin = newMin;
              visibleMax = newMax;
              chart.options.scales.x.min = visibleMin;
              chart.options.scales.x.max = visibleMax;
              chart.update('none');
            }
            e.preventDefault();
          }
        };
        const onTouchEnd = (e) => {
          if (e.touches.length === 0) {
            if (touchDragMode === null && chart && touchStartedOnChart) {
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect && e.changedTouches?.[0]) {
                const ct = e.changedTouches[0];
                const px = ct.clientX - rect.left;
                const py = ct.clientY - rect.top;
                if (isCrosshairVisible) {
                  isCrosshairVisible = false;
                  clearCrosshair();
                } else {
                  isCrosshairVisible = true;
                  updateCrosshair(px, py);
                }
              }
            }
            touchDragMode = null;
            isPanning = false;
            isCrosshair = false;
            touchStartedOnChart = false;
          }
        };
        const onTouchCancel = (e) => {
          if (e.touches.length === 0) {
            touchDragMode = null;
            isPanning = false;
            isCrosshair = false;
            touchStartedOnChart = false;
          }
        };
        const onMouseMove = (e) => {
          if (!mouseStartedInChartArea) return;
          if (isCrosshair && chart) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) updateCrosshair(e.clientX - rect.left, e.clientY - rect.top);
            return;
          }
          if (leftMouseDown && dragMode === null && chart) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
              if (crosshairVisibleAtDown) {
                dragMode = 'crosshair';
                isCrosshair = true;
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) updateCrosshair(e.clientX - rect.left, e.clientY - rect.top);
              } else {
                dragMode = 'pan';
                isPanning = true;
              }
            }
          }
          if (dragMode === 'crosshair' && isCrosshair && chart) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) updateCrosshair(e.clientX - rect.left, e.clientY - rect.top);
            return;
          }
          if (!isPanning || !chart) return;
          const xScale = chart.scales.x;
          if (!xScale || xScale.width <= 0) return;
          const span = panStartMax - panStartMin;
          const deltaX = e.clientX - panStartX;
          const timeDelta = (deltaX / xScale.width) * span;
          let newMin = panStartMin - timeDelta;
          let newMax = panStartMax - timeDelta;
          if (newMin < xMinFull) {
            newMin = xMinFull;
            newMax = Math.min(xMaxFull, newMin + span);
          }
          if (newMax > xMaxFull) {
            newMax = xMaxFull;
            newMin = Math.max(xMinFull, newMax - span);
          }
          visibleMin = newMin;
          visibleMax = newMax;
          chart.options.scales.x.min = visibleMin;
          chart.options.scales.x.max = visibleMax;
          chart.update('none');
        };
        const onMouseUp = (e) => {
          if (e?.button === 0) {
            if (dragMode === null && leftMouseDown && chart && mouseStartedInChartArea) {
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) {
                const px = e.clientX - rect.left;
                const py = e.clientY - rect.top;
                if (isCrosshairVisible) {
                  // 토글로 숨김
                  isCrosshairVisible = false;
                  clearCrosshair();
                } else {
                  isCrosshairVisible = true;
                  updateCrosshair(px, py);
                }
              }
            }
            leftMouseDown = false;
            dragMode = null;
            isPanning = false;
            isCrosshair = false;
          }
          if (e?.button === 2) {
            isCrosshair = false;
            if (!isCrosshairVisible) {
              clearCrosshair();
            }
          }
          if (e?.button === undefined) {
            leftMouseDown = false;
            dragMode = null;
            isPanning = false;
            isCrosshair = false;
            clearCrosshair();
          }
        };
        const onMouseLeave = () => {
          leftMouseDown = false;
          dragMode = null;
          isPanning = false;
          if (isCrosshair && !isCrosshairVisible) {
            clearCrosshair();
          }
          isCrosshair = false;
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('mouseleave', onMouseLeave);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
        window.addEventListener('touchcancel', onTouchCancel);

        const onResize = () => {
          if (chart) chart.resize();
        };
        const onOrientationChange = () => {
          setTimeout(onResize, 150);
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onOrientationChange);

        return () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          window.removeEventListener('mouseleave', onMouseLeave);
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
          window.removeEventListener('touchcancel', onTouchCancel);
          window.removeEventListener('resize', onResize);
          window.removeEventListener('orientationchange', onOrientationChange);
        };
      } catch (e) {
        setError('로드 실패: ' + (e.message || String(e)));
      }
    }

    load();
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div
      style={{
        fontFamily: '"Pretendard", "Segoe UI", sans-serif',
        margin: 0,
        padding: '1rem',
        background: '#0f0f12',
        color: '#e4e4e7',
        minHeight: '100vh',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
        USD/KRW & USDT 환율 비교
      </h1>
      <p
        style={{
          color: '#71717a',
          fontSize: '0.875rem',
          marginBottom: '1rem',
        }}
      >
        USD/KRW 라인 · USDT 봉차트 (상승 빨강 / 하락 파랑) · 클릭으로 점선 켜기/끄기 · 점선 있을 때 드래그=점선 이동, 없을 때 드래그=차트 좌우 이동 · +/− 줌
      </p>
      <div
        style={{
          background: '#18181b',
          borderRadius: 12,
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid #27272a',
          width: '100%',
          maxWidth: '100vw',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            position: 'relative',
            maxHeight: 420,
            width: '100%',
            minWidth: 0,
            overflow: 'hidden',
            borderRadius: 8,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              maxHeight: 420,
              cursor: 'grab',
              display: 'block',
            }}
          />
          {crosshairData && (
            <>
              {/* 오른쪽 Y축 가격 라벨 */}
              <div
                style={{
                  position: 'absolute',
                  right: 6,
                  top: crosshairData.y,
                  transform: 'translateY(-50%)',
                  padding: '2px 6px',
                  background: 'rgba(24,24,27,0.9)',
                  borderRadius: 4,
                  border: '1px solid rgba(39,39,42,0.9)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#e4e4e7',
                  pointerEvents: 'none',
                }}
              >
                {crosshairData.value != null
                  ? `${Number(crosshairData.value).toLocaleString('ko-KR')} 원`
                  : '—'}
              </div>
              {/* 아래쪽 날짜/시간 라벨 */}
              <div
                style={{
                  position: 'absolute',
                  left: crosshairData.x,
                  bottom: 4,
                  transform: 'translateX(-50%)',
                  padding: '2px 6px',
                  background: 'rgba(24,24,27,0.9)',
                  borderRadius: 4,
                  border: '1px solid rgba(39,39,42,0.9)',
                  fontSize: '0.75rem',
                  color: '#a1a1aa',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {crosshairData.dateLabel || '—'}
              </div>
            </>
          )}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 12,
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 10,
              background: 'rgba(24, 24, 27, 0.75)',
              border: '1px solid rgba(39, 39, 42, 0.8)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <button
              id="chartZoomOut"
              type="button"
              title="줌 아웃"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid rgba(39, 39, 42, 0.9)',
                background: 'rgba(39, 39, 42, 0.7)',
                color: '#e4e4e7',
                fontSize: '1.25rem',
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              −
            </button>
            <button
              id="chartZoomIn"
              type="button"
              title="줌 인"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid rgba(39, 39, 42, 0.9)',
                background: 'rgba(39, 39, 42, 0.7)',
                color: '#e4e4e7',
                fontSize: '1.25rem',
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              +
            </button>
          </div>
        </div>
        <p
          style={{
            marginTop: '0.5rem',
            color: error ? '#f87171' : '#71717a',
            fontSize: '0.875rem',
          }}
        >
          {error || status}
        </p>
      </div>
    </div>
  );
}
