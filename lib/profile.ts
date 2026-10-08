import { randomUUID } from 'node:crypto';
import { Document, Profile, Category, emptyProfile } from './types';
// Conservative rules extract literal source lines, never infer a career or a result.
const rules: Record<Category, RegExp> = {
  work: /工作经历|任职|担任|负责|就职|工作经验|\b(?:experience|manager|director)\b/i,
  projects: /项目|案例|成果|增长|提升|转化|销售额|ROI|GMV|campaign|project/i,
  skills: /技能|熟练|擅长|能力|策划|投放|分析|设计|运营|skills/i,
  industries: /行业|领域|快消|美妆|零售|电商|互联网|餐饮|汽车|金融|医疗|消费品|industry/i,
};
export function extractProfile(doc: Document, previous?: Profile): Profile {
  const profile = previous ? structuredClone(previous) : emptyProfile();
  for (const category of Object.keys(rules) as Category[]) {
    let added = 0;
    for (const page of doc.pages) {
      for (const line of page.text.split('\n').map(s => s.trim()).filter(Boolean)) {
        if (line.length < 4 || line.length > 800 || !rules[category].test(line)) continue;
        if (profile[category].some(e => e.source === doc.id && e.text === line)) continue;
        if (added >= 30) break;
        profile[category].push({ id: randomUUID(), text: line, source: doc.id, page: page.number, status: '待核实', origin: '原文候选' });
        added++;
      }
    }
  }
  return profile;
}
