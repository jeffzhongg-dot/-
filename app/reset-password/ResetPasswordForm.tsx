'use client';
import { useEffect, useRef, useState } from 'react';
import { recoveryCredentials, type RecoveryCredentials } from '../../lib/recovery-link';

export default function ResetPasswordForm() {
  const token = useRef<RecoveryCredentials | null>(null);
  const initialized = useRef(false);
  const [stage, setStage] = useState<'loading'|'verify'|'password'|'done'|'invalid'>('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const credentials = recoveryCredentials(window.location.hash);
    // Strip recovery credentials immediately; they never go into a server URL.
    window.history.replaceState(null, '', '/reset-password');
    if (credentials) {
      token.current = credentials; setStage('verify');
    } else { setStage('invalid'); setError('恢复链接已过期或格式无效。请申请并打开最新恢复邮件，不要重复点击已失效的链接。'); }
  }, []);
  async function post(path: string, body: object) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '操作未完成，请重试。');
  }
  return <main style={{maxWidth: 480, margin: '10vh auto', padding: 24}}>
    <div className="eyebrow">PRIVATE CAREER WORKSPACE</div><h1>设置新密码</h1>
    <p className="subtitle">仅本人账号可用。保留原账号与资料，资料验证锁继续生效。</p>
    <section className="panel section"><div className="panel-body">
      {stage === 'loading' && <p>正在读取恢复链接…</p>}
      {stage === 'verify' && <><p>点击确认后验证这封邮件的恢复链接。链接只能使用一次。</p><button className="btn primary" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await post('/api/auth/recovery', token.current!); token.current = null; setStage('password'); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
      }}>{busy ? '正在验证…' : '验证本人恢复链接'}</button></>}
      {stage === 'password' && <form onSubmit={async e => {
        e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
        const password = String(data.get('password')); const confirm = String(data.get('confirm'));
        if (password !== confirm) {setError('两次输入的密码不一致。'); return;}
        setBusy(true); setError('');
        try { await post('/api/auth/password', {password}); form.reset(); setStage('done'); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
      }}>
        <label><span className="label">新密码（16–128 位）</span><input className="editor-field" name="password" type="password" minLength={16} maxLength={128} required autoComplete="new-password" disabled={busy}/></label>
        <label><span className="label" style={{marginTop: 18}}>再次输入新密码</span><input className="editor-field" name="confirm" type="password" minLength={16} maxLength={128} required autoComplete="new-password" disabled={busy}/></label>
        <button className="btn primary" style={{marginTop: 20}} disabled={busy}>{busy ? '正在保存…' : '保存新密码'}</button>
      </form>}
      {error && <p className="notice error section" role="alert">{error}</p>}
      {stage === 'done' && <p role="status">密码更新成功。请使用原邮箱与新密码重新登录。</p>}
      <p className="section"><a href="/login">返回登录页面</a></p>
    </div></section>
  </main>;
}
