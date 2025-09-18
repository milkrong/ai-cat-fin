import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Make Redis optional to avoid failing function cold start when not configured locally.
  REDIS_URL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().optional(),
  SILICONFLOW_API_KEY: z.string().optional(),
  SILICONFLOW_BASE_URL: z.string().optional(),
  FORCE_AI_PARSE: z.string().optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY,
  SILICONFLOW_BASE_URL: process.env.SILICONFLOW_BASE_URL,
  FORCE_AI_PARSE: process.env.FORCE_AI_PARSE,
});

if (!env.REDIS_URL) {
  console.warn("[env] REDIS_URL not set; Redis-dependent features will be disabled.");
}
