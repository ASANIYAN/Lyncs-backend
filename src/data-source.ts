import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from './auth/dto/entities/user.entity';
import {
  BlockedDomain,
  RefreshToken,
} from './auth/dto/entities/refresh-token.entity';
import { Url } from './url/entities/url.entity';
import { Click } from './analytics/entities/click.entity';
import { RateLimit } from './common/entities/rate-limit.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, RefreshToken, BlockedDomain, Url, Click, RateLimit],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
