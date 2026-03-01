import OpenAI from "openai";
import Logger from "@server/logging/Logger";
import env from "../env";

/** Supported AI writing action types. */
export type WritingAction =
  | "freeform"
  | "summarize"
  | "translate_ko"
  | "translate_en"
  | "expand"
  | "fix_grammar"
  | "change_tone_formal"
  | "change_tone_casual"
  | "simplify";

const writingSystemPrompts: Record<WritingAction, string> = {
  freeform: `당신은 문서 작성을 도와주는 AI 어시스턴트입니다.
사용자의 요청에 따라 텍스트를 생성하세요.
마크다운 형식으로 작성하세요.`,
  summarize: `당신은 텍스트 요약 전문가입니다.
제공된 텍스트를 핵심 내용 중심으로 간결하게 요약하세요.
마크다운 형식으로 작성하세요.`,
  translate_ko: `당신은 전문 번역가입니다.
제공된 텍스트를 자연스러운 한국어로 번역하세요.
원문의 의미와 톤을 최대한 유지하세요.
마크다운 형식으로 작성하세요.`,
  translate_en: `당신은 전문 번역가입니다.
제공된 텍스트를 자연스러운 영어로 번역하세요.
원문의 의미와 톤을 최대한 유지하세요.
마크다운 형식으로 작성하세요.`,
  expand: `당신은 문서 작성 전문가입니다.
제공된 텍스트를 더 자세하고 풍부하게 확장하세요.
원문의 핵심 의미를 유지하면서 설명, 예시, 세부사항을 추가하세요.
마크다운 형식으로 작성하세요.`,
  fix_grammar: `당신은 맞춤법 및 문법 교정 전문가입니다.
제공된 텍스트의 맞춤법, 문법, 띄어쓰기를 교정하세요.
원문의 의미와 스타일을 변경하지 마세요.
교정된 텍스트만 출력하세요.`,
  change_tone_formal: `당신은 문체 변환 전문가입니다.
제공된 텍스트를 공식적이고 격식 있는 톤으로 변환하세요.
내용은 유지하되 표현을 격식체로 바꾸세요.
마크다운 형식으로 작성하세요.`,
  change_tone_casual: `당신은 문체 변환 전문가입니다.
제공된 텍스트를 친근하고 캐주얼한 톤으로 변환하세요.
내용은 유지하되 표현을 편안한 구어체로 바꾸세요.
마크다운 형식으로 작성하세요.`,
  simplify: `당신은 문서 작성 전문가입니다.
제공된 텍스트를 더 간결하고 이해하기 쉽게 다시 작성하세요.
불필요한 수식어와 중복을 제거하고 핵심만 남기세요.
마크다운 형식으로 작성하세요.`,
};

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

/**
 * Generate AI writing based on a prompt and optional context text.
 *
 * @param prompt - the user's writing prompt or instruction.
 * @param context - optional selected text to operate on.
 * @param action - the type of writing action to perform.
 * @returns the generated text string.
 */
export async function generateWriting(
  prompt: string,
  context?: string,
  action: WritingAction = "freeform"
): Promise<string> {
  const openai = getClient();
  const systemPrompt = writingSystemPrompts[action];

  let userContent: string;
  if (action === "freeform") {
    userContent = context
      ? `요청: ${prompt}\n\n참고 텍스트:\n${context}`
      : prompt;
  } else {
    userContent = context || prompt;
  }

  try {
    const response = await openai.chat.completions.create({
      model: env.AI_ANSWERS_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 2048,
      temperature: 0.5,
    });

    return (
      response.choices[0]?.message?.content ?? "텍스트를 생성할 수 없습니다."
    );
  } catch (err) {
    Logger.error("Failed to generate AI writing", err as Error, {
      action,
      promptLength: prompt.length,
    });
    throw err;
  }
}
