import { ZodError, z } from "zod";

/**
 * Unified API error type for route handlers.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: any;
  constructor(status: number, message: string, code?: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: any;
}

export function jsonError(err: unknown, fallbackStatus = 500): Response {
  if (err instanceof ApiError) {
    return Response.json(
      { error: err.message, code: err.code, details: err.details },
      { status: err.status }
    );
  }
  if (err instanceof ZodError) {
    return Response.json(
      { error: "validation_error", details: err.flatten() },
      { status: 400 }
    );
  }
  console.error("[api] unhandled error", err);
  return Response.json({ error: "internal_error" }, { status: fallbackStatus });
}

export function jsonOk<T>(data: T, init?: number | ResponseInit): Response {
  if (typeof init === "number") return Response.json(data, { status: init });
  return Response.json(data, init);
}

/**
 * Wrap an async handler providing zod validation and unified errors.
 * The validator can return either the parsed object or throw ApiError.
 */
export function withHandler<Ctx extends Record<string, any>, R>(
  handler: (ctx: Ctx) => Promise<R> | R
): (ctx: Ctx) => Promise<Response> {
  return async (ctx: Ctx) => {
    try {
      const result = await handler(ctx);
      // If handler already returned a Response, pass through
      if (result instanceof Response) return result;
      return jsonOk(result as any);
    } catch (e) {
      return jsonError(e);
    }
  };
}

/**
 * Utility to parse request.json() using a zod schema with safe fallback.
 */
export async function parseJson<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<z.infer<T>> {
  const body = await req.json().catch(() => undefined);
  return schema.parse(body);
}

/**
 * Validate search params via zod schema.
 */
export function parseSearchParams<T extends z.ZodRawShape>(
  url: string,
  shape: T
): z.infer<z.ZodObject<T>> {
  const u = new URL(url);
  const obj: Record<string, string | undefined> = {};
  u.searchParams.forEach((v, k) => (obj[k] = v));
  const schema = z.object(shape).strict();
  return schema.parse(obj);
}

/**
 * Simple guard for ID params.
 */
export const idParam = z.string().min(1).max(100);

/**
 * Shared schemas.
 */
export const overridesSchema = z.object({
  overrides: z
    .array(
      z.object({
        id: idParam,
        category: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        merchant: z.string().min(1).optional(),
      })
    )
    .default([]),
});

export const monthParamSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
