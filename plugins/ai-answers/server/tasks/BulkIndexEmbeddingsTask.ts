import type { JobOptions } from "bull";
import { Op } from "sequelize";
import { Document } from "@server/models";
import Logger from "@server/logging/Logger";
import { BaseTask, TaskPriority } from "@server/queues/tasks/base/BaseTask";
import IndexDocumentEmbeddingTask from "./IndexDocumentEmbeddingTask";

interface Props {
  teamId?: string;
}

/**
 * Task to bulk-index embeddings for all published documents.
 * Schedules IndexDocumentEmbeddingTask for each document.
 */
export default class BulkIndexEmbeddingsTask extends BaseTask<Props> {
  public async perform({ teamId }: Props) {
    const where: Record<string, unknown> = {
      publishedAt: { [Op.not]: null },
      deletedAt: null,
      archivedAt: null,
    };

    if (teamId) {
      where.teamId = teamId;
    }

    const documents = await Document.findAll({
      where,
      attributes: ["id"],
    });

    Logger.info(
      "task",
      `BulkIndexEmbeddingsTask: scheduling ${documents.length} documents`
    );

    for (const doc of documents) {
      await new IndexDocumentEmbeddingTask().schedule({
        documentId: doc.id,
      });
    }

    Logger.info(
      "task",
      `BulkIndexEmbeddingsTask: scheduled all ${documents.length} documents`
    );
  }

  public get options(): JobOptions {
    return {
      priority: TaskPriority.Background,
      attempts: 1,
    };
  }
}
