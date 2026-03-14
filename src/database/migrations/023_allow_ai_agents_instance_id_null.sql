-- Permitir agentes de IA sem instância (ex.: quando a instância é deletada, o agente fica suspenso)
-- Data: 2025-03-14

ALTER TABLE ai_agents
  ALTER COLUMN instance_id DROP NOT NULL;
