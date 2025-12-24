'use client';

import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [status, setStatus] = useState({
    cpu_percent: '-',
    memory: '-',
    disk: '-',
    temp: '-'
  });

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch('/api/dashboard/status');
        const data = await res.json();
        setStatus(data);
      } catch (error) {
        console.error('상태 로드 실패:', error);
      }
    }

    loadStatus();
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      fontFamily: 'sans-serif',
      margin: 0,
      padding: '20px',
      maxWidth: '600px',
      marginLeft: 'auto',
      marginRight: 'auto',
      backgroundColor: '#fdfdfd'
    }}>
      <h1 style={{
        textAlign: 'center',
        fontSize: '1.8em',
        marginBottom: '20px'
      }}>Raspberry Pi 상태</h1>
      <ul style={{
        listStyle: 'none',
        padding: 0
      }}>
        <li style={{
          fontSize: '1.2em',
          padding: '12px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          CPU 사용률: <span style={{ fontWeight: 'bold' }}>{status.cpu_percent}</span>%
        </li>
        <li style={{
          fontSize: '1.2em',
          padding: '12px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          메모리 사용률: <span style={{ fontWeight: 'bold' }}>{status.memory}</span>%
        </li>
        <li style={{
          fontSize: '1.2em',
          padding: '12px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          디스크 사용률: <span style={{ fontWeight: 'bold' }}>{status.disk}</span>%
        </li>
        <li style={{
          fontSize: '1.2em',
          padding: '12px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          온도: <span style={{ fontWeight: 'bold' }}>{status.temp}</span>°C
        </li>
      </ul>
    </div>
  );
}

