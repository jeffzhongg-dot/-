'use client';
import { useState } from 'react';
export default function LoginForm({ configured, locked }: { configured: boolean; locked: boolean }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <main style={{ maxWidth: 440, margin: '12vh auto', padding: 24 }}><div className="eyebrow">PRIVATE CAREER WORKSPACE</div><h1>职途 · 私人求职工作台</h1><p className="subtitle">仅已授权的本人账号可以登录。此应用不开放注册。</p><section className="panel section"><div className="panel-body">
    {configured && locked && <div className="warning">部署验证锁已启用。只有在私人测试环境完成权限验证后，才能解锁资料功能。</div>}
    {!configured && <div className="warning">Supabase 尚未配置，应用已关闭资料访问。请先按部署说明创建项目、关闭公开注册并配置本人账号。</div>}
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      const form = new FormData(e.currentTarget);
      try {
        const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error);
        window.location.assign('/');
      } catch (e) { setError((e as Error).message || '登录失败，请重试。'); }
      finally { setBusy(false); }
    }}><label><span className="label" style={{ marginTop: 18 }}>本人账号邮箱</span><input name="email" className="editor-field" type="email" required autoComplete="username" disabled={!configured || busy}/></label><label><span className="label" style={{ marginTop: 18 }}>密码</span><input name="password" className="editor-field" type="password" required autoComplete="current-password" disabled={!configured || busy}/></label>{error && <div className="notice error section" role="alert">{error}</div>}<button className="btn primary" style={{ width: '100%', marginTop: 24 }} disabled={!configured || busy}>{busy ? '正在验证…' : '登录私人工作台'}</button></form>
    <p className="subtitle" style={{ fontSize: 12, marginTop: 18 }}>忘记密码请由本人在 Supabase 管理后台重设。未授权账号无法访问文件、档案或 AI 接口。</p>
  </div></section></main>;
}
