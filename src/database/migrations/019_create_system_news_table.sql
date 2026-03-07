-- Migration: Criar tabela de novidades do sistema
-- Esta tabela armazena novidades, atualizações e anúncios sobre o sistema e ferramentas

-- Habilitar extensão UUID (se ainda não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: system_news
-- Armazena novidades, atualizações e anúncios do sistema
-- ============================================
CREATE TABLE IF NOT EXISTS system_news (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL CHECK (type IN ('system_update', 'tool_update', 'announcement')),
  tool VARCHAR(50), -- Ferramenta relacionada: 'whatsapp', 'instagram', 'crm', 'dispatches', 'workflows', 'ai_agent', 'groups', etc.
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  full_content TEXT, -- Conteúdo completo (opcional, para página de detalhes)
  image_url TEXT, -- URL da imagem (opcional)
  published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índice para busca rápida por novidades ativas ordenadas
CREATE INDEX IF NOT EXISTS idx_system_news_active_priority
ON system_news(is_active, priority DESC, published_at DESC) WHERE is_active = true;

-- Índice para busca por tipo
CREATE INDEX IF NOT EXISTS idx_system_news_type
ON system_news(type);

-- Índice para busca por ferramenta
CREATE INDEX IF NOT EXISTS idx_system_news_tool
ON system_news(tool);

-- Índice para ordenação geral
CREATE INDEX IF NOT EXISTS idx_system_news_priority_published
ON system_news(priority DESC, published_at DESC);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_system_news_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_system_news_updated_at ON system_news;
CREATE TRIGGER trigger_update_system_news_updated_at
BEFORE UPDATE ON system_news
FOR EACH ROW
EXECUTE FUNCTION update_system_news_updated_at();

COMMENT ON TABLE system_news IS 'Novidades, atualizações e anúncios sobre o sistema e ferramentas';
COMMENT ON COLUMN system_news.type IS 'Tipo: system_update, tool_update, announcement';
COMMENT ON COLUMN system_news.tool IS 'Ferramenta relacionada (opcional): whatsapp, instagram, crm, dispatches, workflows, ai_agent, groups, etc.';
COMMENT ON COLUMN system_news.title IS 'Título da novidade';
COMMENT ON COLUMN system_news.description IS 'Descrição resumida da novidade';
COMMENT ON COLUMN system_news.full_content IS 'Conteúdo completo (opcional, para página de detalhes)';
COMMENT ON COLUMN system_news.image_url IS 'URL da imagem (opcional)';
COMMENT ON COLUMN system_news.published_at IS 'Data de publicação';
COMMENT ON COLUMN system_news.is_active IS 'Se a novidade está ativa e deve ser exibida';
COMMENT ON COLUMN system_news.priority IS 'Prioridade de exibição (1-10, maior = mais importante)';
