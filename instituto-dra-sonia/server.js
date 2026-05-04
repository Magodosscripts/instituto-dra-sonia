const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DB   = path.join(__dirname, 'dados.json');

// ============================================================
// CONFIGURAÇÕES
// ============================================================
const ADMIN_PASSWORD = 'sonia2024';
const HORARIO_INICIO = 8;
const HORARIO_FIM    = 20;
// ============================================================

// ---- Helpers de data ----------------------------------------
function pad(n) { return String(n).padStart(2, '0'); }
function isoData(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function isoHoje()  { return isoData(new Date()); }

// ---- Banco de dados em arquivo JSON -------------------------
function lerDados() {
  if (!fs.existsSync(DB)) {
    const inicial = {
      proximoId: 1,
      agendamentos: [],
      vendas: [],
      servicos: [
        { id: 1,  nome: 'Bioestimuladores de Colágeno',            preco_min: null,  preco_max: null  },
        { id: 2,  nome: 'Botox',                                    preco_min: null,  preco_max: null  },
        { id: 3,  nome: 'Enzimas Emagrecedoras',                    preco_min: null,  preco_max: null  },
        { id: 4,  nome: 'Fios de PDO',                              preco_min: null,  preco_max: null  },
        { id: 5,  nome: 'Harmonização Facial',                      preco_min: 1000,  preco_max: 4000  },
        { id: 6,  nome: 'Harmonização de Glúteos e Abdômen',        preco_min: 1000,  preco_max: 5000  },
        { id: 7,  nome: 'Limpeza de Pele',                          preco_min: null,  preco_max: null  },
        { id: 8,  nome: 'Lipo de Papada',                           preco_min: null,  preco_max: null  },
        { id: 9,  nome: 'PDRN de Salmão',                           preco_min: null,  preco_max: null  },
        { id: 10, nome: 'Peelings Químicos Exclusivos',             preco_min: null,  preco_max: null  },
        { id: 11, nome: 'Preenchimento Labial',                     preco_min: null,  preco_max: null  },
        { id: 12, nome: 'Preenchimento Mandíbula',                  preco_min: null,  preco_max: null  },
        { id: 13, nome: 'Preenchimento Mento',                      preco_min: null,  preco_max: null  },
        { id: 14, nome: 'Protocolo Sculpt Power',                   preco_min: null,  preco_max: null  },
        { id: 15, nome: 'Rejuvenescimento Íntimo Feminino',         preco_min: null,  preco_max: null  },
        { id: 16, nome: 'Rinomodelação',                            preco_min: null,  preco_max: null  },
        { id: 17, nome: 'Secagem de Microvasos',                    preco_min: null,  preco_max: null  },
        { id: 18, nome: 'Skinbooster para Rejuvenescimento Facial', preco_min: null,  preco_max: null  },
        { id: 19, nome: 'Tratamento Exclusivo para Lipedema',       preco_min: null,  preco_max: null  },
      ],
    };
    fs.writeFileSync(DB, JSON.stringify(inicial, null, 2), 'utf8');
    return inicial;
  }
  const dados = JSON.parse(fs.readFileSync(DB, 'utf8'));
  if (!dados.vendas) dados.vendas = [];
  if (!dados.anamneses) dados.anamneses = [];
  return dados;
}

function salvarDados(dados) {
  fs.writeFileSync(DB, JSON.stringify(dados, null, 2), 'utf8');
}

function gerarHorarios() {
  const slots = [];
  for (let h = HORARIO_INICIO; h < HORARIO_FIM; h++) slots.push(`${pad(h)}:00`);
  return slots;
}

function verificarAdmin(req, res, next) {
  const senha = req.headers['x-admin-password'] || req.query.pwd;
  if (senha !== ADMIN_PASSWORD) return res.status(401).json({ erro: 'Acesso não autorizado' });
  next();
}

function agoraISO() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ---- Middlewares -------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===========================================================
// ROTAS PÚBLICAS
// ===========================================================

app.get('/api/servicos', (req, res) => {
  const { servicos } = lerDados();
  res.json([...servicos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
});

app.get('/api/horarios', (req, res) => {
  const { data } = req.query;
  if (!data) return res.status(400).json({ erro: 'Data é obrigatória' });
  const { agendamentos } = lerDados();
  const ocupados = agendamentos
    .filter(a => a.data_agendamento === data && a.status !== 'cancelado')
    .map(a => a.horario);
  const todos = gerarHorarios();
  res.json({ data, disponiveis: todos.filter(h => !ocupados.includes(h)), ocupados });
});

app.post('/api/agendamentos', (req, res) => {
  const { servico_id, nome_paciente, telefone_paciente, data_agendamento, horario, observacoes } = req.body;
  if (!servico_id || !nome_paciente || !telefone_paciente || !data_agendamento || !horario)
    return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios' });

  const dados = lerDados();
  const conflito = dados.agendamentos.find(
    a => a.data_agendamento === data_agendamento && a.horario === horario && a.status !== 'cancelado'
  );
  if (conflito) return res.status(409).json({ erro: 'Este horário já está ocupado. Por favor, escolha outro.' });

  const servico = dados.servicos.find(s => s.id === Number(servico_id));
  if (!servico) return res.status(400).json({ erro: 'Serviço inválido' });

  const novo = {
    id: dados.proximoId++,
    servico_id: Number(servico_id),
    servico_nome: servico.nome,
    nome_paciente,
    telefone_paciente,
    data_agendamento,
    horario,
    status: 'agendado',
    observacoes: observacoes || null,
    valor: null,
    forma_pagamento: null,
    criado_em: agoraISO(),
  };
  dados.agendamentos.push(novo);
  salvarDados(dados);
  res.status(201).json(novo);
});

// Disponibilidade mensal para o calendário do site
app.get('/api/disponibilidade', (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).json({ erro: 'Mês obrigatório' });
  const { agendamentos } = lerDados();
  const [ano, m] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, m, 0).getDate();
  const todos = gerarHorarios();
  const resultado = {};
  for (let d = 1; d <= diasNoMes; d++) {
    const ds = `${ano}-${pad(m)}-${pad(d)}`;
    const ocupados = agendamentos.filter(a => a.data_agendamento === ds && a.status !== 'cancelado').length;
    resultado[ds] = todos.length - ocupados;
  }
  res.json(resultado);
});

// ===========================================================
// ROTAS ADMIN
// ===========================================================

// Lista agendamentos
app.get('/api/admin/agendamentos', verificarAdmin, (req, res) => {
  const { data, status } = req.query;
  let { agendamentos } = lerDados();
  if (data)   agendamentos = agendamentos.filter(a => a.data_agendamento === data);
  if (status) agendamentos = agendamentos.filter(a => a.status === status);
  agendamentos.sort((a, b) => {
    const d = a.data_agendamento.localeCompare(b.data_agendamento);
    return d !== 0 ? d : a.horario.localeCompare(b.horario);
  });
  res.json(agendamentos);
});

// Atualiza agendamento (status, valor, reagendamento)
app.put('/api/admin/agendamentos/:id', verificarAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { status, observacoes, data_agendamento, horario, valor, forma_pagamento } = req.body;

  const dados = lerDados();
  const idx = dados.agendamentos.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ erro: 'Agendamento não encontrado' });

  if (data_agendamento && horario) {
    const conflito = dados.agendamentos.find(
      a => a.data_agendamento === data_agendamento && a.horario === horario && a.status !== 'cancelado' && a.id !== id
    );
    if (conflito) return res.status(409).json({ erro: 'Horário já ocupado para reagendamento' });
  }

  const ag = dados.agendamentos[idx];
  if (status !== undefined)           ag.status           = status;
  if (observacoes !== undefined)      ag.observacoes      = observacoes;
  if (data_agendamento !== undefined) ag.data_agendamento = data_agendamento;
  if (horario !== undefined)          ag.horario          = horario;
  if (valor !== undefined)            ag.valor            = valor;
  if (forma_pagamento !== undefined)  ag.forma_pagamento  = forma_pagamento;

  salvarDados(dados);
  res.json(ag);
});

