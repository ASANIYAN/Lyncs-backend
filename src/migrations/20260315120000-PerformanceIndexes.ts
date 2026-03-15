import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance Indexes Migration
 *
 * Adds every index needed to bring hot-path queries from sequential scans
 * to index scans.  All statements use IF NOT EXISTS / IF EXISTS so the
 * migration is safe to re-run.
 *
 * Index rationale (each one maps to a real query in the codebase):
 *
 *  urls
 *  ----
 *  idx_urls_user_id           – foreign-key lookup; already in initial schema
 *                               but kept here for completeness via IF NOT EXISTS
 *  idx_urls_user_active       – partial index: COUNT(*) WHERE is_active = true
 *                               used by getProfile urlCount aggregation
 *  idx_urls_user_clicks       – covering index for SUM(click_count) per user
 *                               used by getProfile totalClicks aggregation
 *  idx_urls_short_code        – unique; already exists, listed for docs
 *  idx_urls_created_at        – ORDER BY created_at in dashboard queries
 *  idx_urls_click_count       – ORDER BY click_count in dashboard + top-urls
 *  idx_urls_safety_status     – WHERE safety_status = 'pending'/'unsafe'
 *
 *  clicks
 *  ------
 *  idx_clicks_short_code      – primary analytics filter
 *  idx_clicks_clicked_at      – time-series ORDER BY / range filter
 *  idx_clicks_composite       – (short_code, clicked_at) for time-range queries
 *
 *  refresh_tokens
 *  --------------
 *  idx_refresh_tokens_hash    – token lookup during refresh rotation
 *  idx_refresh_tokens_active  – partial index: only non-revoked tokens
 *  idx_refresh_tokens_user_id – JOIN to user during refresh
 *
 *  rate_limits
 *  -----------
 *  already indexed in initial schema
 */
export class PerformanceIndexes20260315120000 implements MigrationInterface {
  name = 'PerformanceIndexes20260315120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── urls ──────────────────────────────────────────────────────────────────

    // Partial index: only active URLs — makes urlCount COUNT(*) use an index scan
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_user_active
      ON urls (user_id)
      WHERE is_active = true;
    `);

    // Covering index for click_count aggregation per user (SUM / ORDER BY)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_user_clicks
      ON urls (user_id, click_count);
    `);

    // Dashboard ORDER BY created_at
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_created_at
      ON urls (created_at DESC);
    `);

    // Dashboard ORDER BY click_count DESC (top URLs)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_click_count
      ON urls (click_count DESC);
    `);

    // Safety status filter (WHERE safety_status = 'unsafe')
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_safety_status
      ON urls (safety_status);
    `);

    // ── clicks ────────────────────────────────────────────────────────────────

    // These may already exist from the initial schema — IF NOT EXISTS is safe
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clicks_short_code
      ON clicks (short_code);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at
      ON clicks (clicked_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clicks_composite
      ON clicks (short_code, clicked_at DESC);
    `);

    // ── refresh_tokens ────────────────────────────────────────────────────────

    // Fast lookup by token hash during refresh rotation
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
      ON refresh_tokens (token_hash);
    `);

    // Partial index: only valid (non-revoked) tokens — shrinks the index dramatically
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active
      ON refresh_tokens (token_hash, expires_at)
      WHERE revoked = false;
    `);

    // JOIN to user when loading the user during refresh
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
      ON refresh_tokens (user_id);
    `);

    // ── statistics update ─────────────────────────────────────────────────────
    // Update planner statistics so the query planner uses the new indexes immediately
    await queryRunner.query(`ANALYZE urls;`);
    await queryRunner.query(`ANALYZE clicks;`);
    await queryRunner.query(`ANALYZE refresh_tokens;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_refresh_tokens_user_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_refresh_tokens_active;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_refresh_tokens_hash;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clicks_composite;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clicks_clicked_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clicks_short_code;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_urls_safety_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_urls_click_count;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_urls_created_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_urls_user_clicks;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_urls_user_active;`);
  }
}
