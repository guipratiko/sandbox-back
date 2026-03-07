/**
 * Serviço de mídias do agente de IA (imagem, vídeo, arquivo).
 * ID curto para referência no prompt: "use a tool ID: CbWa3"
 */

import { pgPool } from '../config/databases';
import { generateShortId } from '../utils/shortId';

export type MediaType = 'image' | 'video' | 'file' | 'audio';

export interface AgentMedia {
  id: string;
  agentId: string;
  mediaType: MediaType;
  url: string;
  caption: string | null;
  maxUsesPerContact: number;
  createdAt: Date;
}

export interface CreateAgentMediaData {
  agentId: string;
  mediaType: MediaType;
  url: string;
  caption?: string | null;
  maxUsesPerContact?: number;
}

async function ensureUniqueShortId(agentId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = generateShortId(6);
    const existing = await pgPool.query(
      'SELECT 1 FROM ai_agent_media WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) return id;
  }
  return generateShortId(8);
}

export async function create(data: CreateAgentMediaData): Promise<AgentMedia> {
  const id = await ensureUniqueShortId(data.agentId);
  const maxUses = Math.max(1, data.maxUsesPerContact ?? 1);
  await pgPool.query(
    `INSERT INTO ai_agent_media (id, agent_id, media_type, url, caption, max_uses_per_contact)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, data.agentId, data.mediaType, data.url, data.caption ?? null, maxUses]
  );
  const row = await pgPool.query(
    'SELECT * FROM ai_agent_media WHERE id = $1',
    [id]
  );
  return mapRow(row.rows[0]);
}

export async function listByAgentId(agentId: string): Promise<AgentMedia[]> {
  const result = await pgPool.query(
    'SELECT * FROM ai_agent_media WHERE agent_id = $1 ORDER BY created_at ASC',
    [agentId]
  );
  return result.rows.map(mapRow);
}

export async function getByIdAndAgentId(
  id: string,
  agentId: string
): Promise<AgentMedia | null> {
  const result = await pgPool.query(
    'SELECT * FROM ai_agent_media WHERE id = $1 AND agent_id = $2',
    [id, agentId]
  );
  if (result.rows.length === 0) return null;
  return mapRow(result.rows[0]);
}

export async function deleteByIdAndAgentId(
  id: string,
  agentId: string
): Promise<boolean> {
  const result = await pgPool.query(
    'DELETE FROM ai_agent_media WHERE id = $1 AND agent_id = $2',
    [id, agentId]
  );
  return (result.rowCount ?? 0) > 0;
}

function mapRow(row: any): AgentMedia {
  return {
    id: row.id,
    agentId: row.agent_id,
    mediaType: row.media_type,
    url: row.url,
    caption: row.caption,
    maxUsesPerContact: row.max_uses_per_contact ?? 1,
    createdAt: row.created_at,
  };
}
