-- Migration: Criar tabelas para templates e agendamentos de mensagens de grupos
-- Esta migration adiciona suporte a:
-- - Templates reutilizáveis de mensagens para grupos
-- - Mensagens agendadas (envios futuros) para grupos

-- ============================================
-- TABELA: group_message_templates
-- Armazena templates reutilizáveis de mensagens para grupos
-- ============================================

CREATE TABLE IF NOT EXISTS group_message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL,        -- ObjectId do usuário (MongoDB)
  instance_id VARCHAR(24) NOT NULL,    -- ObjectId da instância (MongoDB)
  name VARCHAR(255) NOT NULL,          -- Nome amigável do template
  description TEXT,                    -- Descrição opcional
  message_type VARCHAR(20) NOT NULL CHECK (
    message_type IN ('text', 'media', 'poll', 'contact', 'location', 'audio')
  ),
  content_json JSONB NOT NULL,         -- Conteúdo específico por tipo (texto, mídia, opções, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_group_message_templates_user
  ON group_message_templates(user_id);

CREATE INDEX IF NOT EXISTS idx_group_message_templates_instance
  ON group_message_templates(instance_id);

CREATE INDEX IF NOT EXISTS idx_group_message_templates_user_instance
  ON group_message_templates(user_id, instance_id);

CREATE INDEX IF NOT EXISTS idx_group_message_templates_type
  ON group_message_templates(message_type);

-- ============================================
-- TABELA: group_scheduled_messages
-- Armazena mensagens de grupos agendadas para envio futuro
-- ============================================

CREATE TABLE IF NOT EXISTS group_scheduled_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL,        -- ObjectId do usuário (MongoDB)
  instance_id VARCHAR(24) NOT NULL,    -- ObjectId da instância (MongoDB)
  template_id UUID,                    -- Template associado (opcional)
  message_type VARCHAR(20) NOT NULL CHECK (
    message_type IN ('text', 'media', 'poll', 'contact', 'location', 'audio')
  ),
  content_json JSONB NOT NULL,         -- Conteúdo efetivo da mensagem (snapshot do template + overrides)
  target_type VARCHAR(20) NOT NULL CHECK (
    target_type IN ('all', 'specific')
  ),
  group_ids TEXT[] DEFAULT NULL,       -- Lista de groupJids quando target_type = 'specific'
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'processing', 'sent', 'failed', 'cancelled')
  ),
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_group_scheduled_messages_user
  ON group_scheduled_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_group_scheduled_messages_instance
  ON group_scheduled_messages(instance_id);

CREATE INDEX IF NOT EXISTS idx_group_scheduled_messages_status
  ON group_scheduled_messages(status);

CREATE INDEX IF NOT EXISTS idx_group_scheduled_messages_scheduled_at
  ON group_scheduled_messages(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_group_scheduled_messages_user_instance
  ON group_scheduled_messages(user_id, instance_id);

-- Comentários
COMMENT ON TABLE group_message_templates IS 'Templates reutilizáveis de mensagens para grupos (texto, mídia, enquete, contato, localização, áudio).';
COMMENT ON TABLE group_scheduled_messages IS 'Mensagens de grupos agendadas para envio futuro, com suporte a diferentes tipos e múltiplos grupos.';

