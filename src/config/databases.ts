/**
 * Configuração e gerenciamento de todas as conexões de banco de dados
 * - MongoDB: User e Instance
 * - PostgreSQL: CRM (Contact, Message, CRMColumn)
 * - Redis: Cache e Sessões
 */

import mongoose from 'mongoose';
import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import { DATABASE_CONFIG, POSTGRES_CONFIG, REDIS_CONFIG } from './constants';

// Carregar dotenv aqui também para garantir que está carregado
import dotenv from 'dotenv';
dotenv.config();

// ============================================
// MongoDB (User e Instance)
// ============================================
export const connectMongoDB = async (): Promise<void> => {
  try {
    await mongoose.connect(DATABASE_CONFIG.URI);
    console.log('✅ Conectado ao MongoDB com sucesso');
  } catch (error) {
    console.error('❌ Erro ao conectar ao MongoDB:', error);
    process.exit(1);
  }
};

// Event listeners para MongoDB
mongoose.connection.on('disconnected', () => {
  // MongoDB desconectado (log removido para reduzir verbosidade)
});

mongoose.connection.on('error', (error) => {
  console.error('❌ Erro na conexão MongoDB:', error);
});

// ============================================
// PostgreSQL (CRM e Conversas)
// ============================================
// Garantir que temos uma connection string válida
// Priorizar process.env diretamente (importante para Docker/produção)
const postgresConnectionString = 
  process.env.POSTGRES_URI || 
  process.env.DATABASE_URL || 
  POSTGRES_CONFIG.URI;

if (!postgresConnectionString || postgresConnectionString.trim() === '') {
  console.error('❌ POSTGRES_URI não configurada!');
  console.error('Variáveis de ambiente disponíveis:', {
    POSTGRES_URI: process.env.POSTGRES_URI ? 'definida' : 'não definida',
    DATABASE_URL: process.env.DATABASE_URL ? 'definida' : 'não definida',
    POSTGRES_CONFIG_URI: POSTGRES_CONFIG.URI ? 'definida' : 'não definida',
  });
  throw new Error('POSTGRES_URI não configurada. Verifique as variáveis de ambiente.');
}

// Validar que não é localhost:5432 (padrão inválido)
if (postgresConnectionString.includes('127.0.0.1:5432') || postgresConnectionString.includes('localhost:5432')) {
  console.error('❌ POSTGRES_URI parece estar usando localhost:5432 (padrão inválido)');
  console.error('Connection string recebida:', postgresConnectionString.replace(/:[^:@]+@/, ':****@'));
  throw new Error('POSTGRES_URI configurada incorretamente (localhost:5432). Verifique as variáveis de ambiente.');
}

// Log da connection string (sem senha) para debug
const connectionStringForLog = postgresConnectionString.replace(/:[^:@]+@/, ':****@');
console.log(`📡 Configurando PostgreSQL: ${connectionStringForLog}`);

export const pgPool = new Pool({
  connectionString: postgresConnectionString,
  max: 20, // Máximo de conexões no pool
  idleTimeoutMillis: 30000, // Fechar conexões idle após 30s
  connectionTimeoutMillis: 10000, // Timeout de conexão de 10s (aumentado de 2s)
  keepAlive: true, // Manter conexões vivas
  keepAliveInitialDelayMillis: 10000, // Iniciar keepalive após 10s
});

// Event listeners para PostgreSQL
pgPool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool PostgreSQL:', err);
});

// Função para testar conexão PostgreSQL com retry
export const testPostgreSQL = async (retries: number = 3): Promise<boolean> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Erro ao testar conexão PostgreSQL (tentativa ${attempt}/${retries}):`, errorMessage);
      
      // Se não for a última tentativa, aguardar antes de tentar novamente
      if (attempt < retries) {
        const delay = attempt * 1000; // Delay progressivo: 1s, 2s, 3s
        console.log(`⏳ Aguardando ${delay}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
};

// Função para obter cliente PostgreSQL (para transações)
export const getPostgreSQLClient = async (): Promise<PoolClient> => {
  return await pgPool.connect();
};

// ============================================
// Redis (Cache e Sessões)
// ============================================
export const redisClient = new Redis(REDIS_CONFIG.URI, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

// Event listeners para Redis
redisClient.on('error', (err) => {
  console.error('❌ Erro no Redis:', err);
});

redisClient.on('close', () => {
  // Conexão Redis fechada (log removido)
});

redisClient.on('reconnecting', () => {
  // Reconectando ao Redis (log removido)
});

// Função para testar conexão Redis
export const testRedis = async (): Promise<boolean> => {
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('❌ Erro ao testar conexão Redis:', error);
    return false;
  }
};

// ============================================
// Função para conectar todos os bancos
// ============================================
export const connectAllDatabases = async (): Promise<void> => {
  try {
    // Conectar MongoDB
    await connectMongoDB();

    // Testar PostgreSQL
    const pgConnected = await testPostgreSQL();
    if (pgConnected) {
      console.log('✅ PostgreSQL conectado e testado');
    } else {
      console.warn('⚠️  PostgreSQL não conectado, mas continuando...');
    }

    // Testar Redis
    const redisConnected = await testRedis();
    if (redisConnected) {
      console.log('✅ Redis conectado e testado');
    } else {
      console.warn('⚠️  Redis não conectado, mas continuando...');
    }
  } catch (error) {
    console.error('❌ Erro ao conectar bancos de dados:', error);
    throw error;
  }
};

// ============================================
// Função para fechar todas as conexões
// ============================================
export const closeAllDatabases = async (): Promise<void> => {
  try {
    // Fechar MongoDB
    await mongoose.connection.close();
    console.log('✅ MongoDB desconectado');

    // Fechar PostgreSQL
    await pgPool.end();
    console.log('✅ PostgreSQL desconectado');

    // Fechar Redis
    redisClient.disconnect();
    console.log('✅ Redis desconectado');
  } catch (error) {
    console.error('❌ Erro ao fechar conexões:', error);
  }
};

// ============================================
// Função para verificar status das conexões (para status endpoint)
// ============================================
export const checkDatabaseConnections = async (): Promise<{
  mongodb: boolean;
  postgresql: boolean;
  redis: boolean;
}> => {
  const status = {
    mongodb: false,
    postgresql: false,
    redis: false,
  };

  // Verificar MongoDB
  try {
    status.mongodb = mongoose.connection.readyState === 1; // 1 = connected
  } catch {
    status.mongodb = false;
  }

  // Verificar PostgreSQL
  try {
    status.postgresql = await testPostgreSQL(1); // 1 tentativa rápida
  } catch {
    status.postgresql = false;
  }

  // Verificar Redis
  try {
    status.redis = await testRedis();
  } catch {
    status.redis = false;
  }

  // Se algum banco não estiver conectado, lançar erro
  if (!status.mongodb || !status.postgresql || !status.redis) {
    throw new Error('Algum banco de dados não está conectado');
  }

  return status;
};

// Instâncias já exportadas acima, não precisam ser re-exportadas

