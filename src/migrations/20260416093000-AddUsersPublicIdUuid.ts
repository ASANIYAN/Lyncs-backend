import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersPublicIdUuid20260416093000 implements MigrationInterface {
  name = 'AddUsersPublicIdUuid20260416093000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS public_id UUID;
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN public_id SET DEFAULT gen_random_uuid();
    `);

    await queryRunner.query(`
      UPDATE users
      SET public_id = gen_random_uuid()
      WHERE public_id IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN public_id SET NOT NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id
      ON users(public_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_public_id;`);
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS public_id;`,
    );
  }
}
