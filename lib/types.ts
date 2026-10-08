export type Category = 'work' | 'projects' | 'skills' | 'industries';
export type Evidence = { id: string; text: string; source: string; page: number; status: '待核实' | '已确认'; origin: '原文候选' | '用户填写' };
export type Profile = { name: string; headline: string; summary: string; work: Evidence[]; projects: Evidence[]; skills: Evidence[]; industries: Evidence[] };
export type Page = { number: number; text: string; images: number; charts: number; preview?: string; media: string[]; warnings: string[]; ai?: string };
export type Document = { id: string; name: string; kind: 'resume' | 'portfolio'; format: 'PDF' | 'PPTX'; pages: Page[]; warnings: string[]; createdAt: string; aiStatus?: string; status?: 'pending' | 'processing' | 'ready' | 'error' | 'deleting'; totalPages?: number; nextPage?: number; error?: string };
export type State = { documents: Document[]; profile: Profile; updatedAt?: string; revision?: number };
export const emptyProfile = (): Profile => ({ name: '', headline: '', summary: '', work: [], projects: [], skills: [], industries: [] });
export const emptyState = (): State => ({ documents: [], profile: emptyProfile() });
export const labels: Record<Category, string> = { work: '工作经历', projects: '项目与成果', skills: '专业技能', industries: '行业经验' };
