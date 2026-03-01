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
