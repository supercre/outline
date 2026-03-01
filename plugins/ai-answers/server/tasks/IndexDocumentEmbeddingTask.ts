import type { JobOptions } from "bull";
import { Document, DocumentEmbedding } from "@server/models";
import Logger from "@server/logging/Logger";
import { BaseTask, TaskPriority } from "@server/queues/tasks/base/BaseTask";
import { Op } from "sequelize";
import { generateEmbedding } from "../services/OpenAIService";

interface Props {
  documentId: string;
}

/**
 * Task to generate and store embeddings for a document's text chunks.
 */
export default class IndexDocumentEmbeddingTask extends BaseTask<Props> {
  public async perform({ documentId }: Props) {
    const document = await Document.findByPk(documentId);
    if (!document || !document.text) {
      return;
    }

    Logger.info("task", `IndexDocumentEmbeddingTask: ${documentId}`);

    const chunks = splitIntoChunks(document.text, 500);

    // Process chunks and generate embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);

      await DocumentEmbedding.upsert({
        documentId,
        chunkIndex: i,
        chunkText: chunk,
        embedding,
      });
    }

    // Remove stale chunks that are beyond current chunk count
    await DocumentEmbedding.destroy({
      where: {
        documentId,
        chunkIndex: {
          [Op.gte]: chunks.length,
        },
      },
    });

    Logger.info(
      "task",
      `Indexed ${chunks.length} chunks for document ${documentId}`
    );
  }

  public get options(): JobOptions {
    return {
      priority: TaskPriority.Background,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 30 * 1000,
      },
    };
  }
}

/**
 * Split text into chunks of approximately the given token count.
 * Uses a simple paragraph/sentence-based splitting strategy.
 *
 * @param text - the text to split.
 * @param maxTokens - approximate max tokens per chunk.
 * @returns array of text chunks.
 */
function splitIntoChunks(text: string, maxTokens: number): string[] {
  // Rough approximation: 1 token ≈ 4 characters for English, ~2 chars for Korean
  const maxChars = maxTokens * 3;
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > maxChars && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }

    if (paragraph.length > maxChars) {
      // Split long paragraphs by sentences
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      const sentences = paragraph.split(/(?<=[.!?。]\s)/);
      for (const sentence of sentences) {
        if (
          currentChunk.length + sentence.length + 1 > maxChars &&
          currentChunk
        ) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.length > 0);
}
