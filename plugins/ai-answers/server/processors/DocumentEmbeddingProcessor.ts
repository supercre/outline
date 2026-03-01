import BaseProcessor from "@server/queues/processors/BaseProcessor";
import type { DocumentEvent, RevisionEvent, Event } from "@server/types";
import IndexDocumentEmbeddingTask from "../tasks/IndexDocumentEmbeddingTask";

export default class DocumentEmbeddingProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = [
    "documents.publish",
    "documents.update.debounced",
  ];

  async perform(event: DocumentEvent | RevisionEvent) {
    switch (event.name) {
      case "documents.publish":
      case "documents.update.debounced": {
        await new IndexDocumentEmbeddingTask().schedule({
          documentId: event.documentId,
        });
        break;
      }
      default:
        break;
    }
  }
}
