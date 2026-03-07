/**
 * Serviço de base vetorizada por agente de IA (Supabase pgvector + OpenAI embeddings)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import { SUPABASE_CONFIG, OPENAI_CONFIG } from '../config/constants';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 200;
const MATCH_COUNT = 5;
const MAX_CHUNKS_PER_REQUEST = 30;

let supabase: SupabaseClient | null = null;

function ensureValidSupabaseUrl(): void {
  const url = (SUPABASE_CONFIG.URL || '').trim();
  if (!url) {
    throw new Error('SUPABASE_URL não está definida. Configure SUPABASE_URL no .env com a URL do projeto (ex: https://xxx.supabase.co).');
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('SUPABASE_URL deve usar http ou https.');
    }
  } catch (e) {
    if (e instanceof TypeError && (e as Error).message?.includes('Invalid URL')) {
      throw new Error('SUPABASE_URL inválida. Configure no .env uma URL válida (ex: https://seu-projeto.supabase.co).');
    }
    throw e;
  }
  if (!SUPABASE_CONFIG.SERVICE_ROLE_KEY?.trim()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não está definida. Configure no .env.');
  }
}

function getSupabase(): SupabaseClient {
  if (!supabase) {
    ensureValidSupabaseUrl();
    supabase = createClient(SUPABASE_CONFIG.URL!.trim(), SUPABASE_CONFIG.SERVICE_ROLE_KEY!);
  }
  return supabase;
}

/**
 * Gerar embedding via OpenAI (cópia segura do array para evitar RangeError)
 */
async function getEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_CONFIG.API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada');
  }
  const response = await axios.post(
    'https://api.openai.com/v1/embeddings',
    {
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  const data = response.data;
  const first = data?.data?.[0];
  const raw = first?.embedding;
  if (!raw || typeof raw !== 'object' || typeof raw.length !== 'number') {
    throw new Error('Resposta de embedding inválida');
  }
  if (raw.length < EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding deve ter pelo menos ${EMBEDDING_DIMENSIONS} dimensões, recebido: ${raw.length}`);
  }
  const embedding: number[] = [];
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    embedding.push(Number(raw[i]));
  }
  return embedding;
}

/**
 * Dividir texto em chunks com sobreposição
 */
function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + CHUNK_SIZE, trimmed.length);
    let slice = trimmed.slice(start, end);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > CHUNK_SIZE / 2 && end < trimmed.length) {
      slice = slice.slice(0, lastSpace + 1);
    }
    if (slice.trim()) chunks.push(slice.trim());
    start += slice.length - CHUNK_OVERLAP;
    if (start <= 0 || start < end) start = end; // garantir avanço para evitar loop infinito
  }
  return chunks;
}

/**
 * Adicionar conteúdo à base vetorizada do agente (chunk + embed + insert)
 */
export async function addDocumentsToAgent(agentId: string, content: string): Promise<{ count: number }> {
  ensureValidSupabaseUrl();
  const allChunks = chunkText(content);
  if (allChunks.length === 0) return { count: 0 };

  const chunks = allChunks.slice(0, MAX_CHUNKS_PER_REQUEST);
  if (allChunks.length > MAX_CHUNKS_PER_REQUEST) {
    console.warn(`[agentVectorStore] Limitando a ${MAX_CHUNKS_PER_REQUEST} chunks nesta requisição (total: ${allChunks.length}). Adicione o restante em outra vez.`);
  }

  let inserted = 0;
  const supabaseUrl = (SUPABASE_CONFIG.URL || '').trim().replace(/\/$/, '');
  const supabaseKey = SUPABASE_CONFIG.SERVICE_ROLE_KEY;

  for (const chunk of chunks) {
    let embeddingRaw: number[];
    try {
      embeddingRaw = await getEmbedding(chunk);
    } catch (e) {
      console.error('[agentVectorStore] getEmbedding error:', (e as Error).name, (e as Error).message, (e as Error).stack);
      throw e;
    }
    const parts: string[] = [];
    for (let i = 0; i < embeddingRaw.length; i++) {
      parts.push(String(embeddingRaw[i]));
    }
    const embeddingStr = `[${parts.join(',')}]`;
    const body = {
      content: chunk,
      metadata: { agent_id: agentId },
      agent_id: agentId,
      embedding: embeddingStr,
    };
    try {
      const res = await axios.post(`${supabaseUrl}/rest/v1/documents`, body, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        timeout: 30000,
        validateStatus: () => true,
      });
      if (res.status >= 400) {
        const errMsg = res.data?.message || res.statusText || String(res.status);
        console.error('[agentVectorStore] Erro ao inserir chunk:', res.status, res.data);
        throw new Error(`Falha ao indexar: ${errMsg}`);
      }
      inserted++;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        throw new Error(`Falha ao indexar: ${err.response.data?.message || err.message}`);
      }
      throw err;
    }
  }

  return { count: inserted };
}

/**
 * Buscar documentos relevantes para o agente (RAG)
 */
export async function searchAgentDocuments(agentId: string, query: string, limit: number = MATCH_COUNT): Promise<string[]> {
  if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.SERVICE_ROLE_KEY) {
    return [];
  }
  try {
    const embedding = await getEmbedding(query);
    const client = getSupabase();
    const { data, error } = await client.rpc('match_documents', {
      query_embedding: embedding,
      match_count: limit,
      filter: { agent_id: agentId },
    });
    if (error) {
      console.warn('[agentVectorStore] Erro na busca:', error.message);
      return [];
    }
    if (!Array.isArray(data) || data.length === 0) return [];
    return data
      .map((row: { content?: string }) => row?.content)
      .filter((c): c is string => typeof c === 'string');
  } catch (err) {
    console.warn('[agentVectorStore] searchAgentDocuments:', err);
    return [];
  }
}

/**
 * Retornar contexto formatado para injetar no prompt (texto dos chunks)
 */
export async function getVectorContextForPrompt(agentId: string, query: string): Promise<string> {
  const chunks = await searchAgentDocuments(agentId, query);
  if (chunks.length === 0) return '';
  return [
    'Base de conhecimento (use apenas se for relevante para responder):',
    ...chunks.map((c, i) => `[${i + 1}] ${c}`),
  ].join('\n\n');
}

/**
 * Deletar todos os documentos do agente (ao deletar o agente)
 */
export async function deleteDocumentsByAgentId(agentId: string): Promise<number> {
  const client = getSupabase();
  const { data, error } = await client.from('documents').delete().eq('agent_id', agentId).select('id');
  if (error) {
    console.error('[agentVectorStore] Erro ao deletar documentos:', error);
    throw new Error(`Falha ao limpar base do agente: ${error.message}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Contar documentos do agente
 */
export async function getDocumentCountByAgentId(agentId: string): Promise<number> {
  const client = getSupabase();
  const { count, error } = await client.from('documents').select('*', { count: 'exact', head: true }).eq('agent_id', agentId);
  if (error) {
    console.warn('[agentVectorStore] getDocumentCount:', error.message);
    return 0;
  }
  return count ?? 0;
}
