/**
 * Serviço de localizações do agente de IA.
 * Várias localizações com ID curto para a LLM escolher qual enviar.
 */

import { pgPool } from '../config/databases';
import { generateShortId } from '../utils/shortId';

export interface AgentLocation {
  id: string;
  agentId: string;
  name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  maxUsesPerContact: number;
  createdAt: Date;
}

export interface CreateAgentLocationData {
  agentId: string;
  name?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  maxUsesPerContact?: number;
}

async function ensureUniqueShortId(agentId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = generateShortId(6);
    const existing = await pgPool.query(
      'SELECT 1 FROM ai_agent_locations WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) return id;
  }
  return generateShortId(8);
}

export async function create(data: CreateAgentLocationData): Promise<AgentLocation> {
  const id = await ensureUniqueShortId(data.agentId);
  const maxUses = Math.max(1, data.maxUsesPerContact ?? 1);
  await pgPool.query(
    `INSERT INTO ai_agent_locations (id, agent_id, name, address, latitude, longitude, max_uses_per_contact)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      data.agentId,
      data.name ?? null,
      data.address ?? null,
      data.latitude,
      data.longitude,
      maxUses,
    ]
  );
  const row = await pgPool.query(
    'SELECT * FROM ai_agent_locations WHERE id = $1',
    [id]
  );
  return mapRow(row.rows[0]);
}

export async function listByAgentId(agentId: string): Promise<AgentLocation[]> {
  const result = await pgPool.query(
    'SELECT * FROM ai_agent_locations WHERE agent_id = $1 ORDER BY created_at ASC',
    [agentId]
  );
  return result.rows.map(mapRow);
}

export async function getByIdAndAgentId(
  id: string,
  agentId: string
): Promise<AgentLocation | null> {
  const result = await pgPool.query(
    'SELECT * FROM ai_agent_locations WHERE id = $1 AND agent_id = $2',
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
    'DELETE FROM ai_agent_locations WHERE id = $1 AND agent_id = $2',
    [id, agentId]
  );
  return (result.rowCount ?? 0) > 0;
}

function mapRow(row: any): AgentLocation {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    maxUsesPerContact: row.max_uses_per_contact ?? 1,
    createdAt: row.created_at,
  };
}
