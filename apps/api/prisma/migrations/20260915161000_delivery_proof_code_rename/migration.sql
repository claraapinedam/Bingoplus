-- Rename: DeliveryProof.codeHash -> code. Table has zero rows in every environment so far (new
-- in this same phase), so this is a pure rename, not a data migration.
ALTER TABLE "DeliveryProof" RENAME COLUMN "codeHash" TO "code";
