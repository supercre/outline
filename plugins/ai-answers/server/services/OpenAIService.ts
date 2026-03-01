import OpenAI from "openai";
import Logger from "@server/logging/Logger";
import env from "../env";

let client: OpenAI | null = null;

/**
 * Get or create the OpenAI client instance.
 *
 * @returns the openai client.
 */
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }
  return client;
}

/**
 * Generate an embedding vector for the given text.
 *
 * @param text - the text to embed.
 * @returns the embedding vector as a number array.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getClient();
  const response = await openai.embeddings.create({
    model: env.AI_ANSWERS_EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Generate an AI answer from the given query and context chunks.
 *
 * @param query - the user's search query.
 * @param contexts - array of context objects with text and document title.
 * @returns the generated answer string.
 */
export async function generateAnswer(
  query: string,
  contexts: { text: string; documentTitle: string; documentId: string }[]
): Promise<string> {
  if (contexts.length === 0) {
    return "관련 문서를 찾을 수 없어 답변을 생성할 수 없습니다.";
  }

  const openai = getClient();

  const contextText = contexts
    .map((ctx, i) => `[문서 ${i + 1}: ${ctx.documentTitle}]\n${ctx.text}`)
    .join("\n\n---\n\n");

  const systemPrompt = `당신은 사내 Wiki 문서를 기반으로 질문에 답변하는 AI 어시스턴트입니다.

규칙:
- 제공된 문서 내용만을 기반으로 답변하세요.
- 답변에 출처 문서를 표시하세요 (예: [문서 1: 제목]).
- 문서에서 답을 찾을 수 없으면 솔직하게 "제공된 문서에서 관련 정보를 찾을 수 없습니다."라고 답하세요.
- 마크다운 형식으로 답변하세요.
- 간결하고 정확하게 답변하세요.`;

  try {
    const response = await openai.chat.completions.create({
      model: env.AI_ANSWERS_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `질문: ${query}\n\n참고 문서:\n${contextText}`,
        },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    });

    return (
      response.choices[0]?.message?.content ?? "답변을 생성할 수 없습니다."
    );
  } catch (err) {
    Logger.error("Failed to generate AI answer", err as Error, {
      query,
      contextCount: contexts.length,
    });
    throw err;
  }
}
