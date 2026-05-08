import './globals.css';
import AppShell from '../components/AppShell';

export const metadata = {
  title: 'Studio PM',
  description: '3D Animation Studio Project Management',
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
