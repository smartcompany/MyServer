/**
 * 차트 페이지: 모바일에서 일반 웹처럼 보이도록 device-width 사용, 핀치 줌 허용
 */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function ChartLayout({ children }) {
  return children;
}
