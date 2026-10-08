'use client';
import { useEffect, useRef, useState } from 'react';
import { Category, Document, Profile, State, emptyState, labels } from '../lib/types';

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    spark: <><path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z"/></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
    file: <><path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8m-8 4h6"/></>,
    person: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-3c0-4 16-4 16 0v3"/></>,
    case: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/></>,
    chart: <><path d="M4 3v18h17M8 16v-4m5 4V8m5 8V5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
    arrow: <path d="M4 12h16m-5-5 5 5-5 5"/>,
    download: <><path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}
type View = 'upload' | 'pages' | 'profile';
export default function Workspace() {
  const [state, setState] = useState<State>(emptyState);
  const [view, setView] = useState<View>('upload');
  const [kind, setKind] = useState<'resume' | 'portfolio'>('resume');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [docId, setDocId] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [consent, setConsent] = useState(false);
  const [drag, setDrag] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch('/api/profile').then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setState(body.state); setAiConfigured(body.aiConfigured); setDocId(body.state.documents[0]?.id || '');
    }).catch(e => setMessage({ text: e.message || '无法加载档案，请重试。', error: true })).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => { if (dirty || busy) e.preventDefault(); };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, busy]);
  const document = state.documents.find(d => d.id === docId) || state.documents[0];
  const page = document?.pages.find(p => p.number === pageNum) || document?.pages[0];
  const evidenceCount = Object.keys(labels).reduce((n, key) => n + state.profile[key as Category].length, 0);
  const confirmed = Object.keys(labels).reduce((n, key) => n + state.profile[key as Category].filter(e => e.status === '已确认').length, 0);
  async function upload(file?: File) {
    if (!file || busy || loading) return;
    if (dirty) { setMessage({ text: '请先保存档案修改，再上传新文件。', error: true }); return; }
    if (file.size > 15 * 1024 * 1024) { setMessage({ text: '单个文件最大 15 MB。', error: true }); return; }
    setBusy('正在准备私有上传…'); setMessage(null);
    try {
      const prepared = await fetch('/api/documents/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({name:file.name,size:file.size,kind}) });
      const body=await prepared.json();if(!prepared.ok) throw new Error(body.error);
      setBusy('正在上传原件到私有存储…');
      const uploaded=await fetch(body.uploadUrl,{method:'PUT',headers:{'Content-Type':body.contentType,'x-upsert':'false','cache-control':'max-age=0'},body:file});
      if(!uploaded.ok) throw new Error('私有上传失败。请检查网络；资料记录会保留，可删除后重试。');
      await processDocument(body.id);
      setDocId(body.id);setPageNum(1);setConsent(false);
      setMessage({text:'解析完成。原件已保存在你的私有存储，请逐页核对原文，并确认或补充职业档案。'});
    } catch(e) {setMessage({text:(e as Error).message||'上传失败，请重试。',error:true}); await refreshState();}
    finally {setBusy('');if(fileInput.current) fileInput.current.value='';}
  }
  async function refreshState() {
    try {const response=await fetch('/api/profile');const body=await response.json();if(response.ok) setState(body.state);}catch{/* keep edits if network is temporarily unavailable */}
  }
  async function processDocument(id:string) {
    for(let batch=0;batch<20;batch++) {
      setBusy(`正在分批解析资料…第 ${batch+1} 批`);
      const response=await fetch('/api/documents/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const body=await response.json();if(!response.ok) throw new Error(body.error);
      setState(body.state);if(body.done) return;
      setBusy(`已解析 ${body.parsed} / ${body.total} 页，继续处理…`);
    }
    throw new Error('解析尚未结束，请点击继续解析。');
  }
  async function resumeParse(id:string) {
    if(dirty) {setMessage({text:'请先保存档案修改。',error:true});return;}
    setMessage(null);
    try{await processDocument(id);setMessage({text:'解析已完成。'});}catch(e){setMessage({text:(e as Error).message,error:true});await refreshState();}finally{setBusy('');}
  }
  async function downloadOriginal(id:string) {
    try{const response=await fetch(`/api/documents/file?id=${id}`);const body=await response.json();if(!response.ok) throw new Error(body.error);window.location.assign(body.url);}
    catch(e){setMessage({text:(e as Error).message,error:true});}
  }
  async function removeDocument(id:string) {
    if(!window.confirm('确定删除此文件的原件、预览和解析结果吗？引用该文件的档案条目也会删除。')) return;
    if(dirty){setMessage({text:'请先保存档案修改。',error:true});return;}
    setBusy('正在删除私有资料…');
    try{const response=await fetch('/api/documents',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const body=await response.json();if(!response.ok) throw new Error(body.error);setState(body.state);setMessage({text:'文件及其相关档案条目已删除。'});}
    catch(e){setMessage({text:(e as Error).message,error:true});await refreshState();}finally{setBusy('');}
  }
  function changeProfile(next: Profile) { setState(s => ({ ...s, profile: next })); setDirty(true); }
  async function saveProfile() {
    setBusy('正在保存档案…'); setMessage(null);
    try {
      const response = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({profile:state.profile,revision:state.revision||0}) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setState(body.state); setDirty(false); setMessage({ text: '职业档案已保存到你的私有数据库。登录后可重新查看。' });
    } catch (e) { setMessage({ text: (e as Error).message, error: true }); }
    finally { setBusy(''); }
  }
  async function analyze() {
    if (!document) return;
    if (dirty) { setMessage({ text: '请先保存档案修改，再运行 AI 分析。', error: true }); return; }
    setBusy('AI 正在逐页分析，可能需要数分钟，请勿关闭页面…'); setMessage(null);
    try {
      for(const page of document.pages.slice(0,12)) {
        setBusy(`AI 正在分析第 ${page.number} 页，请勿关闭页面…`);
        const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:document.id,page:page.number,consent})});
        const body=await response.json();if(body.state) setState(body.state);if(!response.ok) throw new Error(body.error);
      }
      setMessage({ text: 'AI 分析已保存。结果为待核实建议，不会自动写入已确认的职业经历。' });
    } catch (e) { setMessage({ text: (e as Error).message, error: true }); }
    finally { setBusy(''); }
  }
  async function clear() {
    if (!window.confirm('确定删除你的全部原件、解析内容、页面图片和职业档案吗？此操作无法恢复。')) return;
    setBusy('正在清空资料…');
    try {
      for(let request=0;request<6;request++) {
        const response=await fetch('/api/reset',{method:'DELETE'});const body=await response.json();if(!response.ok) throw new Error(body.error);if(body.done) break;if(request===5) throw new Error('尚未完成清空，请重试。');
      }
      setState(emptyState()); setDocId(''); setPageNum(1); setDirty(false); setView('upload');
      setMessage({ text: '你的原件、解析内容、图片与档案已删除。' });
    } catch (e) { setMessage({ text: (e as Error).message, error: true }); }
    finally { setBusy(''); }
  }
  function exportProfile() {
    const blob = new Blob([JSON.stringify({ ...state.profile, exportedAt: new Date().toISOString(), warning: '含个人信息，请妥善保管。待核实条目不代表已经确认的事实。' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = window.document.createElement('a'); a.href = url; a.download = '职业能力档案.json'; a.click(); URL.revokeObjectURL(url);
  }
  function openDoc(doc: Document) { setDocId(doc.id); setPageNum(1); setConsent(false); setView('pages'); }
  return <>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Icon name="spark" size={23}/></span>职途<span style={{ color: '#8aaa97', fontSize: 13, letterSpacing: 0 }}>AI</span></div>
      <div className="brand-sub">JOB SEARCH AGENT</div>
      <div className="nav-caption">我的求职工作台</div>
      <nav aria-label="主导航">
        <button className={`nav-item ${view !== 'profile' ? 'active' : ''}`} onClick={() => setView('upload')}><Icon name="file"/>资料与作品集</button>
        <button className={`nav-item ${view === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}><Icon name="person"/>职业能力档案{dirty && <span aria-label="未保存">•</span>}</button>
        <button className="nav-item" disabled><Icon name="case"/>岗位收藏<span className="soon">待开发</span></button>
        <button className="nav-item" disabled><Icon name="chart"/>每日推荐<span className="soon">待开发</span></button>
      </nav>
      <div className="sidebar-foot"><Icon name="shield" size={20}/><strong>让每段经历都有依据</strong>从真实的职业故事出发，<br/>找到与你契合的下一站。</div>
    </aside>
    <main className="main">
      <header className="topbar"><span>我的工作台 <span style={{ margin: '0 10px', color: '#c0c7c2' }}>/</span> {view === 'profile' ? '职业能力档案' : '资料与作品集'}</span><div className="topbar-right"><span>{aiConfigured ? 'AI 服务已配置' : '原文解析模式'}</span><button className="btn" disabled={!!busy} onClick={async()=>{if(dirty&&!window.confirm('还有未保存修改，确定退出？')) return;const res=await fetch('/api/auth/logout',{method:'POST'});if(res.ok)window.location.assign('/login');else setMessage({text:'退出失败，请重试。',error:true});}}>退出登录</button><span className="avatar">我</span></div></header>
      <div className="workspace">
        <div className="title-row"><div><div className="eyebrow">YOUR CAREER, WITH EVIDENCE</div><h1>{view === 'profile' ? '你的经历，值得被看见' : '从了解你开始，找到更好的机会'}</h1><p className="subtitle">上传简历与作品集，整理真实经历，让每一次申请更有底气。</p></div><span className="stage-tag">第一阶段 · 职业能力建档</span></div>
        <div className="steps">
          {[['上传职业资料', 'PDF 简历 / PDF、PPTX 作品集'], ['解析与逐页核对', '保留来源，识别内容与局限'], ['完善能力档案', '确认、编辑并保存真实经历']].map(([title, sub], i) => <div key={title} className={`step ${i === (view === 'profile' ? 2 : view === 'pages' ? 1 : 0) ? 'active' : ''}`}><span className="step-num">{i + 1}</span><div><strong>{title}</strong><small>{sub}</small></div></div>)}
        </div>
        {loading && <div className="notice" role="status">正在加载你的私密档案…</div>}
        {busy && <div className="notice" role="status">{busy}</div>}
        {message && <div className={`notice ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</div>}
        {view === 'upload' && <>
          <div className="content-grid">
            <section className="panel"><div className="panel-head"><div><h2>上传你的职业资料</h2><p>你的下一段职业旅程，从这里开始</p></div><Icon name="upload"/></div>
              <div className="panel-body"><span className="label">资料类型</span><div className="upload-type"><button className={`type-button ${kind === 'resume' ? 'selected' : ''}`} onClick={() => setKind('resume')} disabled={!!busy} aria-pressed={kind === 'resume'}><Icon name="file"/>个人简历 <span style={{ fontSize: 10, marginLeft: 'auto' }}>PDF</span></button><button className={`type-button ${kind === 'portfolio' ? 'selected' : ''}`} onClick={() => setKind('portfolio')} disabled={!!busy} aria-pressed={kind === 'portfolio'}><Icon name="case"/>作品集 <span style={{ fontSize: 10, marginLeft: 'auto' }}>PDF / PPTX</span></button></div>
                <div className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length > 1) setMessage({ text: '请一次上传一个文件。', error: true }); else void upload(e.dataTransfer.files[0]); }}>
                  <div className="upload-icon"><Icon name="upload" size={29}/></div><strong>将{kind === 'resume' ? '简历' : '作品集'}拖到这里，或选择文件</strong><p>{kind === 'resume' ? '支持 PDF 格式' : '支持 PDF、PPTX 格式'} · 单个文件不超过 15 MB · 最多 60 页</p><button className="btn" disabled={!!busy || loading} onClick={() => fileInput.current?.click()}><Icon name="plus" size={14}/>选择文件</button>
                  <input ref={fileInput} aria-label="上传职业资料" type="file" disabled={!!busy || loading} accept={kind === 'resume' ? '.pdf' : '.pdf,.pptx'} className="hidden" onChange={e => void upload(e.target.files?.[0])}/>
                </div><div className="upload-foot"><Icon name="shield" size={13}/>原件与预览保存在你的私有云存储，仅本人账号可访问</div>
                <div className="hint"><strong>准备小建议</strong><br/>优先上传可选择文字的 PDF；作品集建议包含项目背景、你的职责与真实成果。扫描件可预览，文字识别需 AI 服务或人工补充。</div>
              </div>
            </section>
            <aside className="right-stack"><section className="panel"><div className="panel-body"><h2 className="help-head"><Icon name="spark"/>让经历变得更清晰</h2><ul className="help-list">
              {[['case', '梳理工作与项目', '提取原文中的经历、职责与项目成果，保留每条内容的页码来源。'], ['chart', '查看作品集细节', '逐页查看文字、图片与图表数据，识别不清的内容明确提示。'], ['person', '建立职业能力档案', '整理技能与行业经验。核实后再确认，随时编辑和保存。']].map(([icon, title, sub]) => <li key={title}><span className="icon-box"><Icon name={icon} size={17}/></span><div><strong>{title}</strong><p>{sub}</p></div></li>)}
              </ul></div></section><div className="privacy"><h3><Icon name="shield" size={17}/>你的资料，由你掌控</h3><p>原件与预览保存在 Supabase 私有存储，职业档案由数据库行级权限保护。仅授权的本人账号可使用，默认不发送至外部 AI；主动同意后才会发送。</p></div></aside>
          </div>
          <div className="stat-row"><div className="stat"><span>已上传资料</span><strong>{state.documents.length}<small>/ 4 份</small></strong></div><div className="stat"><span>原文候选与手动条目</span><strong>{evidenceCount}<small>条</small></strong></div><div className="stat"><span>你已确认的条目</span><strong>{confirmed}<small>条</small></strong></div></div>
          <section className="section"><div className="section-title"><h2>我的资料</h2><small>只使用你的真实资料</small></div><div className="panel">{state.documents.length ? state.documents.map(doc => <div className="file-row" key={doc.id}><span className="file-icon"><Icon name="file"/></span><div className="file-info"><strong>{doc.name}</strong><small>{doc.kind === 'resume' ? '个人简历' : '作品集'} · {doc.format} · {doc.pages.length} 页</small></div><span className="badge">{doc.status==='ready'?'已解析':doc.status==='error'?'解析中断':doc.status==='deleting'?'删除待重试':'待继续解析'}</span>{doc.error&&<span className="warning">{doc.error}</span>}{doc.status!=='ready'&&doc.status!=='deleting'&&<button className="btn" disabled={!!busy||dirty} onClick={()=>void resumeParse(doc.id)}>继续解析</button>}<button className="btn" disabled={!!busy||doc.status==='deleting'} onClick={()=>void downloadOriginal(doc.id)}>下载原件</button><button className="btn danger" disabled={!!busy||dirty} onClick={()=>void removeDocument(doc.id)}>删除</button><button className="btn" disabled={!!busy} onClick={() => openDoc(doc)}>查看结果<Icon name="arrow" size={13}/></button></div>) : <div className="empty"><strong>还没有上传资料</strong>上传第一份简历或作品集，开始整理你的职业故事。</div>}</div></section>
          {state.documents.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 10 }}><button className="btn primary" onClick={() => setView('profile')}>查看职业档案<Icon name="arrow" size={14}/></button><button className="btn danger" disabled={!!busy} onClick={() => void clear()}>清空我的资料</button></div>}
        </>}
        {view === 'pages' && <section className="panel"><div className="panel-head"><div><h2>逐页解析结果</h2><p>原文与图片是依据，自动分析仅供核对</p></div><button className="btn" onClick={() => setView('upload')}>返回资料</button></div><div className="panel-body">{!document ? <div className="empty">请先上传文件</div> : <>
          <label className="label" htmlFor="document-select">选择资料</label><select id="document-select" className="editor-field" value={document.id} disabled={!!busy} onChange={e => { setDocId(e.target.value); setPageNum(1); setConsent(false); }}>{state.documents.map(d => <option value={d.id} key={d.id}>{d.name} · {d.pages.length} 页</option>)}</select>
          <div className="page-selector" aria-label="选择页码">{document.pages.map(p => <button key={p.number} className={p.number === page?.number ? 'active' : ''} onClick={() => setPageNum(p.number)} aria-label={`第 ${p.number} 页`}>{p.number}</button>)}</div>
          {page && <><div className="section-title"><h2>第 {page.number} 页</h2><small>{page.images} 个图片对象 · {document.format === 'PDF' ? '图表未分类' : `${page.charts} 个图表`}</small></div><div className="page-content"><div><span className="label">{document.format === 'PDF' ? '页面预览' : '本页内嵌素材（非完整排版）'}</span><div className="page-preview">{(page.preview ? [page.preview] : page.media).length ? (page.preview ? [page.preview] : page.media).map(asset => <img key={asset} src={`/api/media?doc=${document.id}&asset=${asset}`} alt={`${document.name} 第 ${page.number} 页${page.preview ? '预览' : '内嵌图片'}`}/>) : <div className="empty">本页没有可预览图片<br/>请对照原始文件核实文字与排版。</div>}</div></div><div><span className="label">提取原文</span><div className="extracted">{page.text || '未提取到文字。不推测内容，请查看预览或补充文字。'}</div></div></div>{[...document.warnings, ...page.warnings].map((text, i) => <div className="warning" key={i}>{text}</div>)}{page.ai && <div className="ai-result"><strong>AI 页级分析 · 待核实</strong><br/>{page.ai}</div>}</>}
          <div className="section" style={{ borderTop: '1px solid #e5ebe6', paddingTop: 20 }}><h2>AI 深度分析</h2><p className="subtitle" style={{ fontSize: 12, marginTop: 9 }}>{aiConfigured ? '已配置服务。发送当前文件前 12 页的文字及有限数量图片，逐页分析营销案例、图表与视觉设计。扫描 PDF 可尝试视觉识别；PPTX 不包含完整布局。' : '尚未配置 AI API。当前原文解析、私有图片预览、档案编辑与保存均可使用；视觉语义分析及 OCR 尚未启用。'}</p><label className="check-row"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={!aiConfigured || !!busy}/><span>我同意将当前资料的文字与页面图片发送至已配置的 AI 服务。我了解可能含有个人信息、产生费用，且结果需要核实。</span></label><button className="btn primary" disabled={!aiConfigured || !consent || !!busy || dirty || document.status!=='ready'} onClick={() => void analyze()}><Icon name="spark" size={15}/>开始 AI 分析</button>{document.aiStatus && <div className="hint">{document.aiStatus}</div>}</div>
        </>}</div></section>}
        {view === 'profile' && <section className="panel"><div className="panel-head"><div><h2>我的职业能力档案</h2><p>{dirty ? '有尚未保存的修改' : state.updatedAt ? `最近保存：${new Date(state.updatedAt).toLocaleString('zh-CN')}` : '用真实证据建立你的职业画像'}</p></div><button className="btn primary" disabled={!!busy || loading} onClick={() => void saveProfile()}><Icon name="check" size={15}/>保存档案</button></div><fieldset className="panel-body" disabled={!!busy || loading} style={{ border: 0, margin: 0 }}><div className="editor-grid"><label><span className="label">姓名 / 称呼</span><input className="editor-field" value={state.profile.name} maxLength={100} placeholder="由你填写，不自动猜测身份" onChange={e => changeProfile({ ...state.profile, name: e.target.value })}/></label><label><span className="label">职业方向</span><input className="editor-field" value={state.profile.headline} maxLength={200} placeholder="例如：品牌营销 / 内容策略" onChange={e => changeProfile({ ...state.profile, headline: e.target.value })}/></label></div><label><span className="label">个人职业概述</span><textarea className="editor-field" rows={3} value={state.profile.summary} maxLength={3000} placeholder="基于真实经历，概括你的优势与期望方向…" onChange={e => changeProfile({ ...state.profile, summary: e.target.value })}/></label><div className="hint">自动条目是按关键词提取的原文候选，每类最多150条，可能遗漏或包含无关内容。请逐条核实；编辑后标记为用户填写，引用页码仅表示上下文，不证明修改后的表述。</div>
          {(Object.keys(labels) as Category[]).map(category => <section className="section" key={category}><div className="section-title"><h2>{labels[category]} <small>{state.profile[category].length} 条</small></h2><button className="btn" onClick={() => changeProfile({ ...state.profile, [category]: [...state.profile[category], { id: crypto.randomUUID(), text: '', source: '', page: 0, status: '待核实', origin: '用户填写' }] })}><Icon name="plus" size={13}/>添加条目</button></div>
            {state.profile[category].length ? state.profile[category].map(item => { const source = state.documents.find(d => d.id === item.source); return <div className="evidence" key={item.id}><textarea aria-label={`${labels[category]}条目`} className="editor-field" rows={2} maxLength={2000} value={item.text} placeholder="请输入有事实依据的经历或能力…" onChange={e => changeProfile({ ...state.profile, [category]: state.profile[category].map(x => x.id === item.id ? { ...x, text: e.target.value, status: '待核实', origin: '用户填写' } : x) })}/><div className="evidence-meta"><span>{item.origin} · {source ? <button style={{ border: 0, background: 'transparent', textDecoration: 'underline', color: '#44765a' }} onClick={() => { setDocId(source.id); setPageNum(item.page); setView('pages'); }}>{source.name} / 第 {item.page} 页</button> : '无文件来源，请人工提供事实依据'}</span><div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><select aria-label={`${labels[category]}核实状态`} value={item.status} onChange={e => changeProfile({ ...state.profile, [category]: state.profile[category].map(x => x.id === item.id ? { ...x, status: e.target.value as '待核实' | '已确认' } : x) })}><option>待核实</option><option>已确认</option></select><button className="btn danger" aria-label={`删除${labels[category]}条目`} onClick={() => changeProfile({ ...state.profile, [category]: state.profile[category].filter(x => x.id !== item.id) })}><Icon name="close" size={12}/></button></div></div></div>; }) : <div className="empty" style={{ background: '#f9fbf9', borderRadius: 7, padding: 22 }}>暂无可识别的{labels[category]}。请对照原文手动补充，系统不会编造。</div>}
          </section>)}
          <div style={{ display: 'flex', gap: 12, marginTop: 25, flexWrap: 'wrap' }}><button className="btn primary" onClick={() => void saveProfile()}>保存档案</button><button className="btn" disabled={dirty} onClick={exportProfile}><Icon name="download" size={14}/>导出 JSON</button><button className="btn danger" onClick={() => void clear()}>清空我的资料</button></div>
        </fieldset></section>}
        <footer className="footer">职途 AI · 每一份职业故事，都从真实出发。仅本人账号可使用 · 私有资料由你管理，可随时下载或删除。</footer>
      </div>
    </main>
  </>;
}
