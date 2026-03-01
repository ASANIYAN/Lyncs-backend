import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAndExpandClicksTable20260301083000 implements MigrationInterface {
  name = 'CreateAndExpandClicksTable20260301083000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      ALTER TABLE clicks
      ADD COLUMN IF NOT EXISTS device_type VARCHAR(20),
      ADD COLUMN IF NOT EXISTS browser VARCHAR(50),
      ADD COLUMN IF NOT EXISTS os VARCHAR(50);
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clicks_composite;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clicks_clicked_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clicks_short_code;`);
    await queryRunner.query(`
      ALTER TABLE clicks
      DROP COLUMN IF EXISTS os,
      DROP COLUMN IF EXISTS browser,
      DROP COLUMN IF EXISTS device_type;
    `);
  }
}
