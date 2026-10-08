import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas', 'adm-zip'],
  poweredByHeader: false,
  agentRules: false,
  allowedDevOrigins: ['127.0.0.1'],
  outputFileTracingExcludes: { '*': ['./.data/**', './.env*', './tests/**', './test-results/**', './playwright-report/**'] },
  async headers() {
    let storageOrigin = '';
    try { const url=new URL(process.env.SUPABASE_URL || ''); if(url.protocol==='https:' || process.env.VERCEL!=='1' && ['localhost','127.0.0.1'].includes(url.hostname)) storageOrigin=url.origin; } catch { /* no external origins when unconfigured */ }
    return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Cache-Control', value: 'no-store' },
    { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: ${storageOrigin}; connect-src 'self' ${storageOrigin}; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` }
  ] }] }
};
export default config;
