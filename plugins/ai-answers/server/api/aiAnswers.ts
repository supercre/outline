import Router from "koa-router";
import { QueryTypes } from "sequelize";
import { UserRole } from "@shared/types";
import auth from "@server/middlewares/authentication";
import pagination from "@server/routes/api/middlewares/pagination";
import validate from "@server/middlewares/validate";
import { Document, SearchQuery } from "@server/models";
import { sequelize } from "@server/storage/database";
import type { APIContext } from "@server/types";
import { presentDocument, presentPolicies } from "@server/presenters";
import presentSearchQuery from "@server/presenters/searchQuery";
import BulkIndexEmbeddingsTask from "../tasks/BulkIndexEmbeddingsTask";
import GenerateAnswerTask from "../tasks/GenerateAnswerTask";
import { generateEmbedding, generateWriting } from "../services/OpenAIService";
import type { WritingAction } from "../services/OpenAIService";
import * as T from "./schema";

const router = new Router();

router.post(
  "aiAnswers.generate",
  auth(),
  validate(T.AiAnswersGenerateSchema),
  async (ctx: APIContext<T.AiAnswersGenerateReq>) => {
    const { query, searchQueryId } = ctx.input.body;
    const { user } = ctx.state.auth;

    let searchQuery: SearchQuery;

    if (searchQueryId) {
      const existing = await SearchQuery.findByPk(searchQueryId);
      if (existing && existing.answer) {
        ctx.body = {
          data: {
            searchQueryId: existing.id,
            status: "complete",
            answer: existing.answer,
          },
        };
        return;
      }
      if (existing) {
        searchQuery = existing;
      } else {
        searchQuery = await SearchQuery.create({
          query,
          source: "app",
          userId: user.id,
          teamId: user.teamId,
          results: 0,
        });
      }
    } else {
      searchQuery = await SearchQuery.create({
        query,
        source: "app",
        userId: user.id,
        teamId: user.teamId,
        results: 0,
      });
    }

    // Schedule the answer generation task
    await new GenerateAnswerTask().schedule({
      searchQueryId: searchQuery.id,
      query,
      teamId: user.teamId,
      userId: user.id,
    });

    ctx.body = {
      data: {
        searchQueryId: searchQuery.id,
        status: "processing",
      },
    };
  }
);

router.post(
  "aiAnswers.status",
  auth(),
  validate(T.AiAnswersStatusSchema),
  async (ctx: APIContext<T.AiAnswersStatusReq>) => {
    const { searchQueryId } = ctx.input.body;

    const searchQuery = await SearchQuery.findByPk(searchQueryId);

    if (!searchQuery) {
      ctx.body = {
        data: {
          status: "processing",
        },
      };
      return;
    }

    if (searchQuery.answer) {
      ctx.body = {
        data: presentSearchQuery(searchQuery),
        status: "complete",
      };
      return;
    }

    ctx.body = {
      data: {
        status: "processing",
      },
    };
  }
);

router.post(
  "aiAnswers.write",
  auth(),
  validate(T.AiAnswersWriteSchema),
  async (ctx: APIContext<T.AiAnswersWriteReq>) => {
    const { prompt, context, action } = ctx.input.body;

    const text = await generateWriting(
      prompt,
      context,
      action as WritingAction
    );

    ctx.body = {
      data: { text },
    };
  }
);

router.post(
  "aiAnswers.reindex",
  auth({ role: UserRole.Admin }),
  async (ctx: APIContext) => {
    const { user } = ctx.state.auth;

    await new BulkIndexEmbeddingsTask().schedule({
      teamId: user.teamId,
    });

    ctx.body = {
      data: {
        status: "scheduled",
        message: "Bulk embedding indexing has been scheduled.",
      },
    };
  }
);

interface SemanticResult {
  documentId: string;
  chunkText: string;
  ranking: number;
}

