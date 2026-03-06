import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { existsSync } from 'fs';
import { config as loadEnv } from 'dotenv';
import { User } from './auth/dto/entities/user.entity';
import {
  BlockedDomain,
  RefreshToken,
} from './auth/dto/entities/refresh-token.entity';
import { Url } from './url/entities/url.entity';
import { Click } from './analytics/entities/click.entity';
import { RateLimit } from './common/entities/rate-limit.entity';

// TypeORM CLI does not bootstrap Nest ConfigModule, so load env files explicitly.
if (!process.env.DB_PASSWORD) {
  const envLocalPath = join(process.cwd(), '.env.local');
  const envPath = join(process.cwd(), '.env');

  if (existsSync(envLocalPath)) {
    loadEnv({ path: envLocalPath, override: false });
  }

  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, RefreshToken, BlockedDomain, Url, Click, RateLimit],
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
  synchronize: false,
});
