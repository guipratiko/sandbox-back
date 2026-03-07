/**
 * Script para executar apenas a migration da tabela system_news
 * 
 * Uso: npm run migrate:news
 * ou: ts-node-dev --transpile-only src/scripts/runNewsMigration.ts
 */

// dotenv já é carregado em ../config/constants.ts
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { POSTGRES_CONFIG } from '../config/constants';

const POSTGRES_URI = POSTGRES_CONFIG.URI;

const pool = new Pool({
  connectionString: POSTGRES_URI,
  max: 1,
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
});

async function runNewsMigration(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Executando migration da tabela system_news...\n');
    console.log(`📡 Conectando ao PostgreSQL: ${POSTGRES_URI.split('@')[1]}`);
    
    // Testar conexão
    await client.query('SELECT NOW()');
    console.log('✅ Conexão estabelecida\n');
    
    const migrationPath = join(__dirname, '../database/migrations/019_create_system_news_table.sql');
    console.log(`📄 Lendo migration: ${migrationPath}`);
    
    const sql = readFileSync(migrationPath, 'utf8');
    
    console.log('⏳ Executando SQL...');
    await client.query(sql);
    
    console.log('✅ Migration executada com sucesso!');
    console.log('✅ Tabela system_news criada');
  } catch (error: any) {
    console.error('❌ Erro ao executar migration:', error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    // Se a tabela já existe, não é erro crítico
    if (error.code === '42P07' || error.message.includes('already exists')) {
      console.log('⚠️  Tabela já existe, mas continuando...');
      return;
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
    console.log('\n🔌 Conexão fechada');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runNewsMigration();
}

export { runNewsMigration };
