import AdmZip from 'adm-zip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { createCanvas, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { Page } from './types';
export const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_PAGES = 60;
export type PageRange = { start: number; count: number };
export type Parsed = { totalPages: number; pages: Page[]; warnings: string[]; assets: Record<string, Buffer> };
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false, isArray: name => ['a:p', 'a:r', 'a:t', 'Relationship'].includes(name) });
function parseXml(content: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(content)) throw new Error('文件含有不支持的 XML 声明。');
  if (XMLValidator.validate(content) !== true) throw new Error('PPTX XML 内容已损坏。');
  return xml.parse(content);
}
function walk(node: unknown, key: string): unknown[] {
  if (!node || typeof node !== 'object') return [];
  const out: unknown[] = [];
  for (const [k, v] of Object.entries(node)) {
    if (k === key) out.push(...(Array.isArray(v) ? v : [v]));
    else if (Array.isArray(v)) v.forEach(x => out.push(...walk(x, key)));
    else out.push(...walk(v, key));
  }
  return out;
}
function textRuns(node: unknown): string[] {
  return walk(node, 'a:t').map(t => typeof t === 'object' && t ? String((t as Record<string, unknown>)['#text'] ?? '') : String(t)).filter(Boolean);
}
export function detectFormat(name: string, data: Buffer): 'PDF' | 'PPTX' {
  if (!data.length || data.length > MAX_BYTES) throw new Error('文件不能为空，单个文件最大 15 MB。');
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' && data.subarray(0, 5).toString() === '%PDF-') return 'PDF';
  if (ext === 'pptx' && data[0] === 0x50 && data[1] === 0x4b) return 'PPTX';
  throw new Error('仅支持真实的 PDF、PPTX 文件，请检查文件格式与扩展名。');
}
export function parsePptx(data: Buffer, range: PageRange = { start: 1, count: MAX_PAGES }): Parsed {
  const zip = new AdmZip(data);
  const entries = zip.getEntries();
  if (entries.length > 3000) throw new Error('PPTX 内部文件过多。');
  let total = 0;
  for (const entry of entries) {
    total += entry.header.size;
    if (entry.header.size > 20 * 1024 * 1024 || total > 80 * 1024 * 1024) throw new Error('PPTX 解压后的内容过大。');
    if (entry.entryName.includes('..') || entry.entryName.startsWith('/')) throw new Error('PPTX 内部路径不安全。');
  }
  if (!zip.getEntry('[Content_Types].xml') || !zip.getEntry('ppt/presentation.xml')) throw new Error('不是有效的 PPTX 演示文稿。');
  const presentation = parseXml(zip.readAsText('ppt/presentation.xml'));
  const rels = parseXml(zip.readAsText('ppt/_rels/presentation.xml.rels'));
  const relationships = walk(rels, 'Relationship') as Record<string, string>[];
  const slides = walk(presentation, 'p:sldId') as Record<string, string>[];
  if (!slides.length || slides.length > MAX_PAGES) throw new Error('作品集需包含 1–60 页。');
  const pages: Page[] = [], assets: Record<string, Buffer> = {};
  for (let i = range.start - 1; i < Math.min(slides.length, range.start - 1 + range.count); i++) {
    const rel = relationships.find(r => r['@_Id'] === slides[i]['@_r:id']);
    if (!rel || rel['@_TargetMode'] === 'External' || !/^slides\/slide\d+\.xml$/.test(rel['@_Target'] ?? '')) throw new Error('PPTX 页面引用无效。');
    const path = `ppt/${rel['@_Target']}`;
    const slide = parseXml(zip.readAsText(path));
    const paragraphs = walk(slide, 'a:p').map(p => textRuns(p).join('')).filter(Boolean);
    // Native chart values are read separately; no claims about their meaning are inferred.
    const chartRefs = walk(slide, 'c:chart') as Record<string, string>[];
    const relPath = path.replace(/slides\/(.*)$/, 'slides/_rels/$1.rels');
    const slideRels = zip.getEntry(relPath) ? walk(parseXml(zip.readAsText(relPath)), 'Relationship') as Record<string, string>[] : [];
    const media: string[] = [];
    let pictures = 0;
    for (const image of walk(slide, 'a:blip') as Record<string, string>[]) {
      pictures++;
      const relation = slideRels.find(r => r['@_Id'] === image['@_r:embed']);
      if (!relation || relation['@_TargetMode'] === 'External') continue;
      const target = relation['@_Target'];
      if (!/^\.\.\/media\/[^/]+\.(png|jpe?g)$/i.test(target)) continue;
      const buffer = zip.readFile(`ppt/${target.slice(3)}`);
      if (!buffer || buffer.length > 4 * 1024 * 1024) continue;
      const png = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
      if (!png && !jpeg) continue;
      const name = `p${i + 1}-${media.length}.${png ? 'png' : 'jpg'}`;
      if (Object.keys(assets).length < 90) { assets[name] = buffer; media.push(name); }
    }
    for (const chart of chartRefs) {
      const relation = slideRels.find(r => r['@_Id'] === chart['@_r:id']);
      if (relation && relation['@_TargetMode'] !== 'External' && /^\.\.\/charts\/chart\d+\.xml$/.test(relation['@_Target'])) {
        const chartXml = parseXml(zip.readAsText(`ppt/${relation['@_Target'].slice(3)}`));
        const values = walk(chartXml, 'c:v').map(String).slice(0, 100);
        if (values.length) paragraphs.push(`图表缓存数据（语义待核实）：${values.join('、')}`);
      }
    }
    const warnings = ['PPTX 提取文本、内嵌图片及图表缓存数据；不重建完整幻灯片布局、动画或视觉设计。'];
    if (paragraphs.join('\n').length > 3000) warnings.push('本页文字超过显示上限，已保留前 3000 字；请下载原件查看其余内容。');
    if (!paragraphs.length) warnings.push('未提取到文字：可能是图片页或空白页。需要人工检查，或配置 AI 进行图片识别。');
    if (pictures > media.length) warnings.push('部分图片格式、外链图片或过大图片无法预览。');
    pages.push({ number: i + 1, text: paragraphs.join('\n').slice(0, 3000), images: pictures, charts: chartRefs.length, media, warnings });
  }
  return { totalPages: slides.length, pages, warnings: ['文字按文件内部顺序提取；营销案例、图表含义和设计效果需要人工或 AI 核实。'], assets };
}
export async function parsePdf(data: Buffer, range: PageRange = { start: 1, count: MAX_PAGES }): Promise<Parsed> {
  Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, disableFontFace: true });
  let pdf;
  try { pdf = await task.promise; }
  catch (error) { await task.destroy(); throw new Error((error as Error).name === 'PasswordException' ? 'PDF 已加密，请上传不含密码的副本。' : 'PDF 无法读取，文件可能已损坏。'); }
  const pages: Page[] = [], assets: Record<string, Buffer> = {};
  const totalPages = pdf.numPages;
  try {
    if (pdf.numPages > MAX_PAGES) throw new Error('PDF 最多支持 60 页，请拆分后上传。');
    for (let i = range.start; i <= Math.min(pdf.numPages, range.start + range.count - 1); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
      const ops = await page.getOperatorList();
      const images = ops.fnArray.filter(n => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].includes(n)).length;
      const warnings: string[] = [];
      if (text.trim().length > 3000) warnings.push('本页文字超过显示上限，已保留前 3000 字；请下载原件查看其余内容。');
      if (!text.trim()) warnings.push('此页没有可提取的文字，可能是扫描件。未配置 AI 时不执行 OCR，不会推测内容。');
      let preview: string | undefined;
      try {
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1.3, 1000 / Math.max(original.width, original.height)) });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvas: canvas as never, canvasContext: canvas.getContext('2d') as never, viewport }).promise;
        preview = `p${i}.png`; assets[preview] = canvas.toBuffer('image/png');
      } catch { warnings.push('此页预览渲染失败；已保留能提取的文字。'); }
      pages.push({ number: i, text: text.trim().slice(0, 3000), images, charts: 0, media: [], preview, warnings });
      page.cleanup();
    }
  } finally { await task.destroy(); }
  return { totalPages, pages, assets, warnings: ['PDF 图表不自动分类；文本阅读顺序可能受排版影响。扫描页可用 AI 视觉识别，但结果仍需核实。'] };
}
export async function parseFile(name: string, data: Buffer, range?: PageRange): Promise<Parsed & { format: 'PDF' | 'PPTX' }> {
  const format = detectFormat(name, data);
  const parsed = format === 'PDF' ? await parsePdf(data, range) : parsePptx(data, range);
  return { ...parsed, format };
}
