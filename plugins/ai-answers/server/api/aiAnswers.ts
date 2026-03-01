import Router from "koa-router";
import { UserRole } from "@shared/types";
import auth from "@server/middlewares/authentication";
import validate from "@server/middlewares/validate";
import { SearchQuery } from "@server/models";
import type { APIContext } from "@server/types";
import presentSearchQuery from "@server/presenters/searchQuery";
import BulkIndexEmbeddingsTask from "../tasks/BulkIndexEmbeddingsTask";
import GenerateAnswerTask from "../tasks/GenerateAnswerTask";
import { generateWriting } from "../services/OpenAIService";
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

export default router;