// Cancela
app.delete('/api/admin/agendamentos/:id', verificarAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const dados = lerDados();
  const ag = dados.agendamentos.find(a => a.id === id);
  if (!ag) return res.status(404).json({ erro: 'Não encontrado' });
  ag.status = 'cancelado';
  salvarDados(dados);
  res.json({ mensagem: 'Agendamento cancelado' });
});

// Estatísticas do dia
app.get('/api/admin/stats', verificarAdmin, (req, res) => {
  const { data } = req.query;
  if (!data) return res.status(400).json({ erro: 'Data obrigatória' });
  const { agendamentos } = lerDados();
  const dia = agendamentos.filter(a => a.data_agendamento === data);
  res.json({
    total:      dia.filter(a => a.status !== 'cancelado').length,
    agendados:  dia.filter(a => a.status === 'agendado').length,
    compareceu: dia.filter(a => a.status === 'compareceu').length,
    faltou:     dia.filter(a => a.status === 'nao_compareceu').length,
    cancelados: dia.filter(a => a.status === 'cancelado').length,
  });
});

// Calendário mensal (admin) — retorna agendamentos agrupados por dia
app.get('/api/admin/calendario', verificarAdmin, (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).json({ erro: 'Mês obrigatório' });
  const { agendamentos } = lerDados();
  const resultado = {};
  agendamentos
    .filter(a => a.data_agendamento.startsWith(mes) && a.status !== 'cancelado')
    .forEach(a => {
      if (!resultado[a.data_agendamento]) resultado[a.data_agendamento] = [];
      resultado[a.data_agendamento].push({
        id: a.id, nome: a.nome_paciente, horario: a.horario,
        servico: a.servico_nome, status: a.status,
      });
    });
  res.json(resultado);
});

