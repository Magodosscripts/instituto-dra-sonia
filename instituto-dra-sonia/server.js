'use strict';
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: false });

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURAÇÕES
// ============================================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sonia2024';
const N8N_API_KEY    = process.env.N8N_API_KEY    || null;
const USE_SUPABASE   = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

// ============================================================
// SERVIÇOS (lista estática — não precisa de tabela)
// ============================================================
const SERVICOS = [
  { id: 1,  nome: 'Bioestimuladores de Colágeno',            preco_min: null, preco_max: null },
  { id: 2,  nome: 'Botox',                                    preco_min: null, preco_max: null },
  { id: 3,  nome: 'Enzimas Emagrecedoras',                    preco_min: null, preco_max: null },
  { id: 4,  nome: 'Fios de PDO',                              preco_min: null, preco_max: null },
  { id: 5,  nome: 'Harmonização Facial',                      preco_min: 1000, preco_max: 4000 },
  { id: 6,  nome: 'Harmonização de Glúteos e Abdômen',        preco_min: 1000, preco_max: 5000 },
  { id: 7,  nome: 'Limpeza de Pele',                          preco_min: null, preco_max: null },
  { id: 8,  nome: 'Lipo de Papada',                           preco_min: null, preco_max: null },
  { id: 9,  nome: 'PDRN de Salmão',                           preco_min: null, preco_max: null },
  { id: 10, nome: 'Peelings Químicos Exclusivos',             preco_min: null, preco_max: null },
  { id: 11, nome: 'Preenchimento Labial',                     preco_min: null, preco_max: null },
  { id: 12, nome: 'Preenchimento Mandíbula',                  preco_min: null, preco_max: null },
  { id: 13, nome: 'Preenchimento Mento',                      preco_min: null, preco_max: null },
  { id: 14, nome: 'Protocolo Sculpt Power',                   preco_min: null, preco_max: null },
  { id: 15, nome: 'Rejuvenescimento Íntimo Feminino',         preco_min: null, preco_max: null },
  { id: 16, nome: 'Rinomodelação',                            preco_min: null, preco_max: null },
  { id: 17, nome: 'Secagem de Microvasos',                    preco_min: null, preco_max: null },
  { id: 18, nome: 'Skinbooster para Rejuvenescimento Facial', preco_min: null, preco_max: null },
  { id: 19, nome: 'Tratamento Exclusivo para Lipedema',       preco_min: null, preco_max: null },
];

