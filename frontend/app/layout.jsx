import './globals.css';
import AppShell from '../components/AppShell';

export const metadata = {
  title: 'multi.design studio',
  description: 'multi.design studio — 專案管理',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
