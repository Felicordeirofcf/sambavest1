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

function num0(name: string, padrao: number): number {
  const v = Number(env(name));
  return env(name) !== undefined && Number.isFinite(v) && v >= 0 ? v : padrao;
}

function lista(name: string, padrao: string): number[] {
  const v = env(name) ?? padrao;
  if (v.toLowerCase() === 'todos') return [];
  return v.split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
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
    // Nota e etiqueta são feitas pelo Bling: o site não cria envios no Melhor Envio (ligue com true para voltar)
    criarEnvios: flag('MELHOR_ENVIO_CRIAR_ENVIOS', false),
    // Compra a etiqueta com o saldo da carteira do Melhor Envio. Desligado por padrão.
    comprarEtiqueta: flag('MELHOR_ENVIO_COMPRAR_ETIQUETA', false),
    // Client secret do aplicativo do Melhor Envio (Área Dev). Valida a assinatura dos webhooks.
    webhookSecret: env('MELHOR_ENVIO_WEBHOOK_SECRET') || env('MELHOR_ENVIO_CLIENT_SECRET'),
    // Serviços oferecidos na cotação (IDs do Melhor Envio). Padrão: Correios PAC, SEDEX e Mini Envios,
    // Jadlog .Package e .Com. Vazio ("todos") mostra tudo o que o Melhor Envio devolver.
    servicos: lista('MELHOR_ENVIO_SERVICOS', '1,2,17,3,4'),
    // Agência de postagem por serviço, quando a transportadora exige (Jadlog, Azul, Latam...).
    // Formato: "3:123,4:123" (serviço:agência).
    agencias: Object.fromEntries(
      (env('MELHOR_ENVIO_AGENCIAS') || '')
        .split(',')
        .map((par) => par.split(':').map((s) => Number(s.trim())))
        .filter(([s, a]) => s > 0 && a > 0)
    ) as Record<number, number>,
    // Pacote: o mesmo na cotação do checkout e na etiqueta.
    pesoPorPecaKg: num('PESO_POR_PECA_KG', 0.3),
    pesoCaixaKg: num0('PESO_CAIXA_KG', 0),
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
    // Coexistência: o número continua no app WhatsApp Business (celular e PC) e também na API.
    // O site recebe cópia do que você manda pelo app (campo smb_message_echoes).
    coexistencia: flag('WHATSAPP_COEXISTENCIA', false),
    // Quando alertar o dono: todas | humano (só quando precisa de uma pessoa) | nenhum.
    // Padrão: "humano" com coexistência (você já vê tudo no app), "todas" sem.
    alertas: (env('WHATSAPP_ALERTAS') || (flag('WHATSAPP_COEXISTENCIA', false) ? 'humano' : 'todas')).toLowerCase(),
    // Sem senha própria, o atendimento usa a mesma senha do painel de gestão (/painel).
    painelSenha: env('ATENDIMENTO_SENHA') || env('PAINEL_SENHA'),
    respostas: {
      // Liga as respostas automáticas (status do pedido, tamanhos, prazo)
      ativas: flag('WHATSAPP_RESPOSTAS_AUTOMATICAS', false),
      // Textos aprovados pelo dono. Vazio = essa dúvida vai para o atendimento humano.
      // Placeholders aceitos: {nome}, {pedido}, {status}, {rastreio}, {link}, {site}
      status: env('WHATSAPP_RESPOSTA_STATUS'),
      tamanhos: env('WHATSAPP_RESPOSTA_TAMANHOS'),
      // Prazo informado pelo dono: 3 a 7 dias úteis.
      prazo: env('WHATSAPP_RESPOSTA_PRAZO') || 'O prazo de envio é de 3 a 7 dias úteis.',
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

  // Evolution API (WhatsApp pelo QR Code, não oficial). Usada só para receber e responder
  // conversas no painel — sem robô e sem mensagens automáticas.
  evolution: {
    url: (env('EVOLUTION_URL') || '').replace(/\/+$/, '') || undefined,
    apiKey: env('EVOLUTION_API_KEY'),
    instancia: env('EVOLUTION_INSTANCIA') || 'sambavest',
    // Senha que vai na URL do webhook (?token=...), para só a Evolution conseguir entregar mensagens
    webhookToken: env('EVOLUTION_WEBHOOK_TOKEN'),
  },

  // Alertas para o celular do dono (venda, Pix parado, estoque, erros, resumo do dia)
  alertas: {
    // Robô do Telegram (crie no @BotFather). O chat é conectado pelo painel (/painel/alertas).
    telegramToken: env('TELEGRAM_BOT_TOKEN'),
    telegramChatId: env('TELEGRAM_CHAT_ID'),
    // WhatsApp pessoal (55 + DDD + número), enviado pela Evolution quando ela estiver ligada
    whatsappNumero: env('ALERTA_WHATSAPP_NUMERO') || env('WHATSAPP_NUMERO_DONO'),
    // Hora do resumo do dia (horário de Brasília)
    horaResumo: num('ALERTA_HORA_RESUMO', 21),
    // Pix parado há mais de X minutos vira alerta
    pixMinutos: num('ALERTA_PIX_MINUTOS', 30),
    // Tamanho com menos de X unidades vira alerta
    estoqueMinimo: num('ALERTA_ESTOQUE_MINIMO', 3),
  },

  email: {
    resendKey: env('RESEND_API_KEY'),
    remetente: env('EMAIL_REMETENTE'),
    admin: env('EMAIL_ADMIN'),
  },

  meta: {
    // Mesmo ID do Pixel usado no site
    pixelId: env('META_PIXEL_ID') || env('NEXT_PUBLIC_FACEBOOK_PIXEL_ID') || '2779685332183949',
    capiToken: env('META_CAPI_TOKEN'),
    // Código de teste do Gerenciador de Eventos (aba "Testar eventos"). Apague depois de testar.
    testEventCode: env('META_TEST_EVENT_CODE'),
  },

  // Relatórios dos anúncios (Marketing API, só leitura). Token de usuário do sistema com "ads_read".
  metaAds: {
    token: env('META_ADS_TOKEN'),
    conta: (env('META_AD_ACCOUNT_ID') || '315563831612360').replace(/^act_/, ''),
    versao: env('META_API_VERSION') || 'v23.0',
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
  evolution: () => Boolean(config.evolution.url && config.evolution.apiKey && config.evolution.webhookToken),
  email: () => Boolean(config.email.resendKey && config.email.remetente),
  meta: () => Boolean(config.meta.pixelId && config.meta.capiToken),
  telegram: () => Boolean(config.alertas.telegramToken),
  metaAds: () => Boolean(config.metaAds.token && config.metaAds.conta),
};
