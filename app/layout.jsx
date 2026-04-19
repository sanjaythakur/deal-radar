import './globals.css';

export const metadata = {
  title: 'Deal-Radar',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
