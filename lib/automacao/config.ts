// Configuração central das automações da Samba Vest.
// Tudo vem de variáveis de ambiente (Vercel → Settings → Environment Variables).
// Cada integração só liga quando as variáveis dela estão preenchidas.

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

function flag(name: string, padrao: boolean): boolean {
  const v = env(name);
  if (v === undefined) return padrao;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(v.toLowerCase());
}

function num(name: string, padrao: number): number {
  const v = Number(env(name));
  return Number.isFinite(v) && v > 0 ? v : padrao;
}

export const config = {
  siteUrl: env('NEXT_PUBLIC_SITE_URL') || 'https://sambavest.com',
  lojaNome: env('LOJA_NOME') || 'Samba Vest',

  woo: {
    url: env('NEXT_PUBLIC_WC_URL') || 'https://api.sambavest.com',
    key: env('WC_CONSUMER_KEY'),
    secret: env('WC_CONSUMER_SECRET'),
    webhookSecret: env('WC_WEBHOOK_SECRET'),
    // Ao receber o código de rastreio, muda o pedido para "Concluído".
    concluirAoEnviar: flag('WC_CONCLUIR_AO_ENVIAR', true),
  },

  kv: {
    // Upstash Redis (Vercel Marketplace → Upstash). Aceita os dois nomes de variável.
    url: env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL'),
    token: env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN'),
  },

  cronSecret: env('CRON_SECRET'),

  bling: {
    clientId: env('BLING_CLIENT_ID'),
    clientSecret: env('BLING_CLIENT_SECRET'),
    // Usados só na primeira vez; depois os tokens renovados ficam salvos no KV.
    accessToken: env('BLING_ACCESS_TOKEN'),
    refreshToken: env('BLING_REFRESH_TOKEN'),
    lojaId: env('BLING_LOJA_ID'),
    enviarPedidos: flag('BLING_ENVIAR_PEDIDOS', true),
    emitirNfe: flag('BLING_EMITIR_NFE', false),
    sincronizarEstoque: flag('BLING_SINCRONIZAR_ESTOQUE', false),
  },

  melhorEnvio: {
    token: env('MELHOR_ENVIO_TOKEN'),
    sandbox: flag('MELHOR_ENVIO_SANDBOX', false),
    userAgent: env('MELHOR_ENVIO_USER_AGENT') || 'Samba Vest',
    criarEnvios: flag('MELHOR_ENVIO_CRIAR_ENVIOS', true),
    // Compra a etiqueta com o saldo da carteira do Melhor Envio. Desligado por padrão.
    comprarEtiqueta: flag('MELHOR_ENVIO_COMPRAR_ETIQUETA', false),
    pesoPorPecaKg: num('PESO_POR_PECA_KG', 0.3),
    caixa: {
      largura: num('CAIXA_LARGURA_CM', 20),
      altura: num('CAIXA_ALTURA_CM', 10),
      comprimento: num('CAIXA_COMPRIMENTO_CM', 15),
    },
    remetente: {
      nome: env('REMETENTE_NOME') || 'Samba Vest',
      telefone: env('REMETENTE_TELEFONE'),
      email: env('REMETENTE_EMAIL'),
      documento: env('REMETENTE_CPF'),
      cnpj: env('REMETENTE_CNPJ'),
      ie: env('REMETENTE_IE'),
      endereco: env('REMETENTE_ENDERECO'),
      numero: env('REMETENTE_NUMERO'),
      complemento: env('REMETENTE_COMPLEMENTO'),
      bairro: env('REMETENTE_BAIRRO'),
      cidade: env('REMETENTE_CIDADE'),
      uf: env('REMETENTE_UF'),
      cep: env('CEP_ORIGEM'),
    },
  },

  whatsapp: {
    token: env('WHATSAPP_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    // Versão da Graph API. Versões antigas saem do ar ~2 anos após o lançamento.
    apiVersion: env('WHATSAPP_API_VERSION') || 'v23.0',
    // Webhook de mensagens recebidas (Meta → /api/webhooks/whatsapp)
    verifyToken: env('WHATSAPP_VERIFY_TOKEN'),
    appSecret: env('WHATSAPP_APP_SECRET'),
    // Número do dono (55 + DDD + número) para receber alertas de mensagens novas
    numeroDono: env('WHATSAPP_NUMERO_DONO'),
    // Template opcional para alertar o dono quando a janela de 24h dele estiver fechada
    templateAlertaDono: env('WHATSAPP_TEMPLATE_ALERTA_DONO'),
    // Não repete o alerta da mesma conversa antes deste intervalo (minutos)
    alertaIntervaloMin: num('WHATSAPP_ALERTA_INTERVALO_MIN', 15),
    painelSenha: env('ATENDIMENTO_SENHA'),
    respostas: {
      // Liga as respostas automáticas (status do pedido, tamanhos, prazo)
      ativas: flag('WHATSAPP_RESPOSTAS_AUTOMATICAS', false),
      // Textos aprovados pelo dono. Vazio = essa dúvida vai para o atendimento humano.
      // Placeholders aceitos: {nome}, {pedido}, {status}, {rastreio}, {link}, {site}
      status: env('WHATSAPP_RESPOSTA_STATUS'),
      tamanhos: env('WHATSAPP_RESPOSTA_TAMANHOS'),
      prazo: env('WHATSAPP_RESPOSTA_PRAZO'),
      boasVindas: env('WHATSAPP_RESPOSTA_BOAS_VINDAS'),
      humano: env('WHATSAPP_RESPOSTA_HUMANO'),
      // Depois que a conversa vai para o humano, o robô fica quieto por estas horas
      silencioHoras: num('WHATSAPP_HUMANO_SILENCIO_HORAS', 12),
    },
    idioma: env('WHATSAPP_TEMPLATE_IDIOMA') || 'pt_BR',
    templates: {
      recebido: env('WHATSAPP_TEMPLATE_RECEBIDO'),
      pago: env('WHATSAPP_TEMPLATE_PAGO') || 'pagamento_aprovado',
      enviado: env('WHATSAPP_TEMPLATE_ENVIADO') || 'pedido_enviado',
      pixLembrete: env('WHATSAPP_TEMPLATE_PIX_LEMBRETE') || 'lembrete_pix',
    },
  },

  email: {
    resendKey: env('RESEND_API_KEY'),
    remetente: env('EMAIL_REMETENTE'),
    admin: env('EMAIL_ADMIN'),
  },

  avisos: {
    // "Pedido recebido" (antes do pagamento) é opcional.
    recebido: flag('AVISAR_PEDIDO_RECEBIDO', false),
    // Eventos que também vão por e-mail. O WooCommerce já manda e-mail de pagamento
    // aprovado e de pedido concluído, então por padrão só enviamos rastreio e lembrete de Pix.
    eventosEmail: (env('AVISOS_EMAIL_EVENTOS') || 'enviado,pixLembrete').split(',').map((s) => s.trim()),
  },

  pix: {
    lembreteAposHoras: num('PIX_LEMBRETE_APOS_HORAS', 1),
    lembreteAteHoras: num('PIX_LEMBRETE_ATE_HORAS', 24),
  },
};

export const integracoes = {
  woo: () => Boolean(config.woo.key && config.woo.secret),
  kv: () => Boolean(config.kv.url && config.kv.token),
  bling: () => Boolean(config.bling.clientId && config.bling.clientSecret),
  melhorEnvio: () => Boolean(config.melhorEnvio.token),
  whatsapp: () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId),
  email: () => Boolean(config.email.resendKey && config.email.remetente),
};