router.post(
  "aiAnswers.semanticSearch",
  auth(),
  pagination(),
  validate(T.AiAnswersSemanticSearchSchema),
  async (ctx: APIContext<T.AiAnswersSemanticSearchReq>) => {
    const { query, collectionId, userId, dateFilter, statusFilter } =
      ctx.input.body;
    const { offset, limit } = ctx.state.pagination;
    const { user } = ctx.state.auth;

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Get user's accessible collection IDs
    const collectionIds = await user.collectionIds();

    if (collectionIds.length === 0) {
      ctx.body = {
        pagination: { ...ctx.state.pagination, total: 0 },
        data: [],
        policies: [],
      };
      return;
    }

    // Build optional WHERE clauses
    const conditions: string[] = [
      `d."teamId" = :teamId`,
      `d."collectionId" IN (:collectionIds)`,
      `d."publishedAt" IS NOT NULL`,
      `d."deletedAt" IS NULL`,
      `d."archivedAt" IS NULL`,
    ];
    const replacements: Record<string, unknown> = {
      embedding: embeddingStr,
      teamId: user.teamId,
      collectionIds,
      limit,
      offset,
    };

    if (collectionId) {
      conditions.push(`d."collectionId" = :filterCollectionId`);
      replacements.filterCollectionId = collectionId;
    }

    if (userId) {
      conditions.push(`d."createdById" = :filterUserId`);
      replacements.filterUserId = userId;
    }

    if (dateFilter) {
      const dateMap: Record<string, string> = {
        day: "1 day",
        week: "1 week",
        month: "1 month",
        year: "1 year",
      };
      const interval = dateMap[dateFilter];
      if (interval) {
        conditions.push(`d."updatedAt" >= NOW() - INTERVAL '${interval}'`);
      }
    }

    if (statusFilter && statusFilter.length > 0) {
      const statusConditions: string[] = [];
      if (statusFilter.includes("published")) {
        statusConditions.push(`d."publishedAt" IS NOT NULL`);
      }
      if (statusFilter.includes("draft")) {
        statusConditions.push(`d."publishedAt" IS NULL`);
      }
      if (statusFilter.includes("archived")) {
        statusConditions.push(`d."archivedAt" IS NOT NULL`);
      }
      if (statusConditions.length > 0) {
        conditions.push(`(${statusConditions.join(" OR ")})`);
      }
    }

    const whereClause = conditions.join(" AND ");

    // Set IVFFlat probes for optimization
    await sequelize.query("SET LOCAL ivfflat.probes = 10");

    // Count total results
    const countResult = await sequelize.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM (
        SELECT DISTINCT ON (de."documentId") de."documentId"
        FROM document_embeddings de
        INNER JOIN documents d ON d.id = de."documentId"
        WHERE ${whereClause}
      ) sub`,
      {
        replacements,
        type: QueryTypes.SELECT,
      }
    );
    const total = parseInt(countResult[0]?.total ?? "0", 10);

    // Find top similar chunks (one per document)
    const results = await sequelize.query<SemanticResult>(
      `SELECT DISTINCT ON (de."documentId")
              de."documentId",
              de."chunkText",
              1 - (de.embedding <=> :embedding::vector) AS ranking
       FROM document_embeddings de
       INNER JOIN documents d ON d.id = de."documentId"
       WHERE ${whereClause}
       ORDER BY de."documentId", de.embedding <=> :embedding::vector ASC`,
      {
        replacements,
        type: QueryTypes.SELECT,
      }
    );

    // Sort by ranking descending and apply pagination
    results.sort((a, b) => b.ranking - a.ranking);
    const paginatedResults = results.slice(offset, offset + limit);

    // Load full document objects with membership scope
    const documentIds = paginatedResults.map((r) => r.documentId);
    const documents = await Promise.all(
      documentIds.map((id) => Document.findByPk(id, { userId: user.id }))
    );
    const loadedDocs = documents.filter(Boolean) as Document[];
    const docMap = new Map(loadedDocs.map((d) => [d.id, d]));

    // Build response matching documents.search format
    const data = await Promise.all(
      paginatedResults.map(async (result) => {
        const doc = docMap.get(result.documentId);
        if (!doc) {
          return null;
        }
        // Extract snippet from chunk text (up to 250 chars)
        const context =
          result.chunkText.length > 250
            ? result.chunkText.substring(0, 250) + "…"
            : result.chunkText;

        const presentedDoc = await presentDocument(ctx, doc);
        return {
          ranking: result.ranking,
          context,
          document: presentedDoc,
        };
      })
    );

    const filteredData = data.filter(Boolean);

    ctx.body = {
      pagination: { ...ctx.state.pagination, total },
      data: filteredData,
      policies: presentPolicies(user, loadedDocs),
    };
  }
);

export default router;
