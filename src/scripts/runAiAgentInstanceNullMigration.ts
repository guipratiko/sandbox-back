/**
 * Executa apenas a migration 023: permitir instance_id NULL em ai_agents
 *
 * Uso: npm run migrate:ai-agent-instance-null
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { POSTGRES_CONFIG } from '../config/constants';

const pool = new Pool({
  connectionString: POSTGRES_CONFIG.URI,
  max: 1,
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
});

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('🚀 Executando migration 023 (ai_agents.instance_id NULL)...\n');
    const migrationPath = join(__dirname, '../database/migrations/023_allow_ai_agents_instance_id_null.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    await client.query(sql);
    console.log('✅ Migration 023 executada com sucesso.');
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
