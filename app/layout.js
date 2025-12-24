export const metadata = {
  title: 'Raspberry Pi Server',
  description: 'Raspberry Pi Home Server',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

