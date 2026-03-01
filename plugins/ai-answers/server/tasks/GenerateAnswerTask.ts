import type { JobOptions } from "bull";
import { sequelize } from "@server/storage/database";
import { QueryTypes } from "sequelize";
import { Document, SearchQuery, User } from "@server/models";
import Logger from "@server/logging/Logger";
import { BaseTask, TaskPriority } from "@server/queues/tasks/base/BaseTask";
import { generateEmbedding, generateAnswer } from "../services/OpenAIService";

interface Props {
  searchQueryId: string;
  query: string;
  teamId: string;
  userId: string;
}

interface EmbeddingResult {
  id: string;
  documentId: string;
  chunkIndex: number;
  chunkText: string;
  distance: number;
}

/**
 * Task to generate an AI answer for a search query.
 */
export default class GenerateAnswerTask extends BaseTask<Props> {
  public async perform({ searchQueryId, query, teamId, userId }: Props) {
    Logger.info("task", `GenerateAnswerTask: ${query}`);

    const searchQuery = await SearchQuery.findByPk(searchQueryId);
    if (!searchQuery) {
      Logger.warn(`SearchQuery not found: ${searchQueryId}`);
      return;
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await generateEmbedding(query);
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      // Get user's accessible collection IDs for permission filtering
      const user = await User.findByPk(userId);
      if (!user) {
        Logger.warn(`User not found: ${userId}`);
        return;
      }

      const collectionIds = await user.collectionIds();

      if (collectionIds.length === 0) {
        await searchQuery.update({
          answer: "접근 가능한 컬렉션이 없어 답변을 생성할 수 없습니다.",
        });
        return;
      }

      // Find top 5 similar chunks with permission filtering
      const results = await sequelize.query<EmbeddingResult>(
        `SELECT de.id, de."documentId", de."chunkIndex", de."chunkText",
                de.embedding <=> :embedding::vector AS distance
         FROM document_embeddings de
         INNER JOIN documents d ON d.id = de."documentId"
         WHERE d."teamId" = :teamId
           AND d."collectionId" IN (:collectionIds)
           AND d."publishedAt" IS NOT NULL
           AND d."deletedAt" IS NULL
           AND d."archivedAt" IS NULL
         ORDER BY de.embedding <=> :embedding::vector ASC
         LIMIT 5`,
        {
          replacements: {
            embedding: embeddingStr,
            teamId,
            collectionIds,
          },
          type: QueryTypes.SELECT,
        }
      );

      // Get document titles for context
      const documentIds = [...new Set(results.map((r) => r.documentId))];
      const documents = await Document.findAll({
        where: { id: documentIds },
        attributes: ["id", "title"],
      });

      const docTitleMap = new Map(documents.map((d) => [d.id, d.title]));

      const contexts = results.map((r) => ({
        text: r.chunkText,
        documentTitle: docTitleMap.get(r.documentId) ?? "Untitled",
        documentId: r.documentId,
      }));

      // Generate the answer
      const answer = await generateAnswer(query, contexts);

      // Save the answer to the SearchQuery
      await searchQuery.update({ answer });

      Logger.info(
        "task",
        `Generated answer for query "${query}" (${results.length} chunks used)`
      );
    } catch (err) {
      Logger.error("Failed to generate AI answer", err as Error, {
        searchQueryId,
        query,
      });

      await searchQuery.update({
        answer: "답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      });
    }
  }

  public get options(): JobOptions {
    return {
      priority: TaskPriority.Normal,
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 10 * 1000,
      },
    };
  }
}
