import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  Table,
  ForeignKey,
  Column,
  BelongsTo,
  DataType,
} from "sequelize-typescript";
import Document from "./Document";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

@Table({
  tableName: "document_embeddings",
  modelName: "document_embedding",
})
@Fix
class DocumentEmbedding extends IdModel<
  InferAttributes<DocumentEmbedding>,
  Partial<InferCreationAttributes<DocumentEmbedding>>
> {
  /** The index of the chunk within the document. */
  @Column(DataType.INTEGER)
  chunkIndex: number;

  /** The text content of this chunk. */
  @Column(DataType.TEXT)
  chunkText: string;

  /** The embedding vector (1536 dimensions for text-embedding-3-small). */
  @Column(DataType.ARRAY(DataType.FLOAT))
  embedding: number[];

  // associations

  @BelongsTo(() => Document, "documentId")
  document: Document;

  @ForeignKey(() => Document)
  @Column(DataType.UUID)
  documentId: string;
}

export default DocumentEmbedding;
