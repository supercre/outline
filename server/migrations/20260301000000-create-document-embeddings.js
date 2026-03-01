"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        "CREATE EXTENSION IF NOT EXISTS vector;",
        { transaction }
      );

      await queryInterface.createTable(
        "document_embeddings",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          documentId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "documents",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          chunkIndex: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          chunkText: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          embedding: {
            type: "vector(1536)",
            allowNull: false,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction }
      );

      await queryInterface.addIndex("document_embeddings", ["documentId"], {
        transaction,
      });

      await queryInterface.addIndex(
        "document_embeddings",
        ["documentId", "chunkIndex"],
        {
          unique: true,
          name: "document_embeddings_document_id_chunk_index",
          transaction,
        }
      );

      // Create IVFFlat index for cosine similarity search
      // lists should be ~sqrt(rows); start small, rebuild as data grows
      await queryInterface.sequelize.query(
        `CREATE INDEX document_embeddings_embedding_idx
         ON document_embeddings
         USING ivfflat (embedding vector_cosine_ops)
         WITH (lists = 4);`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("document_embeddings", { transaction });
    });
  },
};
