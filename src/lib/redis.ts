import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableAutoPipelining: true,
    })
  : null;

export function requireRedis() {
  if (!redis) throw new Error("Redis not configured (REDIS_URL missing)");
  return redis;
}
