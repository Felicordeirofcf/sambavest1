// Configurações: o que é técnico ou de uso raro sai do menu principal e fica aqui,
// junto com o monitoramento do sistema (antes na tela inicial).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LinhaServico } from '../../../components/painel/analytics';
import { Aviso, Cartao } from '../../../components/painel/ui';
import { config, integracoes } from '../../../lib/automacao/config';
import { exigirLogin } from '../../../lib/painel/auth';
import { pedidosRecentes } from '../../../lib/painel/dados';
import { pendencias } from '../../../lib/painel/metricas';
import { montarMonitoramento } from '../../../lib/painel/monitoramento';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Hora da consulta (página dinâmica, renderizada a cada acesso). */
const agoraMs = () => Date.now();

const ATALHOS: { href: string; titulo: string; texto: string; icone: ReactNode; externo?: boolean }[] = [
  { href: '/painel/alertas', titulo: 'Alertas no celular', texto: 'Telegram e WhatsApp: venda, Pix parado, estoque, anúncios, resumo do dia.', icone: '🔔' },
  { href: '/painel/whatsapp', titulo: 'Conexão WhatsApp', texto: 'Número da loja conectado pela Evolution (QR Code, recebimento de mensagens).', icone: '📱' },
  { href: '/painel/integracoes', titulo: 'Integrações', texto: 'Bling, Melhor Envio, AppMax, Meta e e-mail: o que está ligado.', icone: '🔌' },
  { href: '/painel/fotos-black', titulo: 'Fotos da Black', texto: 'Escolher a foto vestida que aparece nos cards da página da Black.', icone: '🖼️' },
  { href: '/atendimento', titulo: 'Atendimento', texto: 'Caixa de entrada do WhatsApp para responder clientes.', icone: '🎧' },
  { href: 'https://api.sambavest.com/wp-admin/', titulo: 'WooCommerce', texto: 'Painel do WordPress: produtos, preços, cupons e plugins.', icone: '🛒', externo: true },
];

export default async function Configuracoes() {
  await exigirLogin();
  const agora = agoraMs();
  let erro = '';
  let pedidos: Awaited<ReturnType<typeof pedidosRecentes>> = [];
  try {
    pedidos = await pedidosRecentes(60);
  } catch (e) {
    erro = (e as Error).message;
  }
  const pend = pendencias(pedidos, {
    bling: integracoes.bling() && config.bling.enviarPedidos,
    envios: integracoes.melhorEnvio() && config.melhorEnvio.criarEnvios,
  });
  const servicos = await montarMonitoramento({ pedidos, erro, pend, agora });
  const problemas = servicos.filter((s) => s.estado === 'erro' || s.estado === 'atencao').length;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl">Configurações</h1>
        <p className="mt-1 text-sm text-slate-500">Conexões, alertas e o monitoramento do sistema. O que é do dia a dia fica no menu à esquerda.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ATALHOS.map((a) => {
          const corpo = (
            <div className="flex h-full gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:shadow-md">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg" aria-hidden>
                {a.icone}
              </span>
              <span>
                <span className="block font-semibold text-slate-900">
                  {a.titulo}
                  {a.externo ? ' ↗' : ''}
                </span>
                <span className="mt-0.5 block text-sm text-slate-500">{a.texto}</span>
              </span>
            </div>
          );
          return a.externo ? (
            <a key={a.href} href={a.href} target="_blank" rel="noreferrer">
              {corpo}
            </a>
          ) : (
            <Link key={a.href} href={a.href}>
              {corpo}
            </Link>
          );
        })}
      </div>

      {problemas > 0 && <Aviso>{problemas} item(ns) do monitoramento pedem atenção.</Aviso>}
      <Cartao titulo="Monitoramento do sistema" acao={<Link href="/painel/alertas" className="text-xs underline text-sky-800">alertas no celular</Link>}>
        <ul className="divide-y divide-slate-100">
          {servicos.map((s) => (
            <LinhaServico key={s.nome} nome={s.nome} estado={s.estado} detalhe={s.detalhe} />
          ))}
        </ul>
      </Cartao>
    </div>
  );
}
