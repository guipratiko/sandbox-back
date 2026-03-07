/**
 * Script para executar migrations do PostgreSQL
 * 
 * Uso: npm run migrate
 * ou: ts-node-dev --transpile-only src/scripts/runMigrations.ts
 */

// dotenv já é carregado em ../config/constants.ts
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { POSTGRES_CONFIG } from '../config/constants';

const POSTGRES_URI = POSTGRES_CONFIG.URI;

const pool = new Pool({
  connectionString: POSTGRES_URI,
  max: 1, // Apenas 1 conexão para migrations
  connectionTimeoutMillis: 10000, // 10 segundos timeout
  query_timeout: 30000, // 30 segundos timeout para queries
});

/**
 * Executa um arquivo SQL
 */
async function runMigration(filePath: string): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log(`\n📄 Executando migration: ${filePath}`);
    
    const sql = readFileSync(filePath, 'utf8');
    
    console.log('⏳ Executando SQL (isso pode levar alguns segundos)...');
    
    // Executar SQL completo
    // O PostgreSQL permite múltiplos comandos separados por ;
    const result = await client.query(sql);
    
    console.log(`✅ Migration executada com sucesso: ${filePath}`);
  } catch (error: any) {
    console.error(`❌ Erro ao executar migration ${filePath}:`, error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    if (error.position) {
      console.error(`   Posição do erro: ${error.position}`);
    }
    // Se for erro de "já existe", não é crítico
    if (error.message.includes('already exists') || error.code === '42P07' || error.code === '42710') {
      console.log('⚠️  Alguns objetos já existem, mas continuando...');
      return;
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executa todas as migrations em ordem
 */
async function runAllMigrations(): Promise<void> {
  try {
    console.log('🚀 Iniciando execução de migrations...\n');
    console.log(`📡 Conectando ao PostgreSQL: ${POSTGRES_URI.split('@')[1]}`);
    
    // Testar conexão primeiro
    const testClient = await pool.connect();
    await testClient.query('SELECT NOW()');
    testClient.release();
    console.log('✅ Conexão com PostgreSQL estabelecida\n');
    
    // Lista de migrations em ordem
    const migrations = [
      '001_create_crm_tables.sql',
      '002_add_short_id_to_columns.sql',
      '003_fix_message_id_unique_per_instance.sql',
      '004_create_labels_system.sql',
      '005_add_short_id_to_labels.sql',
      '006_create_dispatches_tables.sql',
      '007_cleanup_dispatches_table.sql',
      '008_fix_templates_type_constraint.sql',
      '009_create_workflows_tables.sql',
      '010_create_google_tokens_table.sql',
      '011_create_openai_memory_table.sql',
      '012_create_ai_agents_table.sql',
      '013_add_transcribe_audio_to_ai_agents.sql',
      '014_add_agent_type_to_ai_agents.sql',
      '015_create_group_movements_and_auto_messages.sql',
      '016_add_delay_to_group_auto_messages.sql',
      '017_create_banners_table.sql',
      '018_create_group_message_templates_and_schedules.sql',
      '019_create_system_news_table.sql',
      '020_add_block_when_user_replies_to_ai_agents.sql',
      '021_create_ai_agent_media_and_locations.sql',
      '022_add_audio_to_ai_agent_media.sql',
    ];
    
    for (const migration of migrations) {
      const migrationPath = join(__dirname, '../database/migrations', migration);
      await runMigration(migrationPath);
    }
    
    console.log('\n✅ Todas as migrations foram executadas com sucesso!');
  } catch (error: any) {
    console.error('\n❌ Erro ao executar migrations:', error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔌 Conexão fechada');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runAllMigrations();
}

export { runAllMigrations };

