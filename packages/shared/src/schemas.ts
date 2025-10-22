import { z } from "zod";


export const AnswerSchema = z.object({
    kind: z.enum(["MC", "VF"]).default("MC"),
    answer: z.string().regex(/^[A-E]|[VF]$/),
    confidence: z.number().min(0).max(1).optional()
});


export type Answer = z.infer<typeof AnswerSchema>;