import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureUsersEmailIndex20260523120000 implements MigrationInterface {
  name = 'EnsureUsersEmailIndex20260523120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND indexdef ILIKE '%(email)%'
        ) THEN
          CREATE INDEX idx_users_email ON users(email);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email;`);
  }
}
