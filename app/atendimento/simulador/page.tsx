// Simulador do robô: mostra o que seria respondido a uma mensagem, sem enviar nada pelo WhatsApp.
// Usa o WooCommerce de verdade para o status do pedido. Não precisa da Meta configurada.
import type { Metadata } from 'next';
import Link from 'next/link';
import { classificar, montarResposta } from '../../../lib/automacao/atendimento';
import { config, integracoes } from '../../../lib/automacao/config';
import { telefoneWhatsapp } from '../../../lib/automacao/whatsapp';
import { logado } from '../../../lib/automacao/painel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Simulador do robô', robots: { index: false, follow: false } };

const NOMES: Record<string, string> = {
  pedido: 'status do pedido',
  tamanhos: 'tabela de tamanhos',
  prazo: 'prazo',
  saudacao: 'boas-vindas',
  outro: 'não reconhecida',
};

export default async function SimuladorPage({ searchParams }: { searchParams: Promise<{ tel?: string; msg?: string }> }) {
  if (!(await logado())) {
    return (
      <p className="p-8 text-center">
        <Link className="underline" href="/atendimento">Entre no painel</Link> para usar o simulador.
      </p>
    );
  }
  const { tel = '', msg = '' } = await searchParams;
  const numero = telefoneWhatsapp(tel) || '';

  let resultado: { intencao: string; texto?: string; erro?: string } | null = null;
  if (msg.trim()) {
    const intencao = classificar(msg);
    resultado = { intencao: NOMES[intencao.tipo] || intencao.tipo };
    try {
      if (intencao.tipo === 'pedido' && !numero) {
        resultado.erro = 'Para status do pedido, informe o telefone de quem estaria escrevendo.';
      } else {
        resultado.texto = (await montarResposta(intencao, numero))?.texto;
      }
    } catch (e) {
      resultado.erro = (e as Error).message;
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-[#0B1B34]">Simulador do robô</h1>
        <Link href="/atendimento" className="text-sm underline text-gray-600">Voltar ao atendimento</Link>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Escreva como se fosse o cliente. Nada é enviado: só mostra o que o robô responderia.
        {!integracoes.woo() && ' (WooCommerce não configurado: o status do pedido não funciona aqui.)'}
        {!config.whatsapp.respostas.ativas && ' As respostas automáticas ainda estão desligadas no WhatsApp (WHATSAPP_RESPOSTAS_AUTOMATICAS).'}
      </p>
      <form className="flex flex-col gap-3 mb-6">
        <input name="tel" defaultValue={tel} placeholder="Telefone do cliente (ex.: 21 99999-9999)" className="border rounded p-2 text-sm" />
        <textarea name="msg" defaultValue={msg} required rows={2} placeholder="Mensagem do cliente" className="border rounded p-2 text-sm" />
        <button className="bg-[#0B1B34] text-white p-2 rounded font-semibold text-sm">Simular</button>
      </form>
      {resultado && (
        <div className="border rounded p-4 text-sm flex flex-col gap-2">
          <div><b>Entendeu como:</b> {resultado.intencao}</div>
          {resultado.erro && <div className="text-red-600">{resultado.erro}</div>}
          {resultado.texto ? (
            <div className="bg-green-100 rounded p-3 whitespace-pre-wrap">{resultado.texto}</div>
          ) : (
            !resultado.erro && (
              <div className="text-orange-700">
                Sem resposta automática: a conversa iria para você
                {config.whatsapp.respostas.humano ? ` e o cliente receberia: "${config.whatsapp.respostas.humano}"` : ''}.
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
