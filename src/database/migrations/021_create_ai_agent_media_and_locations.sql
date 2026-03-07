-- Migration: Tabelas de mídia e localização por agente de IA (tools para LLM)
-- Data: 2026-02-23

-- Mídias: imagem, vídeo ou arquivo; ID curto (6 chars) para referência no prompt
CREATE TABLE IF NOT EXISTS ai_agent_media (
  id VARCHAR(10) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL,
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'video', 'file')),
  url TEXT NOT NULL,
  caption TEXT,
  max_uses_per_contact INTEGER NOT NULL DEFAULT 1 CHECK (max_uses_per_contact > 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_media_agent_id ON ai_agent_media(agent_id);

-- Localizações: várias por agente; ID curto para a LLM escolher qual enviar
CREATE TABLE IF NOT EXISTS ai_agent_locations (
  id VARCHAR(10) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL,
  name VARCHAR(255),
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  max_uses_per_contact INTEGER NOT NULL DEFAULT 1 CHECK (max_uses_per_contact > 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_locations_agent_id ON ai_agent_locations(agent_id);
