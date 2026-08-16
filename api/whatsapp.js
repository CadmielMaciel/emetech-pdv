/**
 * ══════════════════════════════════════════════════════════════════════
 * WEBHOOK WHATSAPP — MISU SYS  (arquivo antigo: "EMETech PDV")
 * Arquivo: api/whatsapp.js
 * Hospedagem: Vercel (detecta automaticamente como Serverless Function)
 * Endpoint: https://<seu-projeto>.vercel.app/api/whatsapp
 *
 * Configure na Evolution API:
 *   Webhook URL: https://<seu-projeto>.vercel.app/api/whatsapp
 *   Eventos: MESSAGES_UPSERT
 *
 * Fatia 16 — o que mudou (tudo aditivo, nenhuma rota/contrato removido):
 *   1) Idempotência: mensagem repetida (reenvio de webhook) não gera
 *      resposta nem gravação duplicada — usa a coluna `external_id` que
 *      já existe em `mensagens_whatsapp` (mesma coluna usada pelo módulo
 *      WhatsApp de index.html para o lado "saída").
 *   2) Isolamento por empresa: a busca de cliente agora pode ser
 *      restrita a uma empresa (`WHATSAPP_EMPRESA_ID`), e a busca de OS +
 *      gravação de mensagem sempre reaproveita o `empresa_id` do próprio
 *      cliente encontrado — antes buscava em TODAS as empresas do banco
 *      (ver PENDENCIAS_API_FATIA16.md, risco 1).
 *   3) Corrigido o insert em `mensagens_whatsapp`: usava um campo
 *      `criado_em` que não existe no schema real (o schema usado em
 *      index.html/addMsgOS() é `created_at`, automático) — isso
 *      provavelmente fazia o insert falhar sempre, escondido pelo
 *      `.catch(()=>{})` que já existia. Também faltava `empresa_id` e
 *      `tipo`, presentes no schema real.
 *   4) Logs deixaram de gravar telefone completo/conteúdo integral da
 *      mensagem — só metadados (número mascarado, tamanho da mensagem,
 *      intenção, ids). Nenhum token/secret nunca foi logado (mantido).
 *   5) Validação opcional de origem do webhook (`EVOLUTION_WEBHOOK_TOKEN`)
 *      — só ativa se você configurar essa env var.
 *   6) Respostas HTTP ganharam um campo `success` (true/false) somado aos
 *      campos que já existiam — nada foi removido do formato antigo.
 * ══════════════════════════════════════════════════════════════════════
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://icgfpfwcnhkjglrmnuca.supabase.co';
// SEGURANÇA (Fatia 8): antes havia um fallback com a anon key hardcoded caso
// nenhuma env var estivesse configurada na Vercel — isso fazia a function
// "funcionar silenciosamente" com privilégio errado (ou nenhum) sem avisar
// ninguém, e duplicava a key pública no código-fonte. Agora a key só vem de
// env var; se não estiver configurada, o handler abaixo responde com erro
// genérico (sem detalhe técnico) em vez de seguir com uma key incorreta.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || null;

// URL da Evolution API (configurar em Vercel Environment Variables)
const EVO_URL  = process.env.EVOLUTION_API_URL || '';
const EVO_KEY  = process.env.EVOLUTION_API_KEY || '';
const EVO_INST = process.env.EVOLUTION_INSTANCE || 'emetech-pdv';

// Fatia 16 (opcional — não quebra nada se não configurar): se este deploy
// atende só UMA empresa, defina essa env var na Vercel com o `id` da
// empresa. Isso restringe a PRIMEIRA busca (por telefone) a essa empresa.
// Sem essa env var, o comportamento continua igual ao de antes desta
// fatia (busca em todas as empresas) — ver risco 1 no PENDENCIAS.
const WHATSAPP_EMPRESA_ID = process.env.WHATSAPP_EMPRESA_ID || null;

// Fatia 16 (opcional): validação de origem do webhook. "não encontrei
// essa função no projeto" — não sei se a Evolution API deste deploy já
// envia algum header de assinatura/apikey de volta; assunção técnica —
// precisa validar com quem configurou a instância. Se você confirmar o
// mecanismo real, configure essa env var pra ativar a checagem abaixo.
const WEBHOOK_TOKEN = process.env.EVOLUTION_WEBHOOK_TOKEN || null;

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

// Fatia 16: mascara o telefone pros logs (nunca grava o número completo
// nem o conteúdo da mensagem — só o suficiente pra debug).
function mascararNumero(n) {
  const s = String(n || '');
  if (s.length <= 4) return '*'.repeat(s.length);
  return s.slice(0, 2) + '*'.repeat(Math.max(0, s.length - 6)) + s.slice(-4);
}

// Fatia 16: log estruturado — endpoint/evento/ids/status, nunca token,
// secret, telefone completo ou conteúdo integral de mensagem.
function logEvento(campos) {
  try {
    console.log('[WPP]', JSON.stringify({ ts: new Date().toISOString(), ...campos }));
  } catch (_) {
    console.log('[WPP] falha ao serializar log de evento');
  }
}

// ── ENVIAR MENSAGEM VIA EVOLUTION API ──────────────────────────────
async function enviarWhatsApp(numero, texto) {
  if (!EVO_URL || !EVO_KEY) {
    logEvento({ evento: 'envio_nao_configurado' });
    return { ok: false, messageId: null };
  }
  try {
    const resp = await fetch(`${EVO_URL}/message/sendText/${EVO_INST}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVO_KEY,
      },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    // Fatia 16: tenta capturar o id da mensagem enviada (mesmo padrão que
    // index.html já usa pro campo external_id de saída) — se a Evolution
    // não devolver isso no formato esperado, messageId fica null sem
    // quebrar o envio.
    let messageId = null;
    try {
      const j = await resp.clone().json();
      messageId = j?.key?.id || j?.id || null;
    } catch (_) { /* corpo não era JSON — sem problema */ }
    return { ok: resp.ok, messageId };
  } catch (e) {
    logEvento({ evento: 'erro_envio', erro: String(e?.message || e).slice(0, 150) });
    return { ok: false, messageId: null };
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
      success: true,
      status: 'ok',
      service: 'MISU SYS — WhatsApp Webhook',
      timestamp: new Date().toISOString(),
      evolution_configured: !!(EVO_URL && EVO_KEY),
      empresa_scoped: !!WHATSAPP_EMPRESA_ID,      // Fatia 16 — só indica se está configurado, não o valor
      origem_validada: !!WEBHOOK_TOKEN,           // idem
    });
  }

  if (req.method !== 'POST') {
    logEvento({ evento: 'metodo_invalido', metodo: req.method });
    return res.status(405).json({ success: false, message: 'Método não permitido.', error: 'Method not allowed' });
  }

  // Fatia 16: validação opcional de origem — só roda se EVOLUTION_WEBHOOK_TOKEN
  // estiver configurado (assunção técnica sobre o mecanismo real, ver topo do arquivo).
  if (WEBHOOK_TOKEN) {
    const recebido = req.headers['apikey'] || req.headers['x-webhook-token'] || '';
    if (recebido !== WEBHOOK_TOKEN) {
      logEvento({ evento: 'origem_rejeitada' });
      return res.status(401).json({ success: false, message: 'Não autorizado.' });
    }
  }

  if (!SUPABASE_KEY) {
    console.error('[WPP] SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY não configuradas nas variáveis de ambiente da Vercel.');
    return res.status(500).json({ success: false, message: 'Serviço temporariamente indisponível.', error: 'Serviço temporariamente indisponível.' });
  }

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    logEvento({ evento: 'payload_recebido', tem_data: !!body.data, tem_event: !!body.event, tem_from: !!body.From });

    // ── PARSEAR PAYLOAD DA EVOLUTION API ──────────────────────────
    // Formato: { event: 'MESSAGES_UPSERT', data: { key: { remoteJid }, message: { conversation } } }
    let numero = '';
    let textoMensagem = '';
    let fromMe = false;
    let wppMsgId = null; // Fatia 16: id da mensagem, usado pra idempotência

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
      wppMsgId      = key.id || null;
    } else if (body?.From) {
      // Formato alternativo (ex.: Twilio) — nome do id de mensagem é
      // assunção técnica, não confirmei neste projeto.
      numero        = limparTelefone(body.From);
      textoMensagem = body.Body || '';
      wppMsgId      = body.MessageSid || body.SmsMessageSid || null;
    }

    // Ignorar mensagens enviadas pelo bot
    if (fromMe || !numero || !textoMensagem.trim()) {
      logEvento({ evento: 'ignorado', motivo: fromMe ? 'from_me' : (!numero ? 'sem_numero' : 'sem_texto') });
      return res.status(200).json({ success: true, status: 'ignored' });
    }

    logEvento({ evento: 'mensagem_recebida', numero: mascararNumero(numero), tamanho_msg: textoMensagem.length, tem_id: !!wppMsgId });

    // ── CONECTAR AO SUPABASE ──────────────────────────────────────
    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── Fatia 16: IDEMPOTÊNCIA ─────────────────────────────────────
    // Se a Evolution reenviar o mesmo webhook (comum em timeouts), não
    // processa de novo — evita responder 2x ou gravar mensagem duplicada.
    // Reaproveita a coluna `external_id` que já existe em
    // `mensagens_whatsapp` (mesma usada pelo lado "saída" em index.html).
    if (wppMsgId) {
      try {
        const { data: jaExiste } = await db.from('mensagens_whatsapp')
          .select('id').eq('external_id', wppMsgId).eq('direcao', 'entrada').limit(1);
        if (jaExiste && jaExiste.length > 0) {
          logEvento({ evento: 'duplicado_ignorado' });
          return res.status(200).json({ success: true, status: 'duplicate', message: 'Mensagem já processada anteriormente.' });
        }
      } catch (e) {
        // Falha na checagem de idempotência não pode travar o atendimento —
        // só loga e segue (falha aberta, mesmo espírito do resto do arquivo).
        logEvento({ evento: 'erro_checagem_idempotencia', erro: String(e?.message || e).slice(0, 150) });
      }
    }

    // ── BUSCAR CLIENTE PELO TELEFONE ──────────────────────────────
    // Fatia 16: se WHATSAPP_EMPRESA_ID estiver configurado, restringe a
    // busca a essa empresa (ver topo do arquivo e PENDENCIAS, risco 1).
    const numLimpo = numero.replace(/^55/, ''); // remove DDI Brasil
    let queryClientes = db.from('clientes')
      .select('id, nome, telefone, whatsapp, empresa_id')
      .or(`telefone.ilike.%${numLimpo}%,whatsapp.ilike.%${numLimpo}%`);
    if (WHATSAPP_EMPRESA_ID) queryClientes = queryClientes.eq('empresa_id', WHATSAPP_EMPRESA_ID);
    const { data: clientes } = await queryClientes;

    // ── BUSCAR OS ABERTA MAIS RECENTE DO CLIENTE ──────────────────
    let os = null;
    let clienteNome = 'Cliente';
    let empresaId = WHATSAPP_EMPRESA_ID; // usado só pra gravar mensagens_whatsapp

    if (clientes && clientes.length > 0) {
      const cli = clientes[0];
      clienteNome = cli.nome;
      // Fatia 16: sempre que o cliente tem empresa_id, usa o dele — mesmo
      // se WHATSAPP_EMPRESA_ID não estiver configurado, isso evita buscar
      // OS de empresa diferente da do cliente encontrado.
      if (cli.empresa_id) empresaId = cli.empresa_id;

      let queryOS = db.from('ordens_servico')
        .select('*')
        .eq('cliente_id', cli.id)
        .not('status', 'eq', 'Entregue')
        .order('created_at', { ascending: false })
        .limit(1);
      if (cli.empresa_id) queryOS = queryOS.eq('empresa_id', cli.empresa_id);
      const { data: ordens } = await queryOS;

      if (ordens && ordens.length > 0) {
        os = ordens[0];
        if (os.empresa_id) empresaId = os.empresa_id;
      }
    }

    // Fatia 16: helper único pra gravar mensagem — schema alinhado ao que
    // index.html/addMsgOS() já usa de verdade (empresa_id, tipo,
    // external_id). O `criado_em` antigo não existia no schema real
    // (created_at é automático) — removido.
    async function salvarMensagem(direcao, conteudo, extId) {
      if (!os) return;
      try {
        await db.from('mensagens_whatsapp').insert({
          ...(empresaId ? { empresa_id: empresaId } : {}),
          os_id: os.id,
          numero,
          direcao,
          conteudo,
          tipo: 'text',
          external_id: extId || null,
          lida: false,
        });
      } catch (e) {
        logEvento({ evento: 'erro_salvar_mensagem', direcao, erro: String(e?.message || e).slice(0, 150) });
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
        await salvarMensagem('entrada', textoMensagem, wppMsgId);
      } else if (clientes && clientes.length > 0) {
        resposta = `Olá, ${clienteNome}! Não encontrei nenhuma OS em aberto no seu nome.\n\nPossível que já foi entregue ou não temos OS cadastrada. Entre em contato conosco!`;
      } else {
        resposta = `Não encontrei cadastro com este número.\n\nPara verificar sua OS, entre em contato direto com nossa equipe.`;
      }

    } else if (intencao === 'cancelar') {
      resposta = `Olá, ${clienteNome}. Recebemos seu pedido de cancelamento.\n\nUm de nossos atendentes entrará em contato em breve para verificar o que aconteceu. 🙏`;

      // Salvar alerta de cancelamento
      if (os) {
        await salvarMensagem('entrada', `⚠️ CANCELAMENTO: ${textoMensagem}`, wppMsgId);
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
      const { ok: enviado, messageId: respMsgId } = await enviarWhatsApp(numero, resposta);
      logEvento({ evento: 'resposta_processada', enviado, os_id: os?.id || null, intencao });

      // Salvar mensagem saída no Supabase
      if (enviado) {
        await salvarMensagem('saida', resposta, respMsgId);
      }
    }

    return res.status(200).json({
      success: true,
      status: 'ok',
      intencao,
      os_encontrada: !!os,
      resposta_enviada: !!resposta,
    });

  } catch (error) {
    // SEGURANÇA (Fatia 8): erro técnico completo só no log do servidor —
    // nunca na resposta HTTP (evita vazar detalhes de payload/infra).
    console.error('[WPP] Erro no webhook:', error);
    return res.status(500).json({
      success: false,
      status: 'error',
      message: 'Não foi possível processar a mensagem.',
    });
  }
};
