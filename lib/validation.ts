import { z } from 'zod';
const evidence = z.object({ id: z.string().uuid(), text: z.string().min(1).max(2000), source: z.string().max(40), page: z.number().int().min(0).max(60), status: z.enum(['待核实', '已确认']), origin: z.enum(['原文候选', '用户填写']) });
export const profileSchema = z.object({ name: z.string().max(100), headline: z.string().max(200), summary: z.string().max(3000), work: z.array(evidence).max(150), projects: z.array(evidence).max(150), skills: z.array(evidence).max(150), industries: z.array(evidence).max(150) });
