// Simulador do atendimento: mostra o que seria respondido, sem enviar nada pelo WhatsApp.
// Dois modos: "ia" (Claude + ferramentas, com conversa de várias mensagens) e "regras" (robô antigo).
// Usa o WooCommerce de verdade para o status do pedido. Não precisa da Meta configurada.
import type { Metadata } from 'next';
import Link from 'next/link';
import { responderComIA, iaDisponivel, PassoFerramenta } from '../../../lib/automacao/agente';
import { classificar, montarResposta } from '../../../lib/automacao/atendimento';
import { config, integracoes } from '../../../lib/automacao/config';
import type { Conversa, Mensagem } from '../../../lib/automacao/conversas';
import { telefoneWhatsapp } from '../../../lib/automacao/whatsapp';
import { acessoAtendimento as logado } from '../../../lib/painel/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata: Metadata = { title: 'Simulador do robô', robots: { index: false, follow: false } };

const NOMES: Record<string, string> = {
  pedido: 'status do pedido',
  tamanhos: 'tabela de tamanhos',
  prazo: 'prazo',
  saudacao: 'boas-vindas',
  outro: 'não reconhecida',
};

type Fala = { de: 'cliente' | 'robo'; texto: string };
type Detalhe = { ferramentas?: PassoFerramenta[]; tokens?: string; humano?: string; intencao?: string; erro?: string };

function lerHistorico(bruto: string): Fala[] {
  try {
    const h = JSON.parse(bruto || '[]');
    return Array.isArray(h) ? h.filter((f) => f && typeof f.texto === 'string').slice(-30) : [];
  } catch {
    return [];
  }
}

export default async function SimuladorPage({
  searchParams,
}: {
  searchParams: Promise<{ tel?: string; msg?: string; hist?: string; modo?: string; nome?: string }>;
}) {
  if (!(await logado())) {
    return (
      <p className="p-8 text-center">
        <Link className="underline" href="/atendimento">Entre no painel</Link> para usar o simulador.
      </p>
    );
  }
  const { tel = '', msg = '', hist = '', nome = '' } = await searchParams;
  const modo = (await searchParams).modo === 'regras' || !iaDisponivel() ? 'regras' : 'ia';
  const numero = telefoneWhatsapp(tel) || '';
  const falas = lerHistorico(hist);
  let detalhe: Detalhe | null = null;

  if (msg.trim()) {
    falas.push({ de: 'cliente', texto: msg.trim() });
    detalhe = {};
    try {
      if (modo === 'ia') {
        const mensagens: Mensagem[] = falas.map((f, i) => ({ de: f.de, texto: f.texto, em: i }));
        const conversa: Conversa = { numero, nome: nome || undefined, mensagens, atualizadaEm: falas.length, naoLidas: 0 };
        const r = await responderComIA({ numeroCliente: numero, texto: msg.trim(), conversa });
        detalhe.ferramentas = r.ferramentas;
        detalhe.tokens = `${r.tokens.entrada} tokens de entrada + ${r.tokens.saida} de saída (${config.whatsapp.ia.modelo})`;
        if (r.humano) detalhe.humano = r.motivoHumano;
        const texto = r.texto || (r.humano ? config.whatsapp.respostas.humano || '(sem mensagem: só passa para você)' : '');
        if (texto) falas.push({ de: 'robo', texto });
      } else {
        const intencao = classificar(msg);
        detalhe.intencao = NOMES[intencao.tipo] || intencao.tipo;
        if (intencao.tipo === 'pedido' && !numero) {
          detalhe.erro = 'Para status do pedido, informe o telefone de quem estaria escrevendo.';
        } else {
          const t = (await montarResposta(intencao, numero))?.texto;
          if (t) falas.push({ de: 'robo', texto: t });
          else detalhe.humano = 'não reconhecida';
        }
      }
    } catch (e) {
      detalhe.erro = (e as Error).message;
    }
  }

  const histJson = JSON.stringify(falas);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-[#0B1B34]">Simulador do atendimento</h1>
        <Link href="/atendimento" className="text-sm underline text-gray-600">Voltar ao atendimento</Link>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Escreva como se fosse o cliente. Nada é enviado pelo WhatsApp.
        {!integracoes.woo() && ' (WooCommerce não configurado: o status do pedido não funciona aqui.)'}
        {!iaDisponivel() && ' Para testar a IA, configure ANTHROPIC_API_KEY na Vercel.'}
        {iaDisponivel() && !config.whatsapp.ia.ativa && ' A IA ainda está desligada no WhatsApp de verdade (WHATSAPP_IA=true liga).'}
      </p>

      <div className="flex gap-2 mb-4 text-sm">
        {(['ia', 'regras'] as const).map((m) => (
          <Link
            key={m}
            href={`/atendimento/simulador?modo=${m}&tel=${encodeURIComponent(tel)}&nome=${encodeURIComponent(nome)}`}
            className={`px-3 py-1 rounded border ${modo === m ? 'bg-[#0B1B34] text-white' : 'text-gray-700'}`}
          >
            {m === 'ia' ? 'IA (Claude)' : 'Robô de regras'}
          </Link>
        ))}
        {falas.length > 0 && (
          <Link
            href={`/atendimento/simulador?modo=${modo}&tel=${encodeURIComponent(tel)}&nome=${encodeURIComponent(nome)}`}
            className="ml-auto px-3 py-1 rounded border text-gray-700"
          >
            Nova conversa
          </Link>
        )}
      </div>

      {falas.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {falas.map((f, i) => (
            <div
              key={i}
              className={`rounded p-3 text-sm whitespace-pre-wrap max-w-[85%] ${
                f.de === 'cliente' ? 'bg-gray-100 self-start' : 'bg-green-100 self-end'
              }`}
            >
              {f.texto}
            </div>
          ))}
        </div>
      )}

      {detalhe && (
        <div className="border rounded p-3 text-xs flex flex-col gap-2 mb-4 bg-gray-50">
          {detalhe.intencao && <div><b>Entendeu como:</b> {detalhe.intencao}</div>}
          {detalhe.ferramentas && (
            <div>
              <b>Ferramentas usadas:</b> {detalhe.ferramentas.length ? '' : 'nenhuma'}
              {detalhe.ferramentas.map((f, i) => (
                <details key={i} className="mt-1">
                  <summary className="cursor-pointer">
                    {f.nome}({JSON.stringify(f.entrada)})
                  </summary>
                  <pre className="whitespace-pre-wrap break-all bg-white border rounded p-2 mt-1">{f.saida}</pre>
                </details>
              ))}
            </div>
          )}
          {detalhe.humano && <div className="text-orange-700"><b>Passaria para você:</b> {detalhe.humano}</div>}
          {detalhe.tokens && <div className="text-gray-500">{detalhe.tokens}</div>}
          {detalhe.erro && <div className="text-red-600">{detalhe.erro}</div>}
        </div>
      )}

      <form className="flex flex-col gap-3">
        <input type="hidden" name="modo" value={modo} />
        <input type="hidden" name="hist" value={histJson} />
        <div className="flex gap-2">
          <input name="tel" defaultValue={tel} placeholder="Telefone do cliente (para pedidos)" className="border rounded p-2 text-sm flex-1" />
          <input name="nome" defaultValue={nome} placeholder="Nome no WhatsApp" className="border rounded p-2 text-sm w-40" />
        </div>
        <textarea name="msg" required rows={2} placeholder="Mensagem do cliente" className="border rounded p-2 text-sm" autoFocus />
        <button className="bg-[#0B1B34] text-white p-2 rounded font-semibold text-sm">Enviar como cliente</button>
      </form>
    </div>
  );
}
