import { z } from "zod";

export const AiAnswersGenerateSchema = z.object({
  body: z.object({
    query: z.string().min(1).max(255),
    searchQueryId: z.string().uuid().optional(),
  }),
});

export type AiAnswersGenerateReq = z.infer<typeof AiAnswersGenerateSchema>;

export const AiAnswersStatusSchema = z.object({
  body: z.object({
    searchQueryId: z.string().uuid(),
  }),
});

export type AiAnswersStatusReq = z.infer<typeof AiAnswersStatusSchema>;

export const AiAnswersWriteSchema = z.object({
  body: z.object({
    prompt: z.string().min(1).max(1000),
    context: z.string().max(10000).optional(),
    action: z.enum([
      "freeform",
      "summarize",
      "translate_ko",
      "translate_en",
      "expand",
      "fix_grammar",
      "change_tone_formal",
      "change_tone_casual",
      "simplify",
    ]),
  }),
});

export type AiAnswersWriteReq = z.infer<typeof AiAnswersWriteSchema>;

export const AiAnswersSemanticSearchSchema = z.object({
  body: z.object({
    query: z.string().min(1).max(1000),
    collectionId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    dateFilter: z.string().optional(),
    statusFilter: z.array(z.string()).optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(25),
  }),
});

export type AiAnswersSemanticSearchReq = z.infer<
  typeof AiAnswersSemanticSearchSchema
>;
