-- AlterTable
ALTER TABLE "public"."UserSetting"
ALTER COLUMN "categorizerProvider" SET DEFAULT 'OPENROUTER';

UPDATE "public"."UserSetting"
SET "categorizerProvider" = 'OPENROUTER'
WHERE "categorizerProvider" = 'OPENAI';
