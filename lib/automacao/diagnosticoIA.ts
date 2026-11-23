// Diagnóstico (só leitura) do atendimento do WhatsApp: por que a IA manda pouco link de compra?
// Sai no log PÚBLICO do Actions: só contagens. Nenhum telefone, nome ou texto de mensagem.
import { listarConversas } from './conversas';
import { lerRegistroIA } from './registroIA';

const DIA = 86_400_000;
const INTERESSE = /\b(quero|queria|comprar|compro|pre[cç]o|valor|quanto|tamanho|tem (o|a|no|na)|dispon[ií]vel|estoque|frete|entrega|pix|cart[aã]o|como (fa[cç]o|compro)|link|camisa|beija|viradouro|baby|regata|vestido)\b/i;

export async function diagnosticoIA(dias = 7) {
  const desde = Date.now() - dias * DIA;
  const conversas = (await listarConversas(300)).filter((c) => (c.ultimaDoClienteEm || 0) >= desde);
  const c = {
    conversasComCliente: conversas.length,
    clienteDemonstrouInteresse: 0,
    iaRespondeu: 0,
    soAPessoaDaLojaRespondeu: 0,
    ninguemRespondeu: 0,
    iaPausadaAgoraPorPessoaDaLoja: 0,
    recebeuLinkDaSacolaPronta: 0,
    recebeuSoLinkDoProduto: 0,
    interessadosSemNenhumLink: 0,
    interessadosSemLinkEmQueAPessoaDaLojaRespondeu: 0,
  };
  for (const conv of conversas) {
    const msgs = conv.mensagens.filter((m) => m.em >= desde - DIA);
    const doCliente = msgs.filter((m) => m.de === 'cliente');
    const robo = msgs.filter((m) => m.de === 'robo');
    const loja = msgs.filter((m) => m.de === 'loja');
    const saidas = [...robo, ...loja];
    const interesse = doCliente.some((m) => INTERESSE.test(m.texto || ''));
    const sacola = saidas.some((m) => /checkout\?sacola=/.test(m.texto || ''));
    const produto = saidas.some((m) => /\/produto\//.test(m.texto || ''));
    if (interesse) c.clienteDemonstrouInteresse++;
    if (robo.length) c.iaRespondeu++;
    else if (loja.length) c.soAPessoaDaLojaRespondeu++;
    else c.ninguemRespondeu++;
    if (conv.humanoAte && conv.humanoAte > Date.now()) c.iaPausadaAgoraPorPessoaDaLoja++;
    if (sacola) c.recebeuLinkDaSacolaPronta++;
    else if (produto) c.recebeuSoLinkDoProduto++;
    if (interesse && !sacola && !produto) {
      c.interessadosSemNenhumLink++;
      if (loja.length) c.interessadosSemLinkEmQueAPessoaDaLojaRespondeu++;
    }
  }
  const reg = (await lerRegistroIA()).filter((r) => r.em >= desde);
  const ferramentas: Record<string, number> = {};
  for (const r of reg) for (const f of r.ferramentas || []) ferramentas[f] = (ferramentas[f] || 0) + 1;
  const resultados: Record<string, number> = {};
  for (const r of reg) resultados[r.resultado] = (resultados[r.resultado] || 0) + 1;
  return { dias, ...c, registroIA: { tentativas: reg.length, resultados, ferramentasUsadas: ferramentas, guardaSoAsUltimas: 50 } };
}
