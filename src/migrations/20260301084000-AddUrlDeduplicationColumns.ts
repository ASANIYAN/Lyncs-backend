import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUrlDeduplicationColumns20260301084000
  implements MigrationInterface
{
  name = 'AddUrlDeduplicationColumns20260301084000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE urls
      ADD COLUMN IF NOT EXISTS normalized_url TEXT,
      ADD COLUMN IF NOT EXISTS url_hash VARCHAR(64),
      ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_url_hash ON urls(url_hash);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_url_hash
      ON urls(user_id, url_hash)
      WHERE is_active = true AND url_hash IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_url_hash;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_urls_url_hash;`);

    await queryRunner.query(`
      ALTER TABLE urls
      DROP COLUMN IF EXISTS last_checked_at,
      DROP COLUMN IF EXISTS url_hash,
      DROP COLUMN IF EXISTS normalized_url;
    `);
  }
}