// ============================================================
// SUPABASE (produção)
// ============================================================
let sb = null;
if (USE_SUPABASE) {
  const { createClient } = require('@supabase/supabase-js');
  sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

// ============================================================
// FALLBACK: JSON local (dev sem Supabase)
// ============================================================
const DB = path.join(__dirname, 'dados.json');

function lerDados() {
  if (!fs.existsSync(DB)) {
    const inicial = { proximoId: 1, agendamentos: [], vendas: [], anamneses: [], servicos: SERVICOS, clientes: [], cliente_anamneses: [], cliente_fotos: [] };
    fs.writeFileSync(DB, JSON.stringify(inicial, null, 2), 'utf8');
    return inicial;
  }
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  if (!d.vendas)            d.vendas            = [];
  if (!d.anamneses)         d.anamneses         = [];
  if (!d.clientes)          d.clientes          = [];
  if (!d.cliente_anamneses) d.cliente_anamneses = [];
  if (!d.cliente_fotos)     d.cliente_fotos     = [];
  return d;
}

function salvarDados(d) {
  fs.writeFileSync(DB, JSON.stringify(d, null, 2), 'utf8');
}

// Vincula (ou cria) cliente ao salvar anamnese — fire-and-forget
async function vincularClienteAnamnese(anamBody, anamId) {
  const nome       = anamBody.nome       || null;
  const telefone   = anamBody.telefone   || null;
  const nascimento = anamBody.nascimento || null;
  const procedimento = anamBody.procedimento || null;
  if (!nome) return;

  if (USE_SUPABASE) {
    let clienteId = null;

    if (telefone) {
      const { data } = await sb.from('clientes').select('id').eq('telefone', telefone).maybeSingle();
      if (data) clienteId = data.id;
    }
    if (!clienteId && nome && nascimento) {
      const { data } = await sb.from('clientes').select('id')
        .ilike('nome', nome).eq('data_nascimento', nascimento).maybeSingle();
      if (data) clienteId = data.id;
    }

    if (clienteId) {
      const { data: cli } = await sb.from('clientes')
        .select('telefone,data_nascimento,procedimento_interesse').eq('id', clienteId).single();
      const upd = { updated_at: new Date().toISOString() };
      if (cli && !cli.telefone && telefone)                    upd.telefone = telefone;
      if (cli && !cli.data_nascimento && nascimento)           upd.data_nascimento = nascimento;
      if (cli && !cli.procedimento_interesse && procedimento)  upd.procedimento_interesse = procedimento;
      if (Object.keys(upd).length > 1) await sb.from('clientes').update(upd).eq('id', clienteId);
    } else {
      const { data: novo } = await sb.from('clientes').insert({
        nome,
        telefone:               telefone   || null,
        data_nascimento:        nascimento  || null,
        procedimento_interesse: procedimento || null,
      }).select('id').single();
      if (novo) clienteId = novo.id;
    }

    if (clienteId && anamId) {
      const { data: jaExiste } = await sb.from('cliente_anamneses')
        .select('id').eq('cliente_id', clienteId).eq('anamnese_id', String(anamId)).maybeSingle();
      if (!jaExiste)
        await sb.from('cliente_anamneses').insert({ cliente_id: clienteId, anamnese_id: String(anamId) });
    }
    return;
  }

  // Fallback JSON
  const dados = lerDados();
  let cliente = null;
  if (telefone)
    cliente = dados.clientes.find(c => c.telefone === telefone);
  if (!cliente && nome && nascimento)
    cliente = dados.clientes.find(c =>
      c.nome.toLowerCase() === nome.toLowerCase() && c.data_nascimento === nascimento
    );

  if (cliente) {
    if (!cliente.telefone && telefone)                   cliente.telefone = telefone;
    if (!cliente.data_nascimento && nascimento)          cliente.data_nascimento = nascimento;
    if (!cliente.procedimento_interesse && procedimento) cliente.procedimento_interesse = procedimento;
    cliente.updated_at = agoraISO();
  } else {
    cliente = {
      id: 'c' + Date.now(), nome,
      telefone: telefone || null, email: null, data_nascimento: nascimento || null,
      cpf: null, endereco: null, queixa_principal: null,
      procedimento_interesse: procedimento || null, observacoes: null,
      created_at: agoraISO(), updated_at: agoraISO(),
    };
    dados.clientes.push(cliente);
  }

  const jaExiste = dados.cliente_anamneses.find(
    ca => ca.cliente_id === cliente.id && ca.anamnese_id === String(anamId)
  );
  if (!jaExiste)
    dados.cliente_anamneses.push({ id: 'ca' + Date.now(), cliente_id: cliente.id, anamnese_id: String(anamId), created_at: agoraISO() });

  salvarDados(dados);
}

// ============================================================
// HELPERS
// ============================================================
const HORARIO_INICIO = 8;
const HORARIO_FIM    = 20;

function gerarHorarios() {
  const slots = [];
  for (let h = HORARIO_INICIO; h < HORARIO_FIM; h++) slots.push(`${pad(h)}:00`);
  return slots;
}

function pad(n)     { return String(n).padStart(2, '0'); }
function isoData(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function isoHoje()  { return isoData(new Date()); }
function agoraISO() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

// Retorna { servico_id, servico_nome } a partir de ID numérico ou nome (string)
function resolverServico(ref) {
  if (!ref) return { servico_id: null, servico_nome: null };
  if (/^\d+$/.test(String(ref))) {
    const s = SERVICOS.find(x => x.id === Number(ref));
    return { servico_id: s ? s.id : null, servico_nome: s ? s.nome : 'Serviço não informado' };
  }
  const s = SERVICOS.find(x => x.nome.toLowerCase() === String(ref).toLowerCase());
  return { servico_id: s ? s.id : null, servico_nome: s ? s.nome : String(ref) };
}

// Normaliza body de agendamento — aceita formato admin.html E formato n8n
function normalizarAgendamento(body) {
  const nome     = body.nome_paciente     || body.nome          || body.cliente_nome      || null;
  const telefone = body.telefone_paciente || body.telefone      || body.cliente_telefone  || null;
  const data     = body.data_agendamento  || body.data          || null;
  const horario  = body.horario           || body.horario_inicio || null;

  let servico_id   = null;
  let servico_nome = null;

  if (body.servico_id) {
    ({ servico_id, servico_nome } = resolverServico(body.servico_id));
  } else if (body.procedimento || body.servico || body.servico_nome) {
    ({ servico_id, servico_nome } = resolverServico(body.procedimento || body.servico || body.servico_nome));
  }

  return {
    nome_paciente:     nome,
    telefone_paciente: telefone,
    data_agendamento:  data,
    horario,
    servico_id,
    servico_nome,
    observacoes: body.observacoes || null,
    queixa:      body.queixa      || null,
    origem:      body.origem      || 'manual',
  };
}

// Converte row de anamnese do Supabase para o formato flat que o admin.html espera
function flattenAnamnese(row) {
  if (!row) return row;
  return {
    id:           'f' + row.id,
    criado_em:    row.criado_em || '',
    nome:         row.nome         || '',
    nascimento:   row.nascimento   || '',
    telefone:     row.telefone     || '',
    procedimento: row.procedimento || '',
    regiao:       row.regiao       || '',
    incomoda:     row.incomoda     || '',
    resultado:    row.resultado    || '',
    ...(row.respostas || {}),
  };
}

// Normaliza data_agendamento para garantir formato YYYY-MM-DD na comparação
function toDate(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

// ============================================================
// MIDDLEWARES
// ============================================================
function verificarAdmin(req, res, next) {
  const senha = req.headers['x-admin-password'] || req.query.pwd;
  if (senha !== ADMIN_PASSWORD) return res.status(401).json({ erro: 'Acesso não autorizado' });
  next();
}

// Proteção opcional para o endpoint público usado pelo n8n
function verificarN8N(req, res, next) {
  if (!N8N_API_KEY) return next();
  const chave = req.headers['x-api-key'];
  if (chave !== N8N_API_KEY) return res.status(401).json({ success: false, error: 'API key inválida' });
  next();
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: 'admin.html' }));

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ============================================================
// ROTAS PÚBLICAS
// ============================================================

app.get('/api/servicos', (req, res) => {
  res.json([...SERVICOS].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
});

// Horários disponíveis para o site público
app.get('/api/horarios', async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ erro: 'Data é obrigatória' });
    const todos = gerarHorarios();

    if (USE_SUPABASE) {
      const { data: rows, error } = await sb.from('agendamentos')
        .select('horario').eq('data_agendamento', data).neq('status', 'cancelado');
      if (error) throw error;
      const ocupados = (rows || []).map(r => r.horario);
      return res.json({ data, disponiveis: todos.filter(h => !ocupados.includes(h)), ocupados });
    }

    const { agendamentos } = lerDados();
    const ocupados = agendamentos
      .filter(a => a.data_agendamento === data && a.status !== 'cancelado')
      .map(a => a.horario);
    return res.json({ data, disponiveis: todos.filter(h => !ocupados.includes(h)), ocupados });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
});

