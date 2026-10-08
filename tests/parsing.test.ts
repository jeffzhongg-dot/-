import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { makePdf, makePptx } from './fixtures';
import { detectFormat, parseFile, parsePptx, MAX_BYTES } from '../lib/parse';
import { extractProfile } from '../lib/profile';
import { profileSchema } from '../lib/validation';
import { emptyProfile } from '../lib/types';

test('PDF extracts true text, renders every page and reports scanned-page limitation', async () => {
  const parsed = await parseFile('resume.pdf', await makePdf());
  assert.equal(parsed.format, 'PDF'); assert.equal(parsed.pages.length, 2);
  assert.match(parsed.pages[0].text, /GMV increased 20%/);
  assert.equal(parsed.pages[1].text, ''); assert.ok(parsed.pages[1].warnings.some(w => w.includes('没有可提取')));
  assert.ok(parsed.pages[1].images >= 1);
  for (const page of parsed.pages) { assert.ok(page.preview); assert.ok(parsed.assets[page.preview!].length > 100); }
});
test('PPTX extracts Chinese paragraphs, actual chart values and embedded images', async () => {
  const parsed = await parseFile('portfolio.pptx', makePptx());
  assert.equal(parsed.pages.length, 2); assert.match(parsed.pages[0].text, /负责品牌营销工作/);
  assert.match(parsed.pages[0].text, /图表缓存数据.*2025、20/); assert.equal(parsed.pages[0].charts, 1);
  assert.equal(parsed.pages[0].media.length, 1); assert.ok(Object.values(parsed.assets)[0].length > 20);
  assert.equal(parsed.pages[1].text, ''); assert.ok(parsed.pages[1].warnings.some(w => w.includes('未提取到文字')));
});
test('PPTX follows presentation order, not numeric filenames', () => {
  const parsed = parsePptx(makePptx({ reverse: true }));
  assert.equal(parsed.pages[0].text, ''); assert.match(parsed.pages[1].text, /负责品牌营销/);
});
test('active SVG media is never served', () => {
  const parsed = parsePptx(makePptx({ unsafe: true }));
  assert.equal(parsed.pages[0].images, 1); assert.equal(parsed.pages[0].media.length, 0);
  assert.ok(parsed.pages[0].warnings.some(w => w.includes('无法预览')));
});
test('unsupported, fake, empty, oversized and corrupt files fail', async () => {
  assert.throws(() => detectFormat('x.exe', Buffer.from('%PDF-1.7')), /仅支持/);
  assert.throws(() => detectFormat('x.pdf', Buffer.from('not pdf')), /仅支持/);
  assert.throws(() => detectFormat('x.pdf', Buffer.alloc(0)), /不能为空/);
  assert.throws(() => detectFormat('x.pdf', Buffer.alloc(MAX_BYTES + 1)), /15 MB/);
  await assert.rejects(parseFile('bad.pdf', Buffer.from('%PDF-corrupt')), /无法读取/);
  assert.throws(() => parsePptx(new AdmZip().toBuffer()), /有效的 PPTX/);
});
test('DTD XML is rejected', () => {
  const zip = new AdmZip(makePptx());
  zip.updateFile('ppt/slides/slide1.xml', Buffer.from('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>'));
  assert.throws(() => parsePptx(zip.toBuffer()), /XML 声明/);
});
test('profile preserves exact source evidence; no invented identity, achievements or duplicates', () => {
  const parsed = parsePptx(makePptx());
  const doc = { id: 'test-doc', name: 'case.pptx', kind: 'portfolio' as const, format: 'PPTX' as const, pages: parsed.pages, warnings: [], createdAt: '' };
  const profile = extractProfile(doc);
  assert.equal(profile.name, ''); assert.equal(profile.summary, '');
  for (const category of ['work', 'projects', 'skills', 'industries'] as const) {
    assert.ok(profile[category].length > 0);
    for (const item of profile[category]) { assert.ok(doc.pages[item.page - 1].text.includes(item.text)); assert.equal(item.source, doc.id); assert.equal(item.status, '待核实'); }
  }
  assert.deepEqual(extractProfile(doc, profile), profile);
});
test('profile rejects invalid facts structure and permits valid empty profile', () => {
  assert.ok(profileSchema.safeParse(emptyProfile()).success);
  assert.equal(profileSchema.safeParse({ ...emptyProfile(), name: 'x'.repeat(101) }).success, false);
});

test('PDF and PPTX incremental parsing preserves page numbers and total without reparsing previous pages', async()=>{
  const pdf=await parseFile('x.pdf',await makePdf(),{start:2,count:1});assert.equal(pdf.totalPages,2);assert.deepEqual(pdf.pages.map(p=>p.number),[2]);assert.ok(pdf.assets['p2.png']);assert.equal(pdf.assets['p1.png'],undefined);
  const ppt=await parseFile('x.pptx',makePptx(),{start:2,count:1});assert.equal(ppt.totalPages,2);assert.deepEqual(ppt.pages.map(p=>p.number),[2]);assert.equal(ppt.pages[0].text,'');
});
