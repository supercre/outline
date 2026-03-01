import { IsOptional } from "class-validator";
import { Environment } from "@server/env";
import environment from "@server/utils/environment";

class AiAnswersPluginEnvironment extends Environment {
  /** OpenAI API key for generating embeddings and answers. */
  @IsOptional()
  public OPENAI_API_KEY = this.toOptionalString(environment.OPENAI_API_KEY);

  /** Model to use for answer generation. Defaults to gpt-4o-mini. */
  @IsOptional()
  public AI_ANSWERS_MODEL =
    this.toOptionalString(environment.AI_ANSWERS_MODEL) ?? "gpt-4o-mini";

  /** Model to use for embedding generation. Defaults to text-embedding-3-small. */
  @IsOptional()
  public AI_ANSWERS_EMBEDDING_MODEL =
    this.toOptionalString(environment.AI_ANSWERS_EMBEDDING_MODEL) ??
    "text-embedding-3-small";
}

export default new AiAnswersPluginEnvironment();
