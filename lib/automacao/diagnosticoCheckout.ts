// Diagnóstico do checkout (só leitura): o cliente chega a pagar ou trava no caminho?
// A resposta aparece no log PÚBLICO do GitHub Actions, então só sai contagem: sem nome, e-mail,
// telefone, nº de pedido, chave do pedido ou valor em R$.
import { config } from './config';
import { wc, type WcPedido } from './woocommerce';
import { listarAbandonos } from './abandono';
import { falhasNosDias } from './monitor';
import { kvGet } from './kv';

type Nota = { note: string; customer_note: boolean; date_created_gmt: string };

const PAGO = new Set(['processing', 'completed', 'enviado', 'shipped']);
const diaSP = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const quando = (s?: string | null) => (s ? Date.parse(s.endsWith('Z') ? s : s + 'Z') : NaN);
const metodo = (p: WcPedido) => (/pix/i.test(p.payment_method) ? 'pix' : /card|cart|credit/i.test(p.payment_method) ? 'cartao' : p.payment_method || 'nenhum');

/** Classifica as notas do pedido (geralmente escritas pelo plugin da AppMax). */
const CATEGORIAS: [string, RegExp][] = [
  ['recusado', /recus|negad|denied|declin|não autoriz|nao autoriz|reprov/i],
  ['antifraude', /fraud|an[aá]lise de risco|risco/i],
  ['saldoOuLimite', /saldo|limite|insuficiente/i],
  ['dadosDoCartao', /cvv|validade|n[uú]mero do cart|cart[aã]o inv[aá]lid|dados inv[aá]lid/i],
  ['pixGerado', /pix.*(gerad|criad|emitid|qr)|qr ?code/i],
  ['pixExpirado', /expir|venc/i],
  ['erroGateway', /erro|error|falha|fail|timeout|indispon/i],
  ['canceladoAuto', /cancelad.*(autom|tempo|pagamento n)|unpaid order cancelled|pedido não pago cancelado/i],
  ['aprovado', /aprovad|approved|pagamento confirmado|paid/i],
];

