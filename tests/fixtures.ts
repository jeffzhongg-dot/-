import { PDFDocument, StandardFonts } from 'pdf-lib';
import AdmZip from 'adm-zip';
import { createCanvas } from '@napi-rs/canvas';
export async function makePdf() {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([500, 500]);
  page.drawText('Project campaign: GMV increased 20%.', { x: 30, y: 420, size: 16, font });
  page.drawText('Skills: marketing, analysis and design.', { x: 30, y: 385, size: 16, font });
  const image = createCanvas(200, 80); const ctx = image.getContext('2d'); ctx.fillStyle = '#147b66'; ctx.fillRect(0, 0, 200, 80); ctx.fillStyle = 'white'; ctx.font = '18px sans-serif'; ctx.fillText('Scanned portfolio', 10, 45);
  const png = await doc.embedPng(image.toBuffer('image/png')); doc.addPage([500, 500]).drawImage(png, { x: 20, y: 300, width: 400, height: 160 });
  return Buffer.from(await doc.save());
}
export function makePptx(options: { reverse?: boolean; unsafe?: boolean } = {}) {
  const zip = new AdmZip();
  const write = (p: string, s: string | Buffer) => zip.addFile(p, typeof s === 'string' ? Buffer.from(s) : s);
  write('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  write('ppt/presentation.xml', `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${options.reverse ? '<p:sldId id="257" r:id="rId2"/><p:sldId id="256" r:id="rId1"/>' : '<p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/>'}</p:sldIdLst></p:presentation>`);
  write('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>');
  write('ppt/slides/slide1.xml', '<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r" xmlns:c="c"><a:p><a:r><a:t>负责品牌营销工作，项目增长 20%</a:t></a:r></a:p><a:p><a:r><a:t>技能：内容策划，电商行业</a:t></a:r></a:p><a:blip r:embed="img1"/><c:chart r:id="chart1"/></p:sld>');
  write('ppt/slides/_rels/slide1.xml.rels', `<Relationships><Relationship Id="img1" Target="${options.unsafe ? '../media/payload.svg' : '../media/image.png'}"/><Relationship Id="chart1" Target="../charts/chart1.xml"/></Relationships>`);
  write('ppt/charts/chart1.xml', '<c:chartSpace xmlns:c="c"><c:pt><c:v>2025</c:v></c:pt><c:pt><c:v>20</c:v></c:pt></c:chartSpace>');
  write('ppt/slides/slide2.xml', '<p:sld xmlns:p="p"/>');
  const canvas = createCanvas(50, 50); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#227755'; ctx.fillRect(0, 0, 50, 50);
  write('ppt/media/image.png', canvas.toBuffer('image/png'));
  if (options.unsafe) write('ppt/media/payload.svg', '<svg onload="alert(1)"/>');
  return zip.toBuffer();
}
export async function makeLargePdf() {
  const {randomBytes}=await import('node:crypto');
  const pdf=await PDFDocument.load(await makePdf());
  await pdf.attach(randomBytes(6*1024*1024),'synthetic-only.bin',{mimeType:'application/octet-stream',description:'Random synthetic test bytes, not personal data'});
  return Buffer.from(await pdf.save());
}
