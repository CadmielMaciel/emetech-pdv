/**
 * ══════════════════════════════════════════════════════════════════════
 * WEBHOOK WHATSAPP — EMETech PDV v4.0
 * Arquivo: api/whatsapp.js
 * Hospedagem: Vercel (detecta automaticamente como Serverless Function)
 * Endpoint: https://emetech-pdv.vercel.app/api/whatsapp
 *
 * Configure na Evolution API:
 *   Webhook URL: https://emetech-pdv.vercel.app/api/whatsapp
 *   Eventos: MESSAGES_UPSERT
 * ══════════════════════════════════════════════════════════════════════
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://icgfpfwcnhkjglrmnuca.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljZ2ZwZndjbmhramdscm1udWNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODA2OTEsImV4cCI6MjA5NTY1NjY5MX0.xDGiGCIlqXaqdWhWo0NoNi_XUdlw5raCogO_Jnc0ezw';

// URL da Evolution API (configurar em Vercel Environment Variables)
const EVO_URL     = process.env.EVOLUTION_API_URL || '';
const EVO_KEY     = process.env.EVOLUTION_API_KEY || '';
const EVO_INST    = process.env.EVOLUTION_INSTANCE || 'emetech-pdv';

// ── PALAVRAS-CHAVE ──────────────────────────────────────────────────
const KW_STATUS   = ['status','andamento','pronto','minha os','meu celular','conserto','reparo','quando fica'];
const KW_CANCELAR = ['cancelar','cancelamento','desistir','não quero mais'];
const KW_SAUDACAO = ['oi','olá','ola','bom dia','boa tarde','boa noite','hey','hi'];

// ── UTILITÁRIOS ─────────────────────────────────────────────────────
function limparTelefone(n) {
  return (n || '').replace(/\D/g, '');
}

function detectarIntencao(texto) {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (KW_CANCELAR.some(k => t.includes(k))) return 'cancelar';
  if (KW_STATUS.some(k => t.includes(k)))   return 'status';
  if (KW_SAUDACAO.some(k => t.startsWith(k) || t === k)) return 'saudacao';
  return 'outros';
}

// ── ENVIAR MENSAGEM VIA EVOLUTION API ──────────────────────────────
async function enviarWhatsApp(numero, texto) {
  if (!EVO_URL || !EVO_KEY) {
    console.log('[WPP] API não configurada — mensagem não enviada');
    return false;
  }
  try {
    const res = await fetch(`${EVO_URL}/message/sendText/${EVO_INST}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVO_KEY,
      },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    return res.ok;
  } catch(e) {
    console.error('[WPP] Erro ao enviar:', e.message);
    return false;
  }
}

// ── FORMATAR STATUS ─────────────────────────────────────────────────
function formatarStatus(os) {
  const statusEmoji = {
    'Aguardando':  '⏳ Aguardando análise',
    'Em Análise':  '🔍 Em análise',
    'Em Reparo':   '🔧 Em reparo',
    'Pronto':      '✅ Pronto para retirada',
    'Entregue':    '📦 Entregue',
  };

  const statusFmt = statusEmoji[os.status] || os.status;
  const tecnico   = os.tecnico_nome ? `\nTécnico: ${os.tecnico_nome}` : '';
  const total     = os.total ? `\nValor: R$ ${Number(os.total).toFixed(2).replace('.', ',')}` : '';

  return `🔧 *OS nº ${os.numero}* — ${os.aparelho}

*Status:* ${statusFmt}${tecnico}${total}

_Dúvidas? Responda esta mensagem ou ligue para nossa assistência._`;
}

// ── HANDLER PRINCIPAL ───────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: health check
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'EMETech PDV — WhatsApp Webhook',
      timestamp: new Date().toISOString(),
      evolution_configured: !!(EVO_URL && EVO_KEY),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    console.log('[WPP] Payload recebido:', JSON.stringify(body).slice(0, 500));

    // ── PARSEAR PAYLOAD DA EVOLUTION API ──────────────────────────
    // Formato: { event: 'MESSAGES_UPSERT', data: { key: { remoteJid }, message: { conversation } } }
    let numero = '';
    let textoMensagem = '';
    let fromMe = false;

    if (body?.event === 'MESSAGES_UPSERT' || body?.data) {
      const data    = body.data || body;
      const key     = data.key || data.message?.key || {};
      const msg     = data.message || data;
      fromMe        = key.fromMe || false;
      numero        = limparTelefone(key.remoteJid?.replace('@s.whatsapp.net', '') || '');
      textoMensagem = msg.message?.conversation
                   || msg.message?.extendedTextMessage?.text
                   || msg.body
                   || '';
    } else if (body?.From) {
      // Formato alternativo
      numero        = limparTelefone(body.From);
      textoMensagem = body.Body || '';
    }

    // Ignorar mensagens enviadas pelo bot
    if (fromMe || !numero || !textoMensagem.trim()) {
      return res.status(200).json({ status: 'ignored' });
    }

    console.log(`[WPP] De: ${numero} — Mensagem: "${textoMensagem}"`);

    // ── CONECTAR AO SUPABASE ──────────────────────────────────────
    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── BUSCAR CLIENTE PELO TELEFONE ──────────────────────────────
    const numLimpo = numero.replace(/^55/, ''); // remove DDI Brasil
    const { data: clientes } = await db
      .from('clientes')
      .select('id, nome, telefone, whatsapp')
      .or(`telefone.ilike.%${numLimpo}%,whatsapp.ilike.%${numLimpo}%`);

    // ── BUSCAR OS ABERTA MAIS RECENTE DO CLIENTE ──────────────────
    let os = null;
    let clienteNome = 'Cliente';

    if (clientes && clientes.length > 0) {
      const cli = clientes[0];
      clienteNome = cli.nome;

      const { data: ordens } = await db
        .from('ordens_servico')
        .select('*')
        .eq('cliente_id', cli.id)
        .not('status', 'eq', 'Entregue')
        .order('created_at', { ascending: false })
        .limit(1);

      if (ordens && ordens.length > 0) {
        os = ordens[0];
      }
    }

    // ── DETECTAR INTENÇÃO ─────────────────────────────────────────
    const intencao = detectarIntencao(textoMensagem);
    let resposta = '';

    if (intencao === 'saudacao') {
      if (os) {
        resposta = `Olá, ${clienteNome}! 😊\n\nVi que você tem uma OS conosco:\n\n${formatarStatus(os)}\n\n_Para saber o status completo, responda "status"._`;
      } else {
        resposta = `Olá, ${clienteNome}! 😊 Seja bem-vindo(a) à nossa assistência técnica!\n\nComo posso ajudar? Responda com o que precisa ou ligue para nosso número.`;
      }

    } else if (intencao === 'status') {
      if (os) {
        resposta = formatarStatus(os);
        // Notificar no sistema que cliente consultou
        await db.from('mensagens_whatsapp').insert({
          os_id: os.id,
          numero: numero,
          direcao: 'entrada',
          conteudo: textoMensagem,
          criado_em: new Date().toISOString(),
        }).catch(() => {});
      } else if (clientes && clientes.length > 0) {
        resposta = `Olá, ${clienteNome}! Não encontrei nenhuma OS em aberto no seu nome.\n\nPossível que já foi entregue ou não temos OS cadastrada. Entre em contato conosco!`;
      } else {
        resposta = `Não encontrei cadastro com este número.\n\nPara verificar sua OS, entre em contato direto com nossa equipe.`;
      }

    } else if (intencao === 'cancelar') {
      resposta = `Olá, ${clienteNome}. Recebemos seu pedido de cancelamento.\n\nUm de nossos atendentes entrará em contato em breve para verificar o que aconteceu. 🙏`;

      // Salvar alerta de cancelamento
      if (os) {
        await db.from('mensagens_whatsapp').insert({
          os_id: os.id,
          numero: numero,
          direcao: 'entrada',
          conteudo: `⚠️ CANCELAMENTO: ${textoMensagem}`,
          criado_em: new Date().toISOString(),
        }).catch(() => {});
      }

    } else {
      // Resposta padrão
      if (os) {
        resposta = `Olá, ${clienteNome}! 😊\n\nAqui está o status da sua OS:\n\n${formatarStatus(os)}\n\n_Para falar com um técnico, entre em contato no horário comercial._`;
      } else {
        resposta = `Olá! Recebemos sua mensagem. Nossa equipe responderá em breve no horário comercial. 😊\n\n_Para verificar o status de uma OS, envie "status"._`;
      }
    }

    // ── ENVIAR RESPOSTA ───────────────────────────────────────────
    if (resposta) {
      const enviado = await enviarWhatsApp(numero, resposta);
      console.log(`[WPP] Resposta ${enviado ? 'enviada' : 'falhou'}: "${resposta.slice(0, 80)}..."`);

      // Salvar mensagem saída no Supabase
      if (os && enviado) {
        await db.from('mensagens_whatsapp').insert({
          os_id: os.id,
          numero: numero,
          direcao: 'saida',
          conteudo: resposta,
          criado_em: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    return res.status(200).json({
      status: 'ok',
      intencao,
      os_encontrada: !!os,
      resposta_enviada: !!resposta,
    });

  } catch(error) {
    console.error('[WPP] Erro no webhook:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};