// Disponibilidade mensal para o calendário do site público
app.get('/api/disponibilidade', async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ erro: 'Mês obrigatório' });
    const todos = gerarHorarios();
    const [ano, m] = mes.split('-').map(Number);
    const diasNoMes = new Date(ano, m, 0).getDate();

    if (USE_SUPABASE) {
      const inicio = `${mes}-01`;
      const fim    = `${mes}-${pad(diasNoMes)}`;
      const { data: rows, error } = await sb.from('agendamentos')
        .select('data_agendamento, horario')
        .gte('data_agendamento', inicio).lte('data_agendamento', fim)
        .neq('status', 'cancelado');
      if (error) throw error;
      const resultado = {};
      for (let d = 1; d <= diasNoMes; d++) {
        const ds = `${ano}-${pad(m)}-${pad(d)}`;
        const ocupados = (rows || []).filter(r => toDate(r.data_agendamento) === ds).length;
        resultado[ds] = todos.length - ocupados;
      }
      return res.json(resultado);
    }

    const { agendamentos } = lerDados();
    const resultado = {};
    for (let d = 1; d <= diasNoMes; d++) {
      const ds = `${ano}-${pad(m)}-${pad(d)}`;
      const ocupados = agendamentos.filter(a => a.data_agendamento === ds && a.status !== 'cancelado').length;
      resultado[ds] = todos.length - ocupados;
    }
    return res.json(resultado);
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
});

