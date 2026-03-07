/**
 * Script para verificar e corrigir a constraint de tipo de templates
 * 
 * Uso: npm run check-constraint
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

async function fixConstraint() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verificando e corrigindo constraint de templates...\n');

    // 1. Verificar constraints existentes
    const constraintsQuery = `
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name LIKE '%type%'
        AND constraint_schema = 'public'
    `;

    const constraintsResult = await client.query(constraintsQuery);
    console.log('📋 Constraints encontradas:', constraintsResult.rows.length);
    constraintsResult.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.constraint_name}: ${row.check_clause}`);
    });

    // 2. Remover todas as constraints relacionadas ao tipo (incluindo outras tabelas se necessário)
    console.log('\n🗑️  Removendo constraints antigas...');
    const dropConstraintsQuery = `
      SELECT constraint_name, table_name
      FROM information_schema.table_constraints
      WHERE (table_name = 'templates' OR table_name LIKE '%template%' OR table_name LIKE '%dispatch%')
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%type%'
    `;

    const dropResult = await client.query(dropConstraintsQuery);
    for (const row of dropResult.rows) {
      try {
        await client.query(`ALTER TABLE ${row.table_name} DROP CONSTRAINT IF EXISTS ${row.constraint_name}`);
        console.log(`   ✅ Removida: ${row.constraint_name} da tabela ${row.table_name}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        console.log(`   ⚠️  Erro ao remover ${row.constraint_name}: ${errorMessage}`);
      }
    }

    // 3. Recriar constraint correta (usando os nomes corretos: image_caption e video_caption)
    console.log('\n✨ Criando constraint correta...');
    const createConstraintQuery = `
      ALTER TABLE templates
      ADD CONSTRAINT templates_type_check
      CHECK (type IN ('text', 'image', 'image_caption', 'video', 'video_caption', 'audio', 'file', 'sequence'))
    `;

    try {
      await client.query(createConstraintQuery);
      console.log('   ✅ Constraint criada com sucesso!');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      if (errorMessage.includes('already exists')) {
        console.log('   ⚠️  Constraint já existe, pulando...');
      } else {
        throw error;
      }
    }

    // 4. Testar valores válidos
    console.log('\n🧪 Testando valores válidos...');
    const validTypes = ['text', 'image', 'image_caption', 'video', 'video_caption', 'audio', 'file', 'sequence'];
    
    for (const type of validTypes) {
      try {
        const testQuery = `
          SELECT $1::text as test_type 
          WHERE $1::text IN ('text', 'image', 'image_caption', 'video', 'video_caption', 'audio', 'file', 'sequence')
        `;
        const testResult = await client.query(testQuery, [type]);
        if (testResult.rows.length > 0) {
          console.log(`   ✅ "${type}" - OK`);
        } else {
          console.log(`   ❌ "${type}" - FALHOU na validação`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        console.log(`   ❌ "${type}" - ERRO: ${errorMessage}`);
      }
    }

    // 5. Verificar estrutura da tabela
    console.log('\n📊 Informações da coluna type:');
    const tableInfoQuery = `
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'templates'
        AND column_name = 'type'
    `;

    const tableInfoResult = await client.query(tableInfoQuery);
    tableInfoResult.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type}(${row.character_maximum_length || 'N/A'}), nullable: ${row.is_nullable}`);
    });

    console.log('\n✅ Verificação e correção concluídas!');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro:', errorMessage);
    if (error instanceof Error && 'code' in error) {
      console.error('   Código:', (error as { code: string }).code);
    }
    if (error instanceof Error && error.stack) {
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  fixConstraint();
}

export { fixConstraint };

