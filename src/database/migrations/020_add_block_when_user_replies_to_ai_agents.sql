-- Migration: Bloqueio do agente quando o usuário conversa com o contato
-- block_when_user_replies: ativa o bloqueio ao responder
-- block_duration: valor numérico (ex: 30)
-- block_duration_unit: 'minutes' | 'hours' | 'days' | 'permanent'

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS block_when_user_replies BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS block_duration INTEGER NULL;

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS block_duration_unit VARCHAR(20) NULL
  CONSTRAINT check_block_duration_unit CHECK (
    block_duration_unit IS NULL
    OR block_duration_unit IN ('minutes', 'hours', 'days', 'permanent')
  );

COMMENT ON COLUMN ai_agents.block_when_user_replies IS 'Se true, ao usuário enviar mensagem para o contato o agente para de responder por um período';
COMMENT ON COLUMN ai_agents.block_duration IS 'Valor do período (ex: 30). Obrigatório se block_when_user_replies=true e unit não for permanent';
COMMENT ON COLUMN ai_agents.block_duration_unit IS 'minutes, hours, days ou permanent';
