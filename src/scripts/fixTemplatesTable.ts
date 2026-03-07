/**
 * Script para verificar e corrigir a tabela templates
 * Adiciona a coluna content se não existir
 */

// dotenv já é carregado em ../config/constants.ts
import { Pool } from 'pg';
import { POSTGRES_CONFIG } from '../config/constants';

const POSTGRES_URI = POSTGRES_CONFIG.URI;

const pool = new Pool({
  connectionString: POSTGRES_URI,
  max: 1,
});

async function fixTemplatesTable() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verificando estrutura da tabela templates...\n');
    
    // Verificar se a tabela existe
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'templates'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('❌ Tabela templates não existe! Execute a migration primeiro.');
      return;
    }
    
    console.log('✅ Tabela templates existe');
    
    // Verificar se a coluna content existe
    const columnExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'templates' 
        AND column_name = 'content'
      );
    `);
    
    if (columnExists.rows[0].exists) {
      console.log('✅ Coluna content já existe');
    } else {
      console.log('⚠️  Coluna content não existe. Adicionando...');
      
      await client.query(`
        ALTER TABLE templates 
        ADD COLUMN content JSONB NOT NULL DEFAULT '{}'::jsonb;
      `);
      
      console.log('✅ Coluna content adicionada com sucesso!');
    }
    
    // Verificar todas as colunas
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'templates'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 Colunas da tabela templates:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });
    
    // Verificar se precisa adicionar outras colunas da migration
    const requiredColumns = ['id', 'user_id', 'name', 'type', 'content', 'created_at', 'updated_at'];
    const existingColumns = columns.rows.map(r => r.column_name);
    
    console.log('\n🔍 Verificando colunas obrigatórias...');
    for (const reqCol of requiredColumns) {
      if (!existingColumns.includes(reqCol)) {
        console.log(`⚠️  Coluna ${reqCol} não existe!`);
      }
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

fixTemplatesTable();

