import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '职途 · AI 求职助手', description: '从真实经历出发，整理你的职业能力与作品证据。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
