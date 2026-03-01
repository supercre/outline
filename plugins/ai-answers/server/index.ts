import { PluginManager, Hook } from "@server/utils/PluginManager";
import config from "../plugin.json";
import env from "./env";
import aiAnswers from "./api/aiAnswers";
import DocumentEmbeddingProcessor from "./processors/DocumentEmbeddingProcessor";
import GenerateAnswerTask from "./tasks/GenerateAnswerTask";
import BulkIndexEmbeddingsTask from "./tasks/BulkIndexEmbeddingsTask";
import IndexDocumentEmbeddingTask from "./tasks/IndexDocumentEmbeddingTask";

const enabled = !!env.OPENAI_API_KEY;

if (enabled) {
  PluginManager.add([
    {
      ...config,
      type: Hook.API,
      value: aiAnswers,
    },
    {
      type: Hook.Processor,
      value: DocumentEmbeddingProcessor,
    },
    {
      type: Hook.Task,
      value: GenerateAnswerTask,
    },
    {
      type: Hook.Task,
      value: IndexDocumentEmbeddingTask,
    },
    {
      type: Hook.Task,
      value: BulkIndexEmbeddingsTask,
    },
  ]);
}
