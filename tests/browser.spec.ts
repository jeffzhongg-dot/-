import { test, expect } from '@playwright/test';
import { makePdf, makePptx } from './fixtures';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const authenticated=Boolean(process.env.TEST_OWNER_EMAIL && process.env.TEST_OWNER_PASSWORD);
if(authenticated && (!['localhost','127.0.0.1'].includes(new URL(base).hostname) || !process.env.TEST_OWNER_EMAIL?.endsWith('@example.test'))) throw new Error('Browser upload tests require a local synthetic account; never use personal accounts.');
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');await page.getByRole('textbox',{name:'本人账号邮箱'}).fill(process.env.TEST_OWNER_EMAIL!);await page.getByLabel('密码',{exact:true}).fill(process.env.TEST_OWNER_PASSWORD!);await page.getByRole('button',{name:'登录私人工作台',exact:true}).click();await page.waitForURL(base+'/');
}

test('Chinese UI: upload PDF/PPTX, review pages, edit/save/reload and delete private data', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  test.skip(!authenticated,'需要真实的本地 Supabase 合成测试账号');
  await login(page);
  await expect(page.getByRole('heading', { name: '上传你的职业资料' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择文件', exact: true })).toBeEnabled();
  await page.screenshot({ path: '/tmp/job-agent-home.png', fullPage: true });
  await page.getByLabel('上传职业资料').setInputFiles({ name: '测试简历.pdf', mimeType: 'application/pdf', buffer: await makePdf() });
  await expect(page.getByText('测试简历.pdf', { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: '查看结果' }).click();
  await expect(page.getByText('Project campaign: GMV increased 20%.', { exact: false })).toBeVisible();
  await expect(page.locator('.page-preview img')).toBeVisible();
  await page.getByRole('button', { name: '第 2 页', exact: true }).click();
  await expect(page.getByText('此页没有可提取的文字', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '返回资料' }).click();
  await page.getByRole('button', { name: '作品集', exact: false }).filter({ hasText: 'PDF / PPTX' }).click();
  await page.getByLabel('上传职业资料').setInputFiles({ name: '测试作品集.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: makePptx() });
  await expect(page.getByText('测试作品集.pptx', { exact: true })).toBeVisible({ timeout: 60000 });
  await page.locator('.file-row').filter({ hasText: '测试作品集.pptx' }).getByRole('button', { name: '查看结果' }).click();
  await expect(page.locator('.extracted')).toContainText('负责品牌营销工作，项目增长 20%');
  await expect(page.locator('.extracted')).toContainText('图表缓存数据');
  await expect(page.locator('.page-preview img')).toBeVisible();
  const imageUrl = await page.locator('.page-preview img').getAttribute('src');
  const other = await context.browser()!.newContext();
  expect((await other.request.get(`${base}${imageUrl}`)).status()).toBe(404);
  await other.close();
  await page.getByRole('button', { name: '职业能力档案', exact: false }).click();
  await page.getByRole('textbox', { name: '姓名 / 称呼' }).fill('测试用户');
  const work = page.getByRole('textbox', { name: '工作经历条目', exact: true }).first();
  await work.fill('真实经历：负责品牌项目，增长数据待核实');
  await page.getByRole('button', { name: '保存档案', exact: true }).first().click();
  await expect(page.getByText('职业档案已保存', { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '职业能力档案', exact: false }).click();
  await expect(page.getByRole('textbox', { name: '姓名 / 称呼' })).toHaveValue('测试用户');
  await expect(page.getByRole('textbox', { name: '工作经历条目', exact: true }).first()).toHaveValue('真实经历：负责品牌项目，增长数据待核实');
  await expect(page.getByText('用户填写', { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: '/tmp/job-agent-profile.png', fullPage: true });
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON' }).click();
  expect((await exported).suggestedFilename()).toBe('职业能力档案.json');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '清空我的资料' }).click();
  await expect(page.getByText('还没有上传资料')).toBeVisible();
  expect((await context.request.get(`${base}${imageUrl}`)).status()).toBe(404);
  expect(errors).toEqual([]);
});

test('anonymous callers cannot read profiles, sign uploads, parse, download, delete or use AI', async({request,page})=>{
  await page.goto('/');await expect(page).toHaveURL(/\/login$/);await expect(page.getByText('此应用不开放注册', {exact:false})).toBeVisible();
  const headers={Origin:new URL(base).origin};
  for(const endpoint of ['/api/documents/prepare','/api/documents/process','/api/analyze']) {
    const response=await request.post(endpoint,{headers,data:{id:'11111111-1111-4111-8111-111111111111',name:'x.pdf',size:1,kind:'resume',consent:true,page:1}});
    expect([401,503]).toContain(response.status());
  }
  expect([401,503]).toContain((await request.get('/api/profile')).status());
  expect([401,503]).toContain((await request.get('/api/documents/file?id=11111111-1111-4111-8111-111111111111')).status());
  for(const endpoint of ['/api/reset','/api/documents']) expect([401,503]).toContain((await request.delete(endpoint,{headers,data:{id:'11111111-1111-4111-8111-111111111111'}})).status());
  expect((await request.get('/api/media?doc=../../etc&asset=passwd')).status()).toBe(404);
  expect((await request.delete('/api/reset',{headers:{Origin:'https://evil.example'}})).status()).toBe(403);
  expect((await request.post('/api/auth/register',{data:{email:'nobody@example.com'}})).status()).toBe(404);
});

test('owner can download original; invalid reservations fail; a valid unauthorized account is refused',async({page,request})=>{
  test.skip(!authenticated,'需要本地 Supabase 合成测试账号');await login(page);
  const context=page.context().request;const headers={Origin:new URL(base).origin};
  const input={kind:'resume',name:'x.pdf',size:15728641};expect((await context.post('/api/documents/prepare',{headers,data:input})).status()).toBe(400);
  expect((await context.post('/api/documents/prepare',{headers,data:{...input,name:'bad.pptx',size:100}})).status()).toBe(400);
  const denied=await request.post('/api/auth/login',{headers,data:{email:process.env.TEST_OTHER_EMAIL,password:process.env.TEST_OTHER_PASSWORD}});expect(denied.status()).toBe(403);
  expect((await request.get('/api/profile')).status()).toBe(401);
  await page.getByLabel('上传职业资料').setInputFiles({name:'下载测试.pdf',mimeType:'application/pdf',buffer:await makePdf()});
  await expect(page.getByText('下载测试.pdf',{exact:true})).toBeVisible({timeout:60000});
  const state=(await (await context.get('/api/profile')).json()).state;
  const file=await context.get(`/api/documents/file?id=${state.documents[0].id}`);expect(file.status()).toBe(200);
  const signed=(await file.json()).url;const original=await request.get(signed);expect(original.status()).toBe(200);expect((await original.body()).subarray(0,5).toString()).toBe('%PDF-');
  expect((await request.get(`/api/documents/file?id=${state.documents[0].id}`)).status()).toBe(401);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除',exact:true}).first().click();await expect(page.getByText('还没有上传资料')).toBeVisible();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(page).toHaveURL(/\/login$/);expect((await context.get('/api/profile')).status()).toBe(401);
});

test('large PDF bypasses app request bodies; Auth cookies are HttpOnly and private originals remain downloadable',async({page})=>{
  test.skip(!authenticated,'需要本地 Supabase 合成测试账号');await login(page);
  const cookies=await page.context().cookies();const sessions=cookies.filter(c=>c.name.startsWith('sb-'));
  expect(sessions.length).toBeGreaterThan(0);for(const cookie of sessions){expect(cookie.httpOnly).toBe(true);expect(cookie.sameSite).toBe('Strict');}
  const sizes:number[]=[];page.on('request',request=>{if(new URL(request.url()).origin===new URL(base).origin&&request.method()==='POST')sizes.push(request.postDataBuffer()?.length||0);});
  await expect(page.getByRole('button',{name:'选择文件',exact:true})).toBeEnabled();
  const {makeLargePdf}=await import('./fixtures');const large=await makeLargePdf();expect(large.length).toBeGreaterThan(4.5*1024*1024);
  await page.getByLabel('上传职业资料').setInputFiles({name:'大文件合成测试.pdf',mimeType:'application/pdf',buffer:large});
  await expect(page.getByText('大文件合成测试.pdf',{exact:true})).toBeVisible({timeout:60000});await expect(page.getByText('已解析',{exact:true})).toBeVisible({timeout:60000});
  expect(sizes.length).toBeGreaterThan(0);expect(Math.max(...sizes)).toBeLessThan(4096);
  const request=page.context().request;const state=(await(await request.get('/api/profile')).json()).state;
  const id=state.documents.find((d:{name:string})=>d.name==='大文件合成测试.pdf').id;
  const link=await(await request.get(`/api/documents/file?id=${id}`)).json();const download=await request.get(link.url);expect((await download.body()).length).toBe(large.length);
  page.once('dialog',d=>d.accept());await page.locator('.file-row').filter({hasText:'大文件合成测试.pdf'}).getByRole('button',{name:'删除',exact:true}).click();await expect(page.getByText('还没有上传资料')).toBeVisible();
});
