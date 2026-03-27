import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailOtpAndLoginSignals20260327090000
  implements MigrationInterface
{
  name = 'AddEmailOtpAndLoginSignals20260327090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45) NULL,
      ADD COLUMN IF NOT EXISTS last_login_user_agent_hash VARCHAR(128) NULL,
      ADD COLUMN IF NOT EXISTS last_login_device_hash VARCHAR(64) NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS email_otps (
        id BIGSERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        user_id BIGINT NULL,
        purpose VARCHAR(20) NOT NULL,
        code_hash VARCHAR(128) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        consumed_at TIMESTAMP NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        device_hash VARCHAR(64) NULL,
        ip_address VARCHAR(45) NULL,
        user_agent_hash VARCHAR(128) NULL
      );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_email_otps_user_id'
        ) THEN
          ALTER TABLE email_otps
          ADD CONSTRAINT fk_email_otps_user_id
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_otps_email_purpose_expires
      ON email_otps(email, purpose, expires_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_otps_user_purpose_expires
      ON email_otps(user_id, purpose, expires_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_email_otps_user_purpose_expires;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_email_otps_email_purpose_expires;`,
    );
    await queryRunner.query(
      `ALTER TABLE email_otps DROP CONSTRAINT IF EXISTS fk_email_otps_user_id;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS email_otps;`);

    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS last_login_device_hash,
      DROP COLUMN IF EXISTS last_login_user_agent_hash,
      DROP COLUMN IF EXISTS last_login_ip,
      DROP COLUMN IF EXISTS last_login_at,
      DROP COLUMN IF EXISTS email_verified_at;
    `);
  }
}
