import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  // Database - Support both connection methods
  // Production (Render/Supabase): Uses DATABASE_URL
  // Local Development: Uses individual DB_* variables
  DATABASE_URL: Joi.string().uri().optional(),
  DB_HOST: Joi.string().optional(),
  DB_PORT: Joi.number().optional().default(5432),
  DB_USERNAME: Joi.string().optional(),
  DB_PASSWORD: Joi.string().optional(),
  DB_NAME: Joi.string().optional(),

  // Connection pool settings (optional with defaults)
  DB_POOL_MAX: Joi.number().optional().default(20),
  DB_POOL_MIN: Joi.number().optional().default(5),
  DB_POOL_IDLE_TIMEOUT: Joi.number().optional().default(30000),
  DB_POOL_ACQUIRE_TIMEOUT: Joi.number().optional().default(5000),

  // Redis
  REDIS_URL: Joi.string().uri().required(),

  // Auth
  AUTH_SALT_ROUNDS: Joi.number().min(8).max(14).default(12),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRY: Joi.number().default(1800),
  JWT_REFRESH_EXPIRY: Joi.number().default(604800),

  // Business Logic
  MAX_URLS_PER_HOUR: Joi.number().default(100),
  GOOGLE_SAFE_BROWSING_API_KEY: Joi.string().allow('').optional(),
}).custom((value, helpers) => {
  // Custom validation: Ensure at least one database connection method is provided
  const hasDatabaseUrl = !!value.DATABASE_URL;
  const hasIndividualVars = !!(
    value.DB_HOST &&
    value.DB_USERNAME &&
    value.DB_PASSWORD &&
    value.DB_NAME
  );

  if (!hasDatabaseUrl && !hasIndividualVars) {
    return helpers.error('any.custom', {
      message:
        'Either DATABASE_URL or all individual DB variables (DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME) must be provided',
    });
  }

  return value;
});
