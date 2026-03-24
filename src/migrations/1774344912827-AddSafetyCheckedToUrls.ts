import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSafetyCheckedToUrls1774344912827 implements MigrationInterface {
  name = 'AddSafetyCheckedToUrls1774344912827';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "urls" DROP CONSTRAINT "fk_urls_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_urls_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_urls_url_hash"`);
    await queryRunner.query(`DROP INDEX "public"."idx_user_url_hash"`);
    await queryRunner.query(`DROP INDEX "public"."idx_urls_user_active"`);
    await queryRunner.query(`DROP INDEX "public"."idx_urls_user_clicks"`);
    await queryRunner.query(`DROP INDEX "public"."idx_urls_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_urls_click_count"`);
    await queryRunner.query(`DROP INDEX "public"."idx_urls_safety_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_hash"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_active"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_clicks_short_code"`);
    await queryRunner.query(`DROP INDEX "public"."idx_clicks_clicked_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_clicks_composite"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_rate_limits_user_action_window"`,
    );
    await queryRunner.query(
      `ALTER TABLE "urls" ADD "safety_checked" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "urls" ADD "safety_checked_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "urls" ALTER COLUMN "created_at" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "blocked_domains" ALTER COLUMN "added_at" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "clicks" ALTER COLUMN "clicked_at" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e1d29d724dddebbdae878d3f49" ON "urls" ("short_code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5b194a4470977b71ff490dfc64" ON "urls" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7aa4b1247181d8c19233cecd4" ON "urls" ("url_hash") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b5a08755402f149a7161dccc2a" ON "blocked_domains" ("domain") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_67d79417a61885599462f7fd31" ON "clicks" ("short_code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9d8c17edf2fcb53a18be22f298" ON "clicks" ("clicked_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3ca4f3f1930b963a646b36ce79" ON "clicks" ("short_code", "clicked_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fd02e8ef9eee7a17e4f70a24e7" ON "rate_limits" ("user_id", "action", "window_start") `,
    );
    await queryRunner.query(
      `ALTER TABLE "urls" ADD CONSTRAINT "FK_5b194a4470977b71ff490dfc64b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "urls" DROP CONSTRAINT "FK_5b194a4470977b71ff490dfc64b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fd02e8ef9eee7a17e4f70a24e7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_67d79417a61885599462f7fd31"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9d8c17edf2fcb53a18be22f298"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3ca4f3f1930b963a646b36ce79"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9d8c17edf2fcb53a18be22f298"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_67d79417a61885599462f7fd31"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b5a08755402f149a7161dccc2a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a7aa4b1247181d8c19233cecd4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5b194a4470977b71ff490dfc64"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e1d29d724dddebbdae878d3f49"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clicks" ALTER COLUMN "clicked_at" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "blocked_domains" ALTER COLUMN "added_at" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "urls" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "urls" DROP COLUMN "safety_checked_at"`,
    );
    await queryRunner.query(`ALTER TABLE "urls" DROP COLUMN "safety_checked"`);
    await queryRunner.query(
      `CREATE INDEX "idx_rate_limits_user_action_window" ON "rate_limits" ("user_id", "action", "window_start") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_clicks_composite" ON "clicks" ("short_code", "clicked_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_clicks_clicked_at" ON "clicks" ("clicked_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_clicks_short_code" ON "clicks" ("short_code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_active" ON "refresh_tokens" ("token_hash", "expires_at") WHERE (revoked = false)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_urls_safety_status" ON "urls" ("safety_status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_urls_click_count" ON "urls" ("click_count") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_urls_created_at" ON "urls" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_urls_user_clicks" ON "urls" ("user_id", "click_count") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_urls_user_active" ON "urls" ("user_id") WHERE (is_active = true)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_user_url_hash" ON "urls" ("user_id", "url_hash") WHERE ((is_active = true) AND (url_hash IS NOT NULL))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_urls_url_hash" ON "urls" ("url_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_urls_user_id" ON "urls" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "fk_refresh_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "urls" ADD CONSTRAINT "fk_urls_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