// Registra venda manual
app.post('/api/admin/vendas', verificarAdmin, (req, res) => {
  const { servico_id, valor, forma_pagamento, descricao, data } = req.body;
  if (!valor || Number(valor) <= 0) return res.status(400).json({ erro: 'Informe o valor da venda.' });

  const dados = lerDados();
  const servico = servico_id ? dados.servicos.find(s => s.id === Number(servico_id)) : null;

  const nova = {
    id: 'v' + Date.now(),
    tipo: 'venda_manual',
    data_agendamento: data || isoHoje(),
    servico_id: servico_id ? Number(servico_id) : null,
    servico_nome: servico ? servico.nome : 'Serviço não informado',
    descricao: descricao || null,
    valor: Number(valor),
    forma_pagamento: forma_pagamento || null,
    criado_em: agoraISO(),
  };
  dados.vendas.push(nova);
  salvarDados(dados);
  res.status(201).json(nova);
});

// Financeiro
app.get('/api/admin/financeiro', verificarAdmin, (req, res) => {
  const { agendamentos, vendas } = lerDados();
  const pagos = agendamentos.filter(a => a.status === 'compareceu');
  const vendasNorm = vendas.map(v => ({
    ...v,
    nome_paciente: v.descricao || 'Venda avulsa',
    horario: '00:00',
  }));
  const tudo = [...pagos, ...vendasNorm];

  const hoje = new Date();
  const hojeStr = isoHoje();
  const mesStr  = hojeStr.slice(0, 7);

  const semanaInicio = new Date(hoje);
  semanaInicio.setDate(semanaInicio.getDate() - 6);
  const semanaStr = isoData(semanaInicio);

  function soma(lista) { return lista.reduce((s, a) => s + (a.valor || 0), 0); }

  const total_hoje   = soma(tudo.filter(a => a.data_agendamento === hojeStr));
  const total_semana = soma(tudo.filter(a => a.data_agendamento >= semanaStr));
  const total_mes    = soma(tudo.filter(a => a.data_agendamento.startsWith(mesStr)));
  const total_geral  = soma(tudo);

  // Receita por dia — últimos 30 dias
  const porDia = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const ds = isoData(d);
    porDia[ds] = soma(tudo.filter(a => a.data_agendamento === ds));
  }

  // Por forma de pagamento
  const porForma = {};
  tudo.filter(a => a.forma_pagamento).forEach(a => {
    porForma[a.forma_pagamento] = (porForma[a.forma_pagamento] || 0) + (a.valor || 0);
  });

  // Serviços mais realizados (top 5)
  const porServico = {};
  tudo.forEach(a => {
    porServico[a.servico_nome] = (porServico[a.servico_nome] || 0) + 1;
  });
  const topServicos = Object.entries(porServico)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, qtd]) => ({ nome, qtd }));

  // Lista dos últimos 50 pagamentos
  const lista = tudo
    .filter(a => a.valor)
    .sort((a, b) => b.data_agendamento.localeCompare(a.data_agendamento) || b.horario.localeCompare(a.horario))
    .slice(0, 50);

  res.json({ total_hoje, total_semana, total_mes, total_geral, porDia, porForma, topServicos, lista });
});

// Salva ficha de anamnese
app.post('/api/admin/anamneses', verificarAdmin, (req, res) => {
  const dados = lerDados();
  const ficha = { id: 'f' + Date.now(), criado_em: agoraISO(), ...req.body };
  dados.anamneses.unshift(ficha);
  salvarDados(dados);
  res.status(201).json(ficha);
});

// Lista fichas de anamnese
app.get('/api/admin/anamneses', verificarAdmin, (req, res) => {
  const { anamneses } = lerDados();
  res.json(anamneses.slice(0, 200));
});

// Exclui ficha de anamnese
app.delete('/api/admin/anamneses/:id', verificarAdmin, (req, res) => {
  const dados = lerDados();
  const idx = dados.anamneses.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ erro: 'Ficha não encontrada' });
  dados.anamneses.splice(idx, 1);
  salvarDados(dados);
  res.json({ mensagem: 'Ficha excluída' });
});

// Busca paciente
app.get('/api/admin/buscar', verificarAdmin, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const { agendamentos } = lerDados();
  const termo = q.toLowerCase();
  const encontrados = agendamentos.filter(a =>
    a.nome_paciente.toLowerCase().includes(termo) ||
    a.telefone_paciente.replace(/\D/g, '').includes(termo.replace(/\D/g, ''))
  );
  encontrados.sort((a, b) => b.data_agendamento.localeCompare(a.data_agendamento));
  res.json(encontrados.slice(0, 100));
});

// -----------------------------------------------------------
app.listen(PORT, () => {
  console.log('\n✨ Instituto Dra Sônia Machado — Sistema de Agendamentos');
  console.log(`🌐 Site de Agendamento    : http://localhost:${PORT}`);
  console.log(`🔐 Painel Administrativo  : http://localhost:${PORT}/admin.html`);
  console.log(`   Senha do painel        : ${ADMIN_PASSWORD}\n`);
});
