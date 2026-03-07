-- Migration: Permitir tipo 'audio' em ai_agent_media (ex: .mp3)
-- Data: 2026-02-23

ALTER TABLE ai_agent_media DROP CONSTRAINT IF EXISTS ai_agent_media_media_type_check;
ALTER TABLE ai_agent_media ADD CONSTRAINT ai_agent_media_media_type_check
  CHECK (media_type IN ('image', 'video', 'file', 'audio'));
