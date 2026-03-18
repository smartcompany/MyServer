/**
 * 모바일에서도 페이지 스크롤이 되도록 device-width 사용.
 * (이전 width: 1024는 화면 고정·스크롤 불가 현상 유발)
 */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 2,
};

export default function ChartLayout({ children }) {
  return children;
}
