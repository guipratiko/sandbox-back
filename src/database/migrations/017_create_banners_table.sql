-- Migration: Criar tabela de banners para o dashboard
-- Esta tabela armazena banners informativos e promocionais

-- Habilitar extensão UUID (se ainda não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: banners
-- Armazena banners informativos e promocionais do dashboard
-- ============================================
CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_url TEXT NOT NULL, -- URL da imagem do banner (820x312px)
  link_url TEXT, -- URL de destino quando o banner é clicado (opcional)
  title VARCHAR(255), -- Título do banner (opcional, para acessibilidade)
  "order" INTEGER NOT NULL DEFAULT 0, -- Ordem de exibição (menor número = primeiro)
  is_active BOOLEAN NOT NULL DEFAULT true, -- Se o banner está ativo
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índice para busca rápida por banners ativos ordenados
CREATE INDEX IF NOT EXISTS idx_banners_active_order
ON banners(is_active, "order") WHERE is_active = true;

-- Índice para ordenação
CREATE INDEX IF NOT EXISTS idx_banners_order
ON banners("order");

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_banners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_banners_updated_at ON banners;
CREATE TRIGGER trigger_update_banners_updated_at
BEFORE UPDATE ON banners
FOR EACH ROW
EXECUTE FUNCTION update_banners_updated_at();

COMMENT ON TABLE banners IS 'Banners informativos e promocionais exibidos no dashboard';
COMMENT ON COLUMN banners.image_url IS 'URL da imagem do banner (tamanho padrão: 820x312px)';
COMMENT ON COLUMN banners.link_url IS 'URL de destino quando o banner é clicado (opcional)';
COMMENT ON COLUMN banners.title IS 'Título do banner para acessibilidade (opcional)';
COMMENT ON COLUMN banners."order" IS 'Ordem de exibição (menor número = primeiro)';
COMMENT ON COLUMN banners.is_active IS 'Se o banner está ativo e deve ser exibido';
