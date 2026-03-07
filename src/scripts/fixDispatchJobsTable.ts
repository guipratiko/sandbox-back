/**
 * Script para verificar e criar a tabela dispatch_jobs se não existir
 */

// dotenv já é carregado em ../config/constants.ts
import { Pool } from 'pg';
import { POSTGRES_CONFIG } from '../config/constants';

const POSTGRES_URI = POSTGRES_CONFIG.URI;

const pool = new Pool({
  connectionString: POSTGRES_URI,
  max: 1,
});

async function fixDispatchJobsTable() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verificando tabela dispatch_jobs...\n');
    
    // Verificar se a tabela existe
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'dispatch_jobs'
      );
    `);
    
    if (tableExists.rows[0].exists) {
      console.log('✅ Tabela dispatch_jobs já existe');
      
      // Verificar colunas
      const columns = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'dispatch_jobs'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📋 Colunas da tabela dispatch_jobs:');
      columns.rows.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.log('⚠️  Tabela dispatch_jobs não existe. Criando...');
      
      await client.query(`
        CREATE TABLE dispatch_jobs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          dispatch_id UUID NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
          contact_data JSONB NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'invalid')),
          message_id VARCHAR(255),
          error_message TEXT,
          scheduled_at TIMESTAMP NOT NULL,
          sent_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Criar índices
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_dispatch_id
        ON dispatch_jobs(dispatch_id);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_status
        ON dispatch_jobs(status);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_scheduled_at
        ON dispatch_jobs(scheduled_at) WHERE status = 'pending';
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_dispatch_status
        ON dispatch_jobs(dispatch_id, status);
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_message_id
        ON dispatch_jobs(message_id) WHERE message_id IS NOT NULL;
      `);
      
      console.log('✅ Tabela dispatch_jobs criada com sucesso!');
    }
    
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

fixDispatchJobsTable();

