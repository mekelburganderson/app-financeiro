import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const migrationsDirectory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));

/**
 * Start a disposable PostgreSQL database and apply the real project migrations.
 * Auth is deliberately a small stub: this tests SQL/RLS, not GoTrue or PostgREST.
 * The caller owns the returned database and must call db.close().
 */
export async function createTestDatabase({ applyMigrations = true } = {}) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role supabase_auth_admin nologin;
      create schema auth;
      create schema extensions;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );
      create function auth.uid() returns uuid
        language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      grant usage on schema auth to supabase_auth_admin;
      grant all on auth.users to supabase_auth_admin;
    `);

    if (applyMigrations) {
      const files = (await readdir(migrationsDirectory))
        .filter((file) => /^\d{14}_.+\.sql$/.test(file))
        .sort();
      if (files.length === 0) throw new Error('No versioned SQL migrations found.');
      for (const file of files) {
        try {
          await db.exec(await readFile(`${migrationsDirectory}/${file}`, 'utf8'));
        } catch (error) {
          throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
        }
      }
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
