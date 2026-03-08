export default function HomePage() {
  return (
    <div style={{
      fontFamily: 'sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1>Raspberry Pi Home Server</h1>
      <nav style={{
        display: 'flex',
        gap: '20px',
        justifyContent: 'center',
        marginTop: '40px'
      }}>
        <a href="/dashboard" style={{
          padding: '12px 24px',
          backgroundColor: '#4CAF50',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px'
        }}>대시보드</a>
        <a href="/trade" style={{
          padding: '12px 24px',
          backgroundColor: '#2196F3',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px'
        }}>거래 설정</a>
        <a href="/short1x" style={{
          padding: '12px 24px',
          backgroundColor: '#9C27B0',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px'
        }}>1x Short (XRP)</a>
        <a href="/chart" style={{
          padding: '12px 24px',
          backgroundColor: '#FF9800',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px'
        }} title="환율·USDT 차트">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          차트
        </a>
      </nav>
    </div>
  );
}