/** Tira do texto da nota tudo que poderia identificar alguém (números, e-mails, links). */
const limpar = (t: string) =>
  t
    .replace(/<[^>]+>/g, ' ')
    .replace(/\S+@\S+/g, '[email]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\d[\d.,\-/: ]*/g, '#')
    // Palavras com inicial maiúscula no meio da frase costumam ser nomes de pessoa: viram "[nome]"
    .replace(/(?<=\S\s+)(?!AppMax|Appmax|Pix|PIX|WooCommerce|Woo|Melhor|Envio|Bling|Status|Pedido|Pagamento|Cartão)[A-ZÀ-Ý][a-zà-ÿ]+/g, '[nome]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);

export async function diagnosticoCheckout(horas = 72): Promise<Record<string, unknown>> {
  const agora = Date.now();
  const desde = new Date(agora - horas * 3_600_000);
  const r: Record<string, unknown> = { janelaHoras: horas };

  // 1) Pedidos criados na janela, por situação e forma de pagamento
  const pedidos: WcPedido[] = [];
  for (let pagina = 1; pagina <= 4; pagina++) {
    const lote = await wc<WcPedido[]>(`/orders?status=any&after=${desde.toISOString()}&per_page=50&page=${pagina}&orderby=date&order=desc`);
    pedidos.push(...lote);
    if (lote.length < 50) break;
  }
  const porSituacao: Record<string, number> = {};
  const porMetodo: Record<string, Record<string, number>> = {};
  const porDia: Record<string, { criados: number; pagos: number }> = {};
  const minutosAtePagar: number[] = [];
  for (const p of pedidos) {
    porSituacao[p.status] = (porSituacao[p.status] || 0) + 1;
    const m = metodo(p);
    porMetodo[m] ??= {};
    porMetodo[m][p.status] = (porMetodo[m][p.status] || 0) + 1;
    const dia = diaSP(quando(p.date_created_gmt));
    porDia[dia] ??= { criados: 0, pagos: 0 };
    porDia[dia].criados++;
    if (PAGO.has(p.status) || p.date_paid_gmt) {
      porDia[dia].pagos++;
      const t = (quando(p.date_paid_gmt) - quando(p.date_created_gmt)) / 60_000;
      if (Number.isFinite(t) && t >= 0) minutosAtePagar.push(Math.round(t));
    }
  }
  const pagos = pedidos.filter((p) => PAGO.has(p.status) || p.date_paid_gmt).length;
  minutosAtePagar.sort((a, b) => a - b);
  r.pedidos = {
    criados: pedidos.length,
    pagos,
    taxaPagamento: pedidos.length ? `${Math.round((pagos / pedidos.length) * 100)}%` : null,
    porSituacao,
    porMetodo,
    porDia,
    minutosAtePagarMediana: minutosAtePagar.length ? minutosAtePagar[Math.floor(minutosAtePagar.length / 2)] : null,
  };

  // 2) O pedido recebe o link/código de pagamento da AppMax? (só os NOMES dos campos)
  const camposPagamento: Record<string, number> = {};
  for (const p of pedidos) {
    for (const k of new Set((p.meta_data || []).map((m) => m.key))) {
      if (/appmax|pix|payment|pagamento|boleto|qr|link|url|transac/i.test(k)) camposPagamento[k] = (camposPagamento[k] || 0) + 1;
    }
  }
  r.camposDePagamentoNosPedidos = camposPagamento;

  // 3) Notas dos pedidos não pagos: por que não pagou?
  const naoPagos = pedidos.filter((p) => !PAGO.has(p.status) && !p.date_paid_gmt).slice(0, 15);
  const categorias: Record<string, number> = {};
  const motivos: Record<string, number> = {};
  let semNota = 0;
  await Promise.all(
    naoPagos.map(async (p) => {
      const notas = await wc<Nota[]>(`/orders/${p.id}/notes`).catch(() => [] as Nota[]);
      const internas = notas.filter((n) => !n.customer_note);
      if (!internas.length) semNota++;
      const achadas = new Set<string>();
      for (const n of internas) {
        for (const [nome, re] of CATEGORIAS) if (re.test(n.note)) achadas.add(nome);
        const t = limpar(n.note);
        if (t) motivos[t] = (motivos[t] || 0) + 1;
      }
      for (const c of achadas) categorias[`${metodo(p)}:${c}`] = (categorias[`${metodo(p)}:${c}`] || 0) + 1;
    })
  );
  r.naoPagos = {
    analisados: naoPagos.length,
    semNenhumaNota: semNota,
    categorias,
    notasMaisComuns: Object.entries(motivos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([texto, n]) => `${n}× ${texto}`),
  };

  // 4) A página de pagamento abre? (GET, sem enviar nada) — usa o pedido não pago mais recente
  const teste = pedidos.find((p) => p.status === 'pending');
  if (teste) {
    const base = process.env.WP_BACKEND_URL || config.woo.url;
    const url = `${base}/finalizar-compra/order-pay/${teste.id}/?pay_for_order=true&key=${teste.order_key}`;
    try {
      const res = await fetch(url, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 (diagnostico-checkout)' } });
      const html = await res.text();
      const final = new URL(res.url);
      r.paginaDePagamento = {
        http: res.status,
        terminouEm: `${final.host}${final.pathname.replace(/\/\d+\/?/, '/#/')}`,
        temFormularioDePagamento: /id=["']order_review["']|id=["']payment["']|name=["']woocommerce_pay["']/.test(html),
        botaoPagar: /id=["']place_order["']/.test(html),
        metodosNaPagina: (html.match(/name=["']payment_method["']/g) || []).length,
        mencionaAppmax: /appmax/i.test(html),
        pedeLoginOuVerificarEmail: /verify.*email|verificar.*e-?mail|confirme seu e-?mail|login|fazer login|entrar na sua conta/i.test(html) && !/order_review/.test(html),
        mensagensDeErro: (html.match(/<ul class=["']woocommerce-error[\s\S]*?<\/ul>|<div class=["']woocommerce-error[\s\S]*?<\/div>/g) || [])
          .map((t) => limpar(t))
          .slice(0, 3),
        tamanhoKb: Math.round(html.length / 1024),
      };
    } catch (e) {
      r.paginaDePagamento = { erro: (e as Error).name === 'TimeoutError' ? 'demorou mais de 20 s' : (e as Error).message.slice(0, 120) };
    }
  } else {
    r.paginaDePagamento = 'nenhum pedido pendente na janela para testar';
  }

  // 5) Carrinhos abandonados (quem preencheu o checkout e não gerou pedido)
  const abandonos = await listarAbandonos(horas).catch(() => []);
  r.carrinhosAbandonados = {
    total: abandonos.length,
    viraramPedido: abandonos.filter((a) => a.convertido).length,
    comTelefone: abandonos.filter((a) => a.telefone).length,
    lembretesEnviados: abandonos.filter((a) => a.emails > 0).length,
  };

  // 6) Falhas registradas pelo próprio checkout do site (frete, validação, WooCommerce)
  const dias = [0, 1, 2].map((d) => diaSP(agora - d * 86_400_000));
  r.falhasDoSite = await falhasNosDias(dias);
  const ultimas: Record<string, unknown> = {};
  for (const t of ['checkout-erro', 'checkout-recusado', 'frete-erro', 'frete-vazio']) {
    const u = await kvGet<{ em: number; detalhe: string }>(`falhas:ultima:${t}`).catch(() => null);
    if (u) ultimas[t] = { horasAtras: Math.round((agora - u.em) / 3_600_000), detalhe: limpar(u.detalhe) };
  }
  r.ultimaFalhaDeCadaTipo = ultimas;

  return r;
}

/**
 * Sonda (só leitura) o formulário da página de pagamento do pedido pendente mais recente, para saber
 * se dá para gerar o Pix por trás do site. Não envia nada. Só nomes de campos e IDs de método: nunca
 * valores (a chave do pedido e o nonce não saem).
 */
export async function sondarFormularioPix(): Promise<Record<string, unknown>> {
  const pedidos = await wc<WcPedido[]>('/orders?status=pending&per_page=20&orderby=date&order=desc');
  const alvo = pedidos.find((p) => /pix/i.test(p.payment_method));
  if (!alvo) return { erro: 'nenhum pedido Pix pendente para sondar' };
  const base = process.env.WP_BACKEND_URL || config.woo.url;
  const url = `${base}/finalizar-compra/order-pay/${alvo.id}/?pay_for_order=true&key=${alvo.order_key}`;
  const res = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 (diagnostico-pix)' } });
  const html = await res.text();
  const cookies = (res.headers.getSetCookie?.() || []).map((c) => c.split('=')[0]);
  const forma = html.match(/<form[^>]*id=["']order_review["'][^>]*>/i)?.[0] || '';
  const campos = [...html.matchAll(/<input\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, nome: string) => tag.match(new RegExp(`${nome}=["']([^"']*)["']`, 'i'))?.[1] || '';
  const resumoCampos = campos.map((t) => ({ nome: attr(t, 'name'), tipo: attr(t, 'type') || 'text', marcado: /\bchecked\b/i.test(t) })).filter((c) => c.nome);
  const scriptsAppmax = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1]).filter((s) => /appmax|pagamentos_para/i.test(s)).map((s) => s.replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
  return {
    http: res.status,
    redirecionou: res.status >= 300 && res.status < 400 ? (res.headers.get('location') || '').replace(/key=[^&]+/, 'key=***') : null,
    cookiesDefinidos: cookies,
    formulario: { metodo: attr(forma, 'method') || null, temAction: Boolean(attr(forma, 'action')), id: attr(forma, 'id') || null },
    campos: resumoCampos,
    metodosDePagamento: resumoCampos.filter((c) => c.nome === 'payment_method').length,
    temNonce: /woocommerce-pay-nonce|_wpnonce/i.test(html),
    temBotaoPagar: /id=["']place_order["']/i.test(html),
    scriptsDoPlugin: scriptsAppmax.slice(0, 8),
    // Pelo cadastro do pedido (o texto da página também fala de "QR Code" mesmo sem Pix gerado)
    jaTemPixGerado: (alvo.meta_data || []).some((m) => /appmax_payment_code/.test(m.key) && Boolean(m.value)),
    estrutura: estruturaDaPagina(html),
    tamanhoKb: Math.round(html.length / 1024),
  };
}

/**
 * Esqueleto visual da página (só nomes de classes e IDs, sem textos nem valores), para escrever o CSS
 * que deixa a página de pagamento com a cara da loja.
 */
function estruturaDaPagina(html: string): Record<string, unknown> {
  const tags = [...html.matchAll(/<(\w+)\b([^>]*)>/g)];
  const contagem = new Map<string, number>();
  const ids = new Set<string>();
  for (const [, , attrs] of tags) {
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    if (id && /(order|pay|place|payment|checkout|content|primary|main|woocommerce|elementor|appmax|cr_|wc)/i.test(id)) ids.add(id);
    const cls = attrs.match(/\bclass=["']([^"']+)["']/i)?.[1];
    if (!cls) continue;
    for (const c of cls.split(/\s+/)) {
      if (/(woocommerce|payment|order|pay|place|appmax|cr-|wc-|entry|elementor-(widget|section)|form-row|shop_table|button)/i.test(c)) contagem.set(c, (contagem.get(c) || 0) + 1);
    }
  }
  const body = html.match(/<body[^>]*class=["']([^"']+)["']/i)?.[1]?.split(/\s+/).slice(0, 25) || [];
  const css = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
    .map((m) => m[1].replace(/^https?:\/\/[^/]+/, '').split('?')[0])
    .filter((u) => /themes|appmax|pagamentos|woocommerce|elementor/i.test(u))
    .slice(0, 12);
  const tema = html.match(/\/wp-content\/themes\/([^/]+)\//)?.[1] || null;
  const botao = html.match(/<button[^>]*id=["']place_order["'][^>]*>/i)?.[0].replace(/value=["'][^"']*["']/gi, '') || null;
  const metodos = [...html.matchAll(/<li[^>]*class=["']([^"']*wc_payment_method[^"']*)["']/gi)].map((m) => m[1]);
  const caixas = [...html.matchAll(/<div[^>]*class=["']([^"']*payment_box[^"']*)["']/gi)].map((m) => m[1]);
  return {
    tema,
    elementor: /elementor/i.test(html),
    classesDoBody: body,
    folhasDeEstilo: css,
    ids: [...ids].slice(0, 40),
    classesMaisUsadas: [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([c, n]) => `${c}×${n}`),
    botaoPagar: botao,
    itensDeMetodo: metodos,
    caixasDeMetodo: caixas,
    temAvisoDeErro: /woocommerce-error|woocommerce-notice/i.test(html),
  };
}
