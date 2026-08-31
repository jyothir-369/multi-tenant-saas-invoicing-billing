export function validateProductionEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const required = ['DATABASE_URL', 'JWT_SECRET'];

  const missing = required.filter((name) => !env[name]);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (env.NODE_ENV === 'production' && env.JWT_SECRET!.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }

  if (env.REDIS_URL && !env.REDIS_URL.startsWith('redis://') && !env.REDIS_URL.startsWith('rediss://')) {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }
}
