/**
 * Script para verificar e corrigir a constraint de tipo de templates
 * 
 * Uso: ts-node-dev --transpile-only src/scripts/checkTemplatesConstraint.ts
 */

// dotenv já é carregado em ../config/constants.ts
import { Pool } from 'pg';
import { POSTGRES_CONFIG } from '../config/constants';

const POSTGRES_URI = POSTGRES_CONFIG.URI;

const pool = new Pool({
  connectionString: POSTGRES_URI,
  max: 1,
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
});

async function checkAndFixConstraint() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verificando constraint de templates...\n');

    // Verificar constraints existentes
    const constraintsQuery = `
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name LIKE '%type%'
        AND constraint_schema = 'public'
    `;

    const constraintsResult = await client.query(constraintsQuery);
    console.log('📋 Constraints encontradas:', constraintsResult.rows);

    // Verificar constraint na tabela
    const tableConstraintsQuery = `
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'templates'
        AND constraint_type = 'CHECK'
    `;

    const tableConstraintsResult = await client.query(tableConstraintsQuery);
    console.log('📋 Constraints na tabela templates:', tableConstraintsResult.rows);

    // Testar valores válidos
    const validTypes = ['text', 'image', 'image_caption', 'video', 'video_caption', 'audio', 'file', 'sequence'];
    console.log('\n🧪 Testando valores válidos...');
    
    for (const type of validTypes) {
      try {
        const testQuery = `SELECT $1::text as test_type WHERE $1::text IN ('text', 'image', 'image_caption', 'video', 'video_caption', 'audio', 'file', 'sequence')`;
        const testResult = await client.query(testQuery, [type]);
        console.log(`  ✅ "${type}" - OK`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        console.log(`  ❌ "${type}" - ERRO: ${errorMessage}`);
      }
    }

    // Verificar estrutura da tabela
    const tableInfoQuery = `
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'templates'
        AND column_name = 'type'
    `;

    const tableInfoResult = await client.query(tableInfoQuery);
    console.log('\n📊 Informações da coluna type:', tableInfoResult.rows);

    console.log('\n✅ Verificação concluída!');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro:', errorMessage);
    if (error instanceof Error && 'code' in error) {
      console.error('   Código:', (error as { code: string }).code);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkAndFixConstraint();
}

export { checkAndFixConstraint };

