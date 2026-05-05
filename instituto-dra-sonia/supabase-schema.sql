-- ============================================================
-- Instituto Dra Sônia Machado — Schema Supabase
-- Execute este SQL no Supabase: SQL Editor → New query → Run
-- ============================================================

-- ── Tabela: agendamentos ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendamentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servico_id       INTEGER,
  servico_nome     TEXT,
  nome_paciente    TEXT NOT NULL,
  telefone_paciente TEXT,
  data_agendamento DATE NOT NULL,
  horario          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'agendado',
  observacoes      TEXT,
  queixa           TEXT,
  valor            NUMERIC,
  forma_pagamento  TEXT,
  origem           TEXT DEFAULT 'manual',
  criado_em        TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tabela: vendas (lançamentos manuais) ─────────────────────
CREATE TABLE IF NOT EXISTS vendas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             TEXT DEFAULT 'venda_manual',
  data_agendamento DATE NOT NULL,
  servico_id       INTEGER,
  servico_nome     TEXT,
  descricao        TEXT,
  valor            NUMERIC NOT NULL,
  forma_pagamento  TEXT,
  criado_em        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tabela: anamneses ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anamneses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT NOT NULL,
  nascimento   DATE,
  telefone     TEXT,
  procedimento TEXT,
  regiao       TEXT,
  incomoda     TEXT,
  resultado    TEXT,
  respostas    JSONB DEFAULT '{}',
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Índices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ag_data     ON agendamentos (data_agendamento);
CREATE INDEX IF NOT EXISTS idx_ag_status   ON agendamentos (status);
CREATE INDEX IF NOT EXISTS idx_ag_nome     ON agendamentos (nome_paciente);
CREATE INDEX IF NOT EXISTS idx_vd_data     ON vendas (data_agendamento);
CREATE INDEX IF NOT EXISTS idx_an_criado   ON anamneses (criado_em DESC);

-- ============================================================
-- Trigger: atualiza atualizado_em automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ag_atualizado ON agendamentos;
CREATE TRIGGER trg_ag_atualizado
  BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ============================================================
-- RLS (Row Level Security)
-- O backend Express autentica os usuários — o Supabase só
-- precisa permitir que a anon key leia/escreva nas tabelas.
-- ============================================================
ALTER TABLE agendamentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendas        DISABLE ROW LEVEL SECURITY;
ALTER TABLE anamneses     DISABLE ROW LEVEL SECURITY;

-- ALTERNATIVA mais segura: habilitar RLS e permitir tudo para anon
-- (use se quiser manter RLS ativo)
--
-- ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "allow_all_anon" ON agendamentos FOR ALL TO anon USING (true) WITH CHECK (true);
-- ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "allow_all_anon" ON vendas FOR ALL TO anon USING (true) WITH CHECK (true);
-- ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "allow_all_anon" ON anamneses FOR ALL TO anon USING (true) WITH CHECK (true);
