'use strict';
require('dotenv').config();

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('\nERRO: Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no arquivo .env antes de rodar este script.\n');
  process.exit(1);
}

const SCHEMA = `
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

CREATE INDEX IF NOT EXISTS idx_ag_data   ON agendamentos (data_agendamento);
CREATE INDEX IF NOT EXISTS idx_ag_status ON agendamentos (status);
CREATE INDEX IF NOT EXISTS idx_ag_nome   ON agendamentos (nome_paciente);
CREATE INDEX IF NOT EXISTS idx_vd_data   ON vendas (data_agendamento);
CREATE INDEX IF NOT EXISTS idx_an_criado ON anamneses (criado_em DESC);

CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ag_atualizado ON agendamentos;
CREATE TRIGGER trg_ag_atualizado
  BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

ALTER TABLE agendamentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendas        DISABLE ROW LEVEL SECURITY;
ALTER TABLE anamneses     DISABLE ROW LEVEL SECURITY;
`;

async function run() {
  console.log('\nCriando tabelas no Supabase...\n');

  const res = await fetch(`${SUPABASE_URL}/pg-meta/v1/query`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: SCHEMA }),
  });

  const body = await res.json();

  if (!res.ok) {
    console.error('Erro ao criar tabelas:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log('Tabelas criadas com sucesso!\n');
  console.log('Verificando conexao...');

  // Testa insert + delete para confirmar
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const { error: e1 } = await sb.from('agendamentos').select('id').limit(1);
  const { error: e2 } = await sb.from('vendas').select('id').limit(1);
  const { error: e3 } = await sb.from('anamneses').select('id').limit(1);

  if (e1 || e2 || e3) {
    console.error('Tabelas criadas mas houve erro na verificacao:', e1 || e2 || e3);
    process.exit(1);
  }

  console.log('agendamentos  OK');
  console.log('vendas        OK');
  console.log('anamneses     OK');
  console.log('\nSetup concluido! O sistema esta pronto para uso com Supabase.\n');
}

run().catch(err => { console.error(err); process.exit(1); });
