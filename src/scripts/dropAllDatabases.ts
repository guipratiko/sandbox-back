/**
 * Script para dropar TODOS os bancos de dados (MongoDB, PostgreSQL e Redis)
 * 
 * ⚠️ ATENÇÃO: Esta operação é IRREVERSÍVEL e deletará TODOS os dados!
 * 
 * Uso: ts-node-dev --transpile-only src/scripts/dropAllDatabases.ts
 */

// dotenv já é carregado em ../config/constants.ts
import mongoose from 'mongoose';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { DATABASE_CONFIG, POSTGRES_CONFIG, REDIS_CONFIG } from '../config/constants';

/**
 * Dropar todas as coleções do MongoDB
 */
async function dropMongoDB(): Promise<void> {
  try {
    console.log('\n🗑️  === DROPANDO MONGODB ===\n');
    console.log(`📡 Conectando ao MongoDB: ${DATABASE_CONFIG.URI.split('@')[1]}`);
    
    await mongoose.connect(DATABASE_CONFIG.URI);
    console.log('✅ Conectado ao MongoDB\n');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database não encontrado');
    }

    // Listar todas as coleções
    const collections = await db.listCollections().toArray();
    console.log(`📋 Encontradas ${collections.length} coleção(ões):`);
    collections.forEach(col => console.log(`   - ${col.name}`));
    console.log('');

    // Dropar cada coleção
    for (const collection of collections) {
      try {
        console.log(`🗑️  Removendo coleção: ${collection.name}...`);
        await db.collection(collection.name).drop();
        console.log(`✅ Coleção ${collection.name} removida\n`);
      } catch (error: any) {
        if (error.message.includes('not found') || error.code === 26) {
          console.log(`⚠️  Coleção ${collection.name} não existe, pulando...\n`);
        } else {
          console.error(`❌ Erro ao remover ${collection.name}:`, error.message);
        }
      }
    }

    console.log('✅ MongoDB limpo com sucesso!');
  } catch (error: any) {
    console.error('\n❌ Erro ao dropar MongoDB:', error.message);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexão MongoDB fechada\n');
  }
}

/**
 * Dropar todas as tabelas do PostgreSQL
 */
async function dropPostgreSQL(): Promise<void> {
  const pool = new Pool({
    connectionString: POSTGRES_CONFIG.URI,
    max: 1,
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  });

  const client = await pool.connect();
  
  try {
    console.log('\n🗑️  === DROPANDO POSTGRESQL ===\n');
    console.log(`📡 Conectando ao PostgreSQL: ${POSTGRES_CONFIG.URI.split('@')[1]}`);
    
    // Testar conexão
    await client.query('SELECT NOW()');
    console.log('✅ Conexão estabelecida\n');

    // Desabilitar foreign key checks temporariamente
    await client.query('SET session_replication_role = replica;');

    // Lista de todas as tabelas para dropar (em ordem reversa de dependências)
    const tables = [
      'workflow_contacts',
      'workflows',
      'ai_agents',
      'openai_memory',
      'google_tokens',
      'dispatch_jobs',
      'dispatches',
      'templates',
      'contact_labels',
      'labels',
      'messages',
      'contacts',
      'crm_columns',
    ];

    console.log('📋 Tabelas a serem removidas:');
    tables.forEach(table => console.log(`   - ${table}`));
    console.log('');

    // Dropar tabelas em ordem
    for (const table of tables) {
      try {
        console.log(`🗑️  Removendo tabela: ${table}...`);
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
        console.log(`✅ Tabela ${table} removida\n`);
      } catch (error: any) {
        if (error.message.includes('does not exist')) {
          console.log(`⚠️  Tabela ${table} não existe, pulando...\n`);
        } else {
          console.error(`❌ Erro ao remover ${table}:`, error.message);
        }
      }
    }

    // Dropar funções e triggers relacionados
    console.log('🗑️  Removendo funções e triggers...');
    const functions = [
      'update_workflows_updated_at',
      'update_templates_updated_at',
      'update_dispatches_updated_at',
      'update_openai_memory_updated_at',
      'update_updated_at_column',
      'update_contact_last_message',
      'increment_unread_count',
    ];

    for (const func of functions) {
      try {
        await client.query(`DROP FUNCTION IF EXISTS ${func}() CASCADE;`);
      } catch (error: any) {
        // Ignorar erros de função não encontrada
      }
    }
    console.log('✅ Funções removidas\n');

    // Reabilitar foreign key checks
    await client.query('SET session_replication_role = DEFAULT;');

    console.log('✅ PostgreSQL limpo com sucesso!');
  } catch (error: any) {
    console.error('\n❌ Erro ao dropar PostgreSQL:', error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
    console.log('🔌 Conexão PostgreSQL fechada\n');
  }
}

/**
 * Limpar todo o cache do Redis
 */
async function dropRedis(): Promise<void> {
  const redisClient = new Redis(REDIS_CONFIG.URI, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  try {
    console.log('\n🗑️  === LIMPANDO REDIS ===\n');
    console.log(`📡 Conectando ao Redis: ${REDIS_CONFIG.URI.split('@')[1]}`);
    
    // Testar conexão
    await redisClient.ping();
    console.log('✅ Conectado ao Redis\n');

    // Buscar todas as chaves
    console.log('🔍 Buscando todas as chaves...');
    const keys = await redisClient.keys('*');
    console.log(`📋 Encontradas ${keys.length} chave(s)\n`);

    if (keys.length > 0) {
      // Deletar todas as chaves
      console.log('🗑️  Removendo todas as chaves...');
      await redisClient.del(...keys);
      console.log(`✅ ${keys.length} chave(s) removida(s)\n`);
    } else {
      console.log('ℹ️  Nenhuma chave encontrada\n');
    }

    console.log('✅ Redis limpo com sucesso!');
  } catch (error: any) {
    console.error('\n❌ Erro ao limpar Redis:', error.message);
    // Não lançar erro, pois Redis pode não ser crítico
    console.log('⚠️  Continuando mesmo com erro no Redis...\n');
  } finally {
    redisClient.disconnect();
    console.log('🔌 Conexão Redis fechada\n');
  }
}

/**
 * Função principal: dropar todos os bancos
 */
async function dropAllDatabases(): Promise<void> {
  try {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║  ⚠️  ATENÇÃO: DROPANDO TODOS OS BANCOS DE DADOS!  ⚠️      ║');
    console.log('║                                                           ║');
    console.log('║  Esta operação é IRREVERSÍVEL e deletará:                ║');
    console.log('║  • MongoDB (Users, Instances)                            ║');
    console.log('║  • PostgreSQL (CRM, Mensagens, Disparos, etc)           ║');
    console.log('║  • Redis (Cache)                                          ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Dropar MongoDB
    await dropMongoDB();

    // Dropar PostgreSQL
    await dropPostgreSQL();

    // Limpar Redis
    await dropRedis();

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║  ✅ TODOS OS BANCOS DE DADOS FORAM DROPADOS COM SUCESSO! ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
  } catch (error: any) {
    console.error('\n❌ Erro ao dropar bancos de dados:', error.message);
    if (error.code) {
      console.error(`   Código do erro: ${error.code}`);
    }
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  dropAllDatabases();
}

export { dropAllDatabases };

