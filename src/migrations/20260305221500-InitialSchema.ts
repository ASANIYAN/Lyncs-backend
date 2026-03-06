import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema20260305221500 implements MigrationInterface {
  name = 'InitialSchema20260305221500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        email VARCHAR NOT NULL UNIQUE,
        password VARCHAR NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT true
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS urls (
        id BIGSERIAL PRIMARY KEY,
        short_code VARCHAR(10) NOT NULL UNIQUE,
        original_url TEXT NOT NULL,
        user_id BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        click_count BIGINT NOT NULL DEFAULT 0,
        safety_status VARCHAR NOT NULL DEFAULT 'pending',
        normalized_url TEXT NULL,
        url_hash VARCHAR(64) NULL,
        last_checked_at TIMESTAMP NULL
      );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_urls_user_id'
        ) THEN
          ALTER TABLE urls
          ADD CONSTRAINT fk_urls_user_id
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_user_id ON urls(user_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_url_hash ON urls(url_hash);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_url_hash
      ON urls(user_id, url_hash)
      WHERE is_active = true AND url_hash IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS clicks (
        id BIGSERIAL PRIMARY KEY,
        short_code VARCHAR(10) NOT NULL,
        clicked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT,
        referrer TEXT,
        country VARCHAR(2),
        device_type VARCHAR(20),
        browser VARCHAR(50),
        os VARCHAR(50)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clicks_short_code ON clicks(short_code);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at ON clicks(clicked_at);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clicks_composite ON clicks(short_code, clicked_at);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id BIGSERIAL PRIMARY KEY,
        token_hash VARCHAR NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT false,
        user_id BIGINT NULL
      );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_refresh_tokens_user_id'
        ) THEN
          ALTER TABLE refresh_tokens
          ADD CONSTRAINT fk_refresh_tokens_user_id
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS blocked_domains (
        id BIGSERIAL PRIMARY KEY,
        domain VARCHAR(255) NOT NULL UNIQUE,
        reason TEXT NULL,
        added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT true
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        action VARCHAR(50) NOT NULL,
        count INTEGER NOT NULL,
        window_start TIMESTAMP NOT NULL,
        expires_at TIMESTAMP NOT NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action_window
      ON rate_limits(user_id, action, window_start);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_rate_limits_user_action_window;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS rate_limits;`);
    await queryRunner.query(`DROP TABLE IF EXISTS blocked_domains;`);
    await queryRunner.query(
      `ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS fk_refresh_tokens_user_id;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clicks_composite;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clicks_clicked_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clicks_short_code;`);
    await queryRunner.query(`DROP TABLE IF EXISTS clicks;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_url_hash;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_urls_url_hash;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_urls_user_id;`);
    await queryRunner.query(
      `ALTER TABLE urls DROP CONSTRAINT IF EXISTS fk_urls_user_id;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS urls;`);
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
  }
}
