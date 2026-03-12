/**
 * 차트 페이지만 PC와 동일한 너비로 렌더링 (폰에서도 PC처럼 보기)
 * viewport width 1024 → 모바일에서도 1024px 기준 레이아웃, 브라우저가 화면에 맞춰 축소
 */
export const viewport = {
  width: 1024,
  initialScale: 1,
  maximumScale: 2,
};

export default function ChartLayout({ children }) {
  return children;
}
