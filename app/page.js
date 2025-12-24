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
      </nav>
    </div>
  );
}

