/**
 * Script para testar conexão PostgreSQL
 * Uso: node test-postgres-connection.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const postgresConnectionString = 
  process.env.POSTGRES_URI || 
  process.env.DATABASE_URL || 
  'postgres://clerky:4855bac4d9fe0923e1d9@scancal.com.br:5433/clerkydb?sslmode=disable';

console.log('🔍 Testando conexão PostgreSQL...');
console.log('📍 URL:', postgresConnectionString.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({
  connectionString: postgresConnectionString,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

async function testConnection() {
  let client;
  try {
    console.log('\n⏳ Tentando conectar...');
    const startTime = Date.now();
    
    client = await pool.connect();
    const connectTime = Date.now() - startTime;
    
    console.log(`✅ Conexão estabelecida em ${connectTime}ms`);
    
    console.log('\n📊 Testando query...');
    const queryStartTime = Date.now();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    const queryTime = Date.now() - queryStartTime;
    
    console.log(`✅ Query executada em ${queryTime}ms`);
    console.log('🕐 Hora do servidor:', result.rows[0].current_time);
    console.log('📦 Versão PostgreSQL:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);
    
    // Testar algumas queries adicionais
    console.log('\n📊 Verificando informações do banco...');
    const dbInfo = await client.query(`
      SELECT 
        current_database() as database,
        current_user as user,
        inet_server_addr() as server_ip,
        inet_server_port() as server_port
    `);
    
    console.log('📁 Banco de dados:', dbInfo.rows[0].database);
    console.log('👤 Usuário:', dbInfo.rows[0].user);
    console.log('🌐 IP do servidor:', dbInfo.rows[0].server_ip || 'N/A');
    console.log('🔌 Porta do servidor:', dbInfo.rows[0].server_port || 'N/A');
    
    client.release();
    console.log('\n✅ Teste de conexão concluído com sucesso!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Erro ao conectar:', error.message);
    
    if (error.code) {
      console.error('📋 Código do erro:', error.code);
    }
    
    if (error.message.includes('timeout')) {
      console.error('\n💡 Possíveis causas:');
      console.error('   - PostgreSQL não está respondendo');
      console.error('   - Firewall bloqueando a conexão');
      console.error('   - Servidor sobrecarregado');
      console.error('   - Problema de rede');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Possíveis causas:');
      console.error('   - PostgreSQL não está rodando');
      console.error('   - Porta incorreta');
      console.error('   - Servidor não está acessível');
    } else if (error.message.includes('password')) {
      console.error('\n💡 Possíveis causas:');
      console.error('   - Senha incorreta');
      console.error('   - Usuário não existe');
    }
    
    if (client) {
      client.release();
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testConnection();
