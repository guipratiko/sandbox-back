/**
 * Script de diagnóstico: lista agentes de IA e o início do prompt no banco.
 * Uso: npm run show-agent-prompts (ou ts-node src/scripts/showAgentPrompts.ts)
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { pgPool } from '../config/databases';

const PREVIEW_CHARS = 2500;

async function main() {
  const r = await pgPool.query(
    `SELECT id, name, agent_type, LENGTH(prompt) as prompt_length, LEFT(prompt, $1) as prompt_start FROM ai_agents ORDER BY updated_at DESC`,
    [PREVIEW_CHARS]
  );

  if (r.rows.length === 0) {
    console.log('Nenhum agente encontrado no banco.');
    return;
  }

  console.log(`\n=== ${r.rows.length} agente(s) em ai_agents ===\n`);

  for (const row of r.rows) {
    console.log('---');
    console.log('ID:', row.id);
    console.log('Nome:', row.name);
    console.log('Tipo:', row.agent_type);
    console.log('Tamanho do prompt:', row.prompt_length, 'caracteres');
    console.log('\nInício do prompt (primeiros', PREVIEW_CHARS, 'caracteres):\n');
    console.log(row.prompt_start || '(vazio)');
    console.log('\n');
  }

  await pgPool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