// Criar agendamento — compatível com admin.html (formato antigo) e n8n (formato novo)
app.post('/api/agendamentos', verificarN8N, async (req, res) => {
  try {
    const ag = normalizarAgendamento(req.body);

    if (!ag.nome_paciente || !ag.data_agendamento || !ag.horario) {
      return res.status(400).json({
        success: false,
        error:   'Campos obrigatórios: nome (ou nome_paciente), data (ou data_agendamento) e horario',
        erro:    'Preencha todos os campos obrigatórios',
      });
    }

    if (USE_SUPABASE) {
      const { data: conflito } = await sb
        .from('agendamentos')
        .select('id')
        .eq('data_agendamento', ag.data_agendamento)
        .eq('horario', ag.horario)
        .neq('status', 'cancelado')
        .limit(1)
        .maybeSingle();

      if (conflito) return res.status(409).json({
        success: false, error: 'Horário já ocupado',
        erro: 'Este horário já está ocupado. Por favor, escolha outro.',
      });

      const { data: novo, error } = await sb
        .from('agendamentos')
        .insert({ ...ag, status: 'agendado', valor: null, forma_pagamento: null })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, agendamento: novo, ...novo });
    }

    // Fallback JSON
    const dados = lerDados();
    const conflito = dados.agendamentos.find(
      a => a.data_agendamento === ag.data_agendamento && a.horario === ag.horario && a.status !== 'cancelado'
    );
    if (conflito) return res.status(409).json({
      success: false, error: 'Horário já ocupado',
      erro: 'Este horário já está ocupado. Por favor, escolha outro.',
    });

    const novo = {
      id: dados.proximoId++, ...ag,
      status: 'agendado', valor: null, forma_pagamento: null,
      criado_em: agoraISO(),
    };
    dados.agendamentos.push(novo);
    salvarDados(dados);
    return res.status(201).json({ success: true, agendamento: novo, ...novo });

  } catch (err) {
    console.error('POST /api/agendamentos:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROTAS ADMIN
// ============================================================

// Lista agendamentos (com filtros)
app.get('/api/admin/agendamentos', verificarAdmin, async (req, res) => {
  try {
    const { data, status, inicio, fim } = req.query;

    if (USE_SUPABASE) {
      let q = sb.from('agendamentos').select('*');
      if (data) {
        q = q.eq('data_agendamento', data);
      } else if (inicio || fim) {
        if (inicio) q = q.gte('data_agendamento', inicio);
        if (fim)    q = q.lte('data_agendamento', fim);
      }
      if (status) q = q.eq('status', status);
      q = q.order('data_agendamento').order('horario');
      const { data: rows, error } = await q;
      if (error) throw error;
      return res.json(rows || []);
    }

    let { agendamentos } = lerDados();
    if (data) {
      agendamentos = agendamentos.filter(a => a.data_agendamento === data);
    } else if (inicio || fim) {
      if (inicio) agendamentos = agendamentos.filter(a => a.data_agendamento >= inicio);
      if (fim)    agendamentos = agendamentos.filter(a => a.data_agendamento <= fim);
    }
    if (status) agendamentos = agendamentos.filter(a => a.status === status);
    agendamentos.sort((a, b) => {
      const d = a.data_agendamento.localeCompare(b.data_agendamento);
      return d !== 0 ? d : a.horario.localeCompare(b.horario);
    });
    return res.json(agendamentos);

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Atualiza agendamento
app.put('/api/admin/agendamentos/:id', verificarAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { status, observacoes, data_agendamento, horario, valor, forma_pagamento } = req.body;

    if (USE_SUPABASE) {
      if (data_agendamento && horario) {
        const { data: conflito } = await sb
          .from('agendamentos').select('id')
          .eq('data_agendamento', data_agendamento).eq('horario', horario)
          .neq('status', 'cancelado').neq('id', id).limit(1).maybeSingle();
        if (conflito) return res.status(409).json({ erro: 'Horário já ocupado para reagendamento' });
      }

      const upd = {};
      if (status           !== undefined) upd.status           = status;
      if (observacoes      !== undefined) upd.observacoes      = observacoes;
      if (data_agendamento !== undefined) upd.data_agendamento = data_agendamento;
      if (horario          !== undefined) upd.horario          = horario;
      if (valor            !== undefined) upd.valor            = valor;
      if (forma_pagamento  !== undefined) upd.forma_pagamento  = forma_pagamento;
      upd.atualizado_em = new Date().toISOString();

      const { data: ag, error } = await sb.from('agendamentos').update(upd).eq('id', id).select().single();
      if (error) throw error;
      return res.json(ag);
    }

    const numId = parseInt(id);
    const dados = lerDados();
    const idx   = dados.agendamentos.findIndex(a => a.id === numId);
    if (idx === -1) return res.status(404).json({ erro: 'Agendamento não encontrado' });

    if (data_agendamento && horario) {
      const conflito = dados.agendamentos.find(
        a => a.data_agendamento === data_agendamento && a.horario === horario &&
             a.status !== 'cancelado' && a.id !== numId
      );
      if (conflito) return res.status(409).json({ erro: 'Horário já ocupado para reagendamento' });
    }

    const ag = dados.agendamentos[idx];
    if (status           !== undefined) ag.status           = status;
    if (observacoes      !== undefined) ag.observacoes      = observacoes;
    if (data_agendamento !== undefined) ag.data_agendamento = data_agendamento;
    if (horario          !== undefined) ag.horario          = horario;
    if (valor            !== undefined) ag.valor            = valor;
    if (forma_pagamento  !== undefined) ag.forma_pagamento  = forma_pagamento;
    salvarDados(dados);
    return res.json(ag);

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Cancela agendamento
app.delete('/api/admin/agendamentos/:id', verificarAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    if (USE_SUPABASE) {
      const { error } = await sb.from('agendamentos')
        .update({ status: 'cancelado', atualizado_em: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return res.json({ mensagem: 'Agendamento cancelado' });
    }

    const numId = parseInt(id);
    const dados = lerDados();
    const ag    = dados.agendamentos.find(a => a.id === numId);
    if (!ag) return res.status(404).json({ erro: 'Não encontrado' });
    ag.status = 'cancelado';
    salvarDados(dados);
    return res.json({ mensagem: 'Agendamento cancelado' });

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Estatísticas do dia
app.get('/api/admin/stats', verificarAdmin, async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ erro: 'Data obrigatória' });

    if (USE_SUPABASE) {
      const { data: rows, error } = await sb.from('agendamentos').select('status').eq('data_agendamento', data);
      if (error) throw error;
      const r = rows || [];
      return res.json({
        total:      r.filter(a => a.status !== 'cancelado').length,
        agendados:  r.filter(a => a.status === 'agendado').length,
        compareceu: r.filter(a => a.status === 'compareceu').length,
        faltou:     r.filter(a => a.status === 'nao_compareceu').length,
        cancelados: r.filter(a => a.status === 'cancelado').length,
      });
    }

    const { agendamentos } = lerDados();
    const dia = agendamentos.filter(a => a.data_agendamento === data);
    return res.json({
      total:      dia.filter(a => a.status !== 'cancelado').length,
      agendados:  dia.filter(a => a.status === 'agendado').length,
      compareceu: dia.filter(a => a.status === 'compareceu').length,
      faltou:     dia.filter(a => a.status === 'nao_compareceu').length,
      cancelados: dia.filter(a => a.status === 'cancelado').length,
    });

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Calendário mensal
app.get('/api/admin/calendario', verificarAdmin, async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ erro: 'Mês obrigatório' });

    if (USE_SUPABASE) {
      const [ano, m] = mes.split('-').map(Number);
      const inicio = `${mes}-01`;
      const fim    = `${mes}-${pad(new Date(ano, m, 0).getDate())}`;

      const { data: rows, error } = await sb.from('agendamentos')
        .select('id, nome_paciente, horario, servico_nome, status, data_agendamento')
        .gte('data_agendamento', inicio)
        .lte('data_agendamento', fim)
        .neq('status', 'cancelado');
      if (error) throw error;

      const resultado = {};
      (rows || []).forEach(a => {
        const ds = toDate(a.data_agendamento);
        if (!resultado[ds]) resultado[ds] = [];
        resultado[ds].push({ id: a.id, nome: a.nome_paciente, horario: a.horario, servico: a.servico_nome, status: a.status });
      });
      return res.json(resultado);
    }

    const { agendamentos } = lerDados();
    const resultado = {};
    agendamentos
      .filter(a => a.data_agendamento.startsWith(mes) && a.status !== 'cancelado')
      .forEach(a => {
        if (!resultado[a.data_agendamento]) resultado[a.data_agendamento] = [];
        resultado[a.data_agendamento].push({ id: a.id, nome: a.nome_paciente, horario: a.horario, servico: a.servico_nome, status: a.status });
      });
    return res.json(resultado);

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Bloquear horários (cria registros com status='bloqueado')
app.post('/api/admin/bloqueios', verificarAdmin, async (req, res) => {
  try {
    const { data_agendamento, horarios, motivo, duracao_minutos } = req.body;
    if (!data_agendamento || !Array.isArray(horarios) || !horarios.length)
      return res.status(400).json({ erro: 'data_agendamento e horarios[] são obrigatórios' });

    const registros = horarios.map(h => ({
      nome_paciente:    'Horário Bloqueado',
      telefone_paciente: null,
      servico_nome:     motivo || null,
      data_agendamento,
      horario:          h,
      status:           'bloqueado',
      origem:           'bloqueio',
    }));

    let totalCriados = 0;

    if (USE_SUPABASE) {
      const { data, error } = await sb.from('agendamentos').insert(registros).select();
      if (error) throw error;
      totalCriados = data.length;
    } else {
      const dados = lerDados();
      const criados = registros.map(r => ({ ...r, id: dados.proximoId++, criado_em: agoraISO() }));
      dados.agendamentos.push(...criados);
      salvarDados(dados);
      totalCriados = criados.length;
    }

    console.log('Bloqueio salvo localmente');

    // Envia webhook para o n8n (falha silenciosa — não afeta a resposta)
    const webhookUrl = process.env.N8N_BLOQUEIO_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const payload = {
          tipo:             'bloqueio_horarios',
          origem:           'sistema_admin',
          data:             data_agendamento,
          horarios,
          motivo:           motivo || null,
          duracao_minutos:  duracao_minutos || 60,
        };
        const resp = await fetch(webhookUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
        if (resp.ok) {
          console.log('Webhook n8n de bloqueio enviado com sucesso');
        } else {
          console.warn(`Falha ao enviar bloqueio para n8n — status ${resp.status}`);
        }
      } catch (webhookErr) {
        console.warn('Falha ao enviar bloqueio para n8n:', webhookErr.message);
      }
    } else {
      console.log('Webhook n8n não está configurado (N8N_BLOQUEIO_WEBHOOK_URL ausente)');
    }

    return res.status(201).json({ criados: totalCriados });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
});

// Registra venda manual
app.post('/api/admin/vendas', verificarAdmin, async (req, res) => {
  try {
    const { servico_id, valor, forma_pagamento, descricao, data } = req.body;
    if (!valor || Number(valor) <= 0) return res.status(400).json({ erro: 'Informe o valor da venda.' });

    const { servico_id: sId, servico_nome: sNome } = resolverServico(servico_id);

    if (USE_SUPABASE) {
      const { data: nova, error } = await sb.from('vendas').insert({
        tipo:             'venda_manual',
        data_agendamento: data || isoHoje(),
        servico_id:       sId,
        servico_nome:     sNome || 'Serviço não informado',
        descricao:        descricao || null,
        valor:            Number(valor),
        forma_pagamento:  forma_pagamento || null,
      }).select().single();
      if (error) throw error;
      return res.status(201).json({ ...nova, id: 'v' + nova.id });
    }

    const dados = lerDados();
    const nova = {
      id:               'v' + Date.now(),
      tipo:             'venda_manual',
      data_agendamento: data || isoHoje(),
      servico_id:       sId,
      servico_nome:     sNome || 'Serviço não informado',
      descricao:        descricao || null,
      valor:            Number(valor),
      forma_pagamento:  forma_pagamento || null,
      criado_em:        agoraISO(),
    };
    dados.vendas.push(nova);
    salvarDados(dados);
    return res.status(201).json(nova);

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Financeiro — dashboard
app.get('/api/admin/financeiro', verificarAdmin, async (req, res) => {
  try {
    let pagos, vendas;

    if (USE_SUPABASE) {
      const [resAgs, resVds] = await Promise.all([
        sb.from('agendamentos').select('*').eq('status', 'compareceu'),
        sb.from('vendas').select('*'),
      ]);
      if (resAgs.error) throw resAgs.error;
      if (resVds.error) throw resVds.error;
      pagos  = resAgs.data || [];
      vendas = (resVds.data || []).map(v => ({ ...v, id: 'v' + v.id }));
    } else {
      const dados = lerDados();
      pagos  = dados.agendamentos.filter(a => a.status === 'compareceu');
      vendas = dados.vendas || [];
    }

    const vendasNorm = vendas.map(v => ({
      ...v, nome_paciente: v.descricao || 'Venda avulsa', horario: v.horario || '00:00',
    }));
    const tudo = [...pagos, ...vendasNorm];

    const hoje       = new Date();
    const hojeStr    = isoHoje();
    const mesStr     = hojeStr.slice(0, 7);
    const semInicio  = new Date(hoje);
    semInicio.setDate(semInicio.getDate() - 6);
    const semStr = isoData(semInicio);

    function soma(lista) { return lista.reduce((s, a) => s + (Number(a.valor) || 0), 0); }

    const total_hoje   = soma(tudo.filter(a => toDate(a.data_agendamento) === hojeStr));
    const total_semana = soma(tudo.filter(a => toDate(a.data_agendamento) >= semStr));
    const total_mes    = soma(tudo.filter(a => toDate(a.data_agendamento).startsWith(mesStr)));
    const total_geral  = soma(tudo);

    const porDia = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(hoje); d.setDate(d.getDate() - i);
      const ds = isoData(d);
      porDia[ds] = soma(tudo.filter(a => toDate(a.data_agendamento) === ds));
    }

    const porForma = {};
    tudo.filter(a => a.forma_pagamento).forEach(a => {
      porForma[a.forma_pagamento] = (porForma[a.forma_pagamento] || 0) + (Number(a.valor) || 0);
    });

    const porServico = {};
    tudo.forEach(a => {
      const n = a.servico_nome || 'Serviço';
      porServico[n] = (porServico[n] || 0) + 1;
    });
    const topServicos = Object.entries(porServico)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([nome, qtd]) => ({ nome, qtd }));

    const lista = tudo
      .filter(a => a.valor)
      .sort((a, b) =>
        toDate(b.data_agendamento).localeCompare(toDate(a.data_agendamento)) ||
        (b.horario || '').localeCompare(a.horario || '')
      )
      .slice(0, 50);

    return res.json({ total_hoje, total_semana, total_mes, total_geral, porDia, porForma, topServicos, lista });

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Salva anamnese
app.post('/api/admin/anamneses', verificarAdmin, async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { nome, nascimento, telefone, procedimento, regiao, incomoda, resultado, ...respostas } = req.body;
      const { data, error } = await sb.from('anamneses').insert({
        nome:         nome         || '',
        nascimento:   nascimento   || null,
        telefone:     telefone     || null,
        procedimento: procedimento || null,
        regiao:       regiao       || null,
        incomoda:     incomoda     || null,
        resultado:    resultado    || null,
        respostas,
      }).select().single();
      if (error) throw error;
      vincularClienteAnamnese(req.body, data.id).catch(e => console.warn('vincular cliente:', e.message));
      return res.status(201).json(flattenAnamnese(data));
    }

    const dados = lerDados();
    const ficha = { id: 'f' + Date.now(), criado_em: agoraISO(), ...req.body };
    dados.anamneses.unshift(ficha);
    salvarDados(dados);
    vincularClienteAnamnese(req.body, ficha.id).catch(e => console.warn('vincular cliente:', e.message));
    return res.status(201).json(ficha);

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Lista anamneses
app.get('/api/admin/anamneses', verificarAdmin, async (req, res) => {
  try {
    if (USE_SUPABASE) {
      const { data, error } = await sb.from('anamneses')
        .select('*').order('criado_em', { ascending: false }).limit(200);
      if (error) throw error;
      return res.json((data || []).map(flattenAnamnese));
    }

    const { anamneses } = lerDados();
    return res.json(anamneses.slice(0, 200));

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Exclui anamnese
app.delete('/api/admin/anamneses/:id', verificarAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    if (USE_SUPABASE) {
      // IDs retornados com prefixo 'f'; remove para obter o UUID
      const uuid = id.startsWith('f') ? id.slice(1) : id;
      const { error } = await sb.from('anamneses').delete().eq('id', uuid);
      if (error) throw error;
      return res.json({ mensagem: 'Ficha excluída' });
    }

    const dados = lerDados();
    const idx = dados.anamneses.findIndex(f => f.id === id);
    if (idx === -1) return res.status(404).json({ erro: 'Ficha não encontrada' });
    dados.anamneses.splice(idx, 1);
    salvarDados(dados);
    return res.json({ mensagem: 'Ficha excluída' });

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Busca paciente
app.get('/api/admin/buscar', verificarAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    if (USE_SUPABASE) {
      const { data, error } = await sb.from('agendamentos')
        .select('*')
        .or(`nome_paciente.ilike.%${q}%,telefone_paciente.ilike.%${q}%`)
        .order('data_agendamento', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.json(data || []);
    }

    const { agendamentos } = lerDados();
    const t = q.toLowerCase();
    const found = agendamentos
      .filter(a =>
        a.nome_paciente.toLowerCase().includes(t) ||
        (a.telefone_paciente || '').replace(/\D/g, '').includes(t.replace(/\D/g, ''))
      )
      .sort((a, b) => b.data_agendamento.localeCompare(a.data_agendamento));
    return res.json(found.slice(0, 100));

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Editar lançamento financeiro
app.put('/api/admin/financeiro/:id', verificarAdmin, async (req, res) => {
  try {
    const id      = req.params.id;
    const isVenda = String(id).startsWith('v');
    const { valor, forma_pagamento, data_agendamento, servico_id, descricao } = req.body;

    if (USE_SUPABASE) {
      if (isVenda) {
        const uuid = id.slice(1);
        const upd = {};
        if (valor            !== undefined) upd.valor           = Number(valor);
        if (forma_pagamento  !== undefined) upd.forma_pagamento = forma_pagamento || null;
        if (data_agendamento !== undefined) upd.data_agendamento = data_agendamento;
        if (descricao        !== undefined) upd.descricao       = descricao || null;
        if (servico_id       !== undefined) {
          const { servico_id: sId, servico_nome: sNome } = resolverServico(servico_id);
          upd.servico_id = sId; upd.servico_nome = sNome;
        }
        const { data, error } = await sb.from('vendas').update(upd).eq('id', uuid).select().single();
        if (error) throw error;
        return res.json({ ...data, id: 'v' + data.id });
      } else {
        const upd = {};
        if (valor            !== undefined) upd.valor           = valor !== null && valor !== '' ? Number(valor) : null;
        if (forma_pagamento  !== undefined) upd.forma_pagamento = forma_pagamento || null;
        if (data_agendamento !== undefined) upd.data_agendamento = data_agendamento;
        upd.atualizado_em = new Date().toISOString();
        const { data, error } = await sb.from('agendamentos').update(upd).eq('id', id).select().single();
        if (error) throw error;
        return res.json(data);
      }
    }

    const dados = lerDados();
    if (isVenda) {
      const idx = dados.vendas.findIndex(v => v.id === id);
      if (idx === -1) return res.status(404).json({ erro: 'Lançamento não encontrado' });
      const v = dados.vendas[idx];
      if (valor            !== undefined) v.valor           = Number(valor);
      if (forma_pagamento  !== undefined) v.forma_pagamento = forma_pagamento || null;
      if (data_agendamento !== undefined) v.data_agendamento = data_agendamento;
      if (descricao        !== undefined) v.descricao       = descricao || null;
      if (servico_id       !== undefined) {
        const { servico_id: sId, servico_nome: sNome } = resolverServico(servico_id);
        v.servico_id = sId; v.servico_nome = sNome;
      }
      salvarDados(dados);
      return res.json(v);
    } else {
      const numId = parseInt(id);
      const idx   = dados.agendamentos.findIndex(a => a.id === numId);
      if (idx === -1) return res.status(404).json({ erro: 'Lançamento não encontrado' });
      const ag = dados.agendamentos[idx];
      if (valor            !== undefined) ag.valor           = valor !== null && valor !== '' ? Number(valor) : null;
      if (forma_pagamento  !== undefined) ag.forma_pagamento = forma_pagamento || null;
      if (data_agendamento !== undefined) ag.data_agendamento = data_agendamento;
      salvarDados(dados);
      return res.json(ag);
    }

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// Excluir lançamento financeiro
app.delete('/api/admin/financeiro/:id', verificarAdmin, async (req, res) => {
  try {
    const id      = req.params.id;
    const isVenda = String(id).startsWith('v');

    if (USE_SUPABASE) {
      if (isVenda) {
        const uuid = id.slice(1);
        const { error } = await sb.from('vendas').delete().eq('id', uuid);
        if (error) throw error;
      } else {
        const { error } = await sb.from('agendamentos')
          .update({ valor: null, forma_pagamento: null, atualizado_em: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
      }
      return res.json({ mensagem: isVenda ? 'Lançamento excluído' : 'Pagamento removido' });
    }

    const dados = lerDados();
    if (isVenda) {
      const idx = dados.vendas.findIndex(v => v.id === id);
      if (idx === -1) return res.status(404).json({ erro: 'Lançamento não encontrado' });
      dados.vendas.splice(idx, 1);
    } else {
      const numId = parseInt(id);
      const idx   = dados.agendamentos.findIndex(a => a.id === numId);
      if (idx === -1) return res.status(404).json({ erro: 'Lançamento não encontrado' });
      dados.agendamentos[idx].valor = null;
      dados.agendamentos[idx].forma_pagamento = null;
    }
    salvarDados(dados);
    return res.json({ mensagem: isVenda ? 'Lançamento excluído' : 'Pagamento removido' });

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// ============================================================
// ROTAS CLIENTES
// ============================================================

app.get('/api/admin/clientes', verificarAdmin, async (req, res) => {
  try {
    const { busca } = req.query;
    if (USE_SUPABASE) {
      let q = sb.from('clientes').select('id,nome,telefone,email,procedimento_interesse,created_at').order('nome');
      if (busca) q = q.or(`nome.ilike.%${busca}%,telefone.ilike.%${busca}%,email.ilike.%${busca}%`);
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return res.json(data || []);
    }
    let { clientes } = lerDados();
    if (busca) {
      const t = busca.toLowerCase();
      clientes = clientes.filter(c =>
        (c.nome||'').toLowerCase().includes(t) ||
        (c.telefone||'').includes(t) ||
        (c.email||'').toLowerCase().includes(t)
      );
    }
    return res.json(clientes.slice(0, 100));
  } catch (err) { return res.status(500).json({ erro: err.message }); }
});

app.get('/api/admin/clientes/:id', verificarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (USE_SUPABASE) {
      const { data: cli, error } = await sb.from('clientes').select('*').eq('id', id).single();
      if (error) throw error;
      const { data: links } = await sb.from('cliente_anamneses').select('anamnese_id').eq('cliente_id', id);
      const anamIds = (links || []).map(l => l.anamnese_id);
      let anams = [];
      if (anamIds.length) {
        const { data: aData } = await sb.from('anamneses')
          .select('id,criado_em,procedimento,nome').in('id', anamIds).order('criado_em', { ascending: false });
        anams = aData || [];
      }
      const { data: fotos } = await sb.from('cliente_fotos').select('*').eq('cliente_id', id).order('created_at', { ascending: false });
      return res.json({ ...cli, anamneses: anams, fotos: fotos || [] });
    }
    const dados = lerDados();
    const cli = dados.clientes.find(c => c.id === id);
    if (!cli) return res.status(404).json({ erro: 'Cliente não encontrado' });
    const anamIds = dados.cliente_anamneses.filter(ca => ca.cliente_id === id).map(ca => ca.anamnese_id);
    const anams   = dados.anamneses.filter(a => anamIds.includes(String(a.id)));
    const fotos   = dados.cliente_fotos.filter(f => f.cliente_id === id);
    return res.json({ ...cli, anamneses: anams, fotos });
  } catch (err) { return res.status(500).json({ erro: err.message }); }
});

app.post('/api/admin/clientes', verificarAdmin, async (req, res) => {
  try {
    const { nome, telefone, email, data_nascimento, cpf, endereco, queixa_principal, procedimento_interesse, observacoes } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
    if (USE_SUPABASE) {
      const { data, error } = await sb.from('clientes').insert({
        nome, telefone: telefone||null, email: email||null, data_nascimento: data_nascimento||null,
        cpf: cpf||null, endereco: endereco||null, queixa_principal: queixa_principal||null,
        procedimento_interesse: procedimento_interesse||null, observacoes: observacoes||null,
      }).select().single();
      if (error) throw error;
      return res.status(201).json({ ...data, anamneses: [], fotos: [] });
    }
    const dados = lerDados();
    const novo = {
      id: 'c' + Date.now(), nome,
      telefone: telefone||null, email: email||null, data_nascimento: data_nascimento||null,
      cpf: cpf||null, endereco: endereco||null, queixa_principal: queixa_principal||null,
      procedimento_interesse: procedimento_interesse||null, observacoes: observacoes||null,
      created_at: agoraISO(), updated_at: agoraISO(),
    };
    dados.clientes.push(novo);
    salvarDados(dados);
    return res.status(201).json({ ...novo, anamneses: [], fotos: [] });
  } catch (err) { return res.status(500).json({ erro: err.message }); }
});

app.put('/api/admin/clientes/:id', verificarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, telefone, email, data_nascimento, cpf, endereco, queixa_principal, procedimento_interesse, observacoes } = req.body;
    if (USE_SUPABASE) {
      const upd = { updated_at: new Date().toISOString() };
      if (nome                   !== undefined) upd.nome                   = nome;
      if (telefone               !== undefined) upd.telefone               = telefone||null;
      if (email                  !== undefined) upd.email                  = email||null;
      if (data_nascimento        !== undefined) upd.data_nascimento        = data_nascimento||null;
      if (cpf                    !== undefined) upd.cpf                    = cpf||null;
      if (endereco               !== undefined) upd.endereco               = endereco||null;
      if (queixa_principal       !== undefined) upd.queixa_principal       = queixa_principal||null;
      if (procedimento_interesse !== undefined) upd.procedimento_interesse = procedimento_interesse||null;
      if (observacoes            !== undefined) upd.observacoes            = observacoes||null;
      const { data, error } = await sb.from('clientes').update(upd).eq('id', id).select().single();
      if (error) throw error;
      return res.json(data);
    }
    const dados = lerDados();
    const cli = dados.clientes.find(c => c.id === id);
    if (!cli) return res.status(404).json({ erro: 'Cliente não encontrado' });
    if (nome                   !== undefined) cli.nome                   = nome;
    if (telefone               !== undefined) cli.telefone               = telefone||null;
    if (email                  !== undefined) cli.email                  = email||null;
    if (data_nascimento        !== undefined) cli.data_nascimento        = data_nascimento||null;
    if (cpf                    !== undefined) cli.cpf                    = cpf||null;
    if (endereco               !== undefined) cli.endereco               = endereco||null;
    if (queixa_principal       !== undefined) cli.queixa_principal       = queixa_principal||null;
    if (procedimento_interesse !== undefined) cli.procedimento_interesse = procedimento_interesse||null;
    if (observacoes            !== undefined) cli.observacoes            = observacoes||null;
    cli.updated_at = agoraISO();
    salvarDados(dados);
    return res.json(cli);
  } catch (err) { return res.status(500).json({ erro: err.message }); }
});

app.delete('/api/admin/clientes/:id', verificarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (USE_SUPABASE) {
      // Cascata apaga cliente_anamneses e cliente_fotos automaticamente (ON DELETE CASCADE)
      const { error } = await sb.from('clientes').delete().eq('id', id);
      if (error) throw error;
      return res.json({ mensagem: 'Cliente excluído' });
    }
    const dados = lerDados();
    const idx = dados.clientes.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ erro: 'Cliente não encontrado' });
    // Remove fotos locais do disco
    const fotos = dados.cliente_fotos.filter(f => f.cliente_id === id);
    fotos.forEach(f => {
      if (f.url && f.url.startsWith('/uploads/')) {
        const fp = path.join(__dirname, 'public', f.url);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    });
    dados.clientes.splice(idx, 1);
    dados.cliente_anamneses = dados.cliente_anamneses.filter(ca => ca.cliente_id !== id);
    dados.cliente_fotos     = dados.cliente_fotos.filter(f => f.cliente_id !== id);
    salvarDados(dados);
    return res.json({ mensagem: 'Cliente excluído' });
  } catch (err) { return res.status(500).json({ erro: err.message }); }
});

app.post('/api/admin/clientes/:id/fotos', verificarAdmin, async (req, res) => {
  try {
    const clienteId = req.params.id;
    const { base64, tipo, observacao, nome_arquivo } = req.body;
    if (!base64) return res.status(400).json({ erro: 'Imagem (base64) é obrigatória' });
    const matches = base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ erro: 'Formato de imagem inválido' });
    const mimeType    = matches[1];
    const buffer      = Buffer.from(matches[2], 'base64');
    const ext         = (mimeType.split('/')[1] || 'jpg').split('+')[0];
    const storagePath = `${clienteId}/${Date.now()}.${ext}`;
    let url = null;
    if (USE_SUPABASE) {
      const { error: upErr } = await sb.storage
        .from('clientes-fotos').upload(storagePath, buffer, { contentType: mimeType, upsert: false });
      if (upErr) {
        const msg = upErr.message || '';
        if (msg.includes('Bucket not found') || msg.includes('bucket') || upErr.statusCode === 400) {
          return res.status(500).json({ erro: 'Bucket clientes-fotos não encontrado no Supabase Storage. Crie o bucket como público.' });
        }
        if (upErr.statusCode === 403 || msg.includes('permission') || msg.includes('policy')) {
          return res.status(500).json({ erro: 'Erro de permissão no Supabase Storage. Verifique as policies do bucket.' });
        }
        console.warn('Supabase Storage — salvando sem URL:', msg);
      } else {
        const { data: urlData } = sb.storage.from('clientes-fotos').getPublicUrl(storagePath);
        url = urlData?.publicUrl || null;
      }
      const { data: foto, error } = await sb.from('cliente_fotos').insert({
        cliente_id: clienteId, url, tipo: tipo||'outros',
        observacao: observacao||null, nome_arquivo: nome_arquivo||storagePath,
      }).select().single();
      if (error) return res.status(500).json({ erro: 'Erro ao salvar foto no banco: ' + error.message });
      return res.status(201).json(foto);
    }
    // Salva arquivo em public/uploads/clientes/ para ter URL acessível localmente
    const uploadsDir = path.join(__dirname, 'public', 'uploads', 'clientes', clienteId);
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);
    url = `/uploads/clientes/${clienteId}/${filename}`;

    const dados = lerDados();
    const foto = {
      id: 'f' + Date.now(), cliente_id: clienteId, url,
      tipo: tipo||'outros', observacao: observacao||null,
      nome_arquivo: nome_arquivo||filename, created_at: agoraISO(),
    };
    dados.cliente_fotos.push(foto);
    salvarDados(dados);
    return res.status(201).json(foto);
  } catch (err) { return res.status(500).json({ erro: err.message }); }
});

app.delete('/api/admin/clientes/:id/fotos/:fotoId', verificarAdmin, async (req, res) => {
  try {
    const { id: clienteId, fotoId } = req.params;
    if (USE_SUPABASE) {
      const { data: foto } = await sb.from('cliente_fotos').select('url').eq('id', fotoId).single();
      if (foto?.url) {
        const filePath = foto.url.split('/clientes-fotos/').pop();
        if (filePath) await sb.storage.from('clientes-fotos').remove([filePath]);
      }
      const { error } = await sb.from('cliente_fotos').delete().eq('id', fotoId).eq('cliente_id', clienteId);
      if (error) throw error;
      return res.json({ mensagem: 'Foto removida' });
    }
    const dados = lerDados();
    const idx = dados.cliente_fotos.findIndex(f => f.id === fotoId && f.cliente_id === clienteId);
    if (idx === -1) return res.status(404).json({ erro: 'Foto não encontrada' });
    const fotoLocal = dados.cliente_fotos[idx];
    if (fotoLocal.url && fotoLocal.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, 'public', fotoLocal.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    dados.cliente_fotos.splice(idx, 1);
    salvarDados(dados);
    return res.json({ mensagem: 'Foto removida' });
  } catch (err) { return res.status(500).json({ erro: err.message }); }
});

// ============================================================
// INICIALIZAÇÃO
// ============================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('\nDra Sônia Machado — Painel Administrativo');
    console.log(`Painel : http://localhost:${PORT}`);
    console.log(`Banco  : ${USE_SUPABASE ? 'Supabase' : 'JSON local (dados.json)'}`);
    console.log(`Senha  : ${ADMIN_PASSWORD}\n`);
  });
}

// Exporta o app para a Vercel
module.exports = app;
