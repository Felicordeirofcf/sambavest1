// Atendimento do WhatsApp dentro do painel: lista de conversas, chat e dados do cliente.
// Mostra também como está o canal (Evolution/API oficial) e se a IA está respondendo.
import Link from 'next/link';
import { AutoAtualizar, CaixaResposta, RolarParaFim } from '../../../components/painel/atendimento/Cliente';
import { Aviso, StatusPedido, brl } from '../../../components/painel/ui';
import { iaDisponivel } from '../../../lib/automacao/agente';
import { semJanela24h } from '../../../lib/automacao/atendimento';
import { config, integracoes } from '../../../lib/automacao/config';
import { Conversa, janelaAberta, listarConversas, obterConversa, type Mensagem } from '../../../lib/automacao/conversas';
import { estadoConexao } from '../../../lib/automacao/evolution';
import { chaveTelefone } from '../../../lib/automacao/whatsapp';
import { exigirLogin } from '../../../lib/painel/auth';
import { lerRegistroIA } from '../../../lib/automacao/registroIA';
import { pedidosPorTelefone } from '../../../lib/painel/crmDados';
import { pedidosRecentes } from '../../../lib/painel/dados';
import { MEDIDAS } from '../../../lib/medidas';
import { acaoAtendimento, responderAtendimento } from '../actions';

export const maxDuration = 30;

const agoraMs = () => Date.now();
const TZ = 'America/Sao_Paulo';
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const diaChave = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { timeZone: TZ });

function quandoCurto(ms: number, agora: number): string {
  if (diaChave(ms) === diaChave(agora)) return hora(ms);
  if (diaChave(ms) === diaChave(agora - 86_400_000)) return 'ontem';
  return new Date(ms).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
}

function rotuloDia(ms: number, agora: number): string {
  if (diaChave(ms) === diaChave(agora)) return 'Hoje';
  if (diaChave(ms) === diaChave(agora - 86_400_000)) return 'Ontem';
  return new Date(ms).toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long' });
}

const FILTROS = [
  ['todas', 'Todas'],
  ['esperando', 'Esperando resposta'],
  ['pessoa', 'Com você'],
  ['auto', 'Respondidas pela IA'],
  ['nao-lidas', 'Não lidas'],
] as const;
type Filtro = (typeof FILTROS)[number][0];

const ultimaDe = (c: Conversa) => c.mensagens[c.mensagens.length - 1];
const comPessoa = (c: Conversa, agora: number) => Boolean(c.humanoAte && c.humanoAte > agora);
const esperando = (c: Conversa) => ultimaDe(c)?.de === 'cliente';

function passaFiltro(c: Conversa, f: Filtro, agora: number) {
  if (f === 'esperando') return esperando(c);
  if (f === 'pessoa') return comPessoa(c, agora);
  if (f === 'auto') return ultimaDe(c)?.de === 'robo';
  if (f === 'nao-lidas') return c.naoLidas > 0;
  return true;
}

const inicial = (c: Conversa) => (c.nome || '').replace(/[^\p{L}\d]/gu, '').slice(0, 1).toUpperCase() || '#';
const nomeDe = (c: Conversa) => c.nome || `+${c.numero}`;
const CORES_AVATAR = ['bg-emerald-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-700', 'bg-rose-600', 'bg-teal-700'];
const corAvatar = (n: string) => CORES_AVATAR[Number(n.slice(-2)) % CORES_AVATAR.length] || CORES_AVATAR[0];

function Selo({ c, agora }: { c: Conversa; agora: number }) {
  if (comPessoa(c, agora) && esperando(c))
    return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">precisa de você</span>;
  if (comPessoa(c, agora)) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">com você</span>;
  if (ultimaDe(c)?.de === 'robo') return <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">IA</span>;
  return null;
}

function Pilula({ ok, texto, ajuda }: { ok: boolean | 'aviso'; texto: string; ajuda?: string }) {
  const cor = ok === true ? 'bg-emerald-500' : ok === 'aviso' ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700" title={ajuda}>
      <span className={`h-2 w-2 rounded-full ${cor}`} aria-hidden />
      {texto}
    </span>
  );
}

const RAPIDAS = [
  { rotulo: '👋 Saudação', texto: 'Oi! Aqui é da Samba Vest 😊 Como posso te ajudar?' },
  {
    rotulo: '📏 Medidas',
    texto: `Medidas da camisa (largura x altura, em cm): ${Object.entries(MEDIDAS.unissex.tamanhos)
      .map(([t, [l, a]]) => `${t} ${l}x${a}`)
      .join(' | ')}. Dica: mede uma camisa sua deitada na mesa, de axila a axila, e compara com a largura 😉`,
  },
  { rotulo: '💳 Pagamento', texto: `Você pode pagar por Pix (aprovação na hora) ou no cartão de crédito em até 3x sem juros, direto no site: ${config.siteUrl}` },
  { rotulo: '🚚 Frete', texto: 'Enviamos para todo o Brasil! O frete é calculado no site com o seu CEP, na página da camisa ou na sacola.' },
  { rotulo: '🔁 Troca', texto: 'Fazemos a troca de tamanho, sim, e o frete é por nossa conta! Me manda o número do seu pedido e o tamanho que você quer 🙂' },
  { rotulo: '🙏 Obrigado', texto: 'Obrigado pela compra! Qualquer dúvida é só chamar aqui 💛' },
];

export default async function AtendimentoPainel({
  searchParams,
}: {
  searchParams: Promise<{ n?: string; f?: string; q?: string; erro?: string; ok?: string }>;
}) {
  await exigirLogin();
  const sp = await searchParams;
  const agora = agoraMs();
  const f: Filtro = FILTROS.some(([v]) => v === sp.f) ? (sp.f as Filtro) : 'todas';
  const q = (sp.q || '').trim().toLowerCase();

  if (!integracoes.kv()) return <Aviso tipo="erro">O atendimento precisa do Upstash (KV) configurado para guardar as conversas.</Aviso>;

  const evolution = semJanela24h();
  const [conversas, aberta, conexao, pedidos, registroIA] = await Promise.all([
    listarConversas(120),
    sp.n ? obterConversa(sp.n) : Promise.resolve(null),
    evolution ? estadoConexao().catch(() => ({ estado: 'erro' as const, detalhe: 'sem resposta' })) : Promise.resolve(null),
    sp.n ? pedidosRecentes(365).catch(() => []) : Promise.resolve([]),
    lerRegistroIA(),
  ]);
  const ultimaIA = registroIA[0];
  const hojeIA = registroIA.filter((x) => diaChave(x.em) === diaChave(agora));

  // ----- situação do canal e da IA -----
  const canal = evolution
    ? {
        ok: conexao?.estado === 'open' ? true : conexao?.estado === 'connecting' ? ('aviso' as const) : false,
        valor: conexao?.estado === 'open' ? 'Conectado (QR Code)' : conexao?.estado === 'erro' ? 'Erro na Evolution' : 'Desconectado — ler o QR Code',
        ajuda: conexao?.detalhe,
      }
    : integracoes.whatsapp()
      ? { ok: true as const, valor: 'API oficial da Meta', ajuda: undefined }
      : { ok: false as const, valor: 'Não conectado', ajuda: undefined };
  const iaLigada = config.whatsapp.ia.ativa && iaDisponivel();
  const ia = iaLigada
    ? ultimaIA?.resultado === 'erro'
      ? { ok: false as const, valor: 'Com erro', ajuda: ultimaIA.detalhe }
      : { ok: true as const, valor: `Respondendo · ${hojeIA.filter((x) => x.resultado === 'respondeu').length} hoje`, ajuda: undefined }
    : iaDisponivel()
      ? { ok: 'aviso' as const, valor: 'Pronta, mas desligada', ajuda: 'Crie WHATSAPP_IA=true na Vercel e faça Redeploy.' }
      : { ok: false as const, valor: 'Sem chave da Anthropic', ajuda: 'Crie ANTHROPIC_API_KEY na Vercel.' };
  const ultimaRecebida = Math.max(0, ...conversas.map((c) => c.ultimaDoClienteEm || 0));
  const pendentes = conversas.filter((c) => esperando(c) && (comPessoa(c, agora) || !iaLigada)).length;

  // ----- lista -----
  const contagem = Object.fromEntries(FILTROS.map(([v]) => [v, conversas.filter((c) => passaFiltro(c, v, agora)).length]));
  const lista = conversas.filter((c) => {
    if (!passaFiltro(c, f, agora)) return false;
    if (!q) return true;
    const dig = q.replace(/\D/g, '');
    return (c.nome || '').toLowerCase().includes(q) || (dig.length >= 4 && c.numero.includes(dig)) || (ultimaDe(c)?.texto || '').toLowerCase().includes(q);
  });
  const link = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const atual: Record<string, string | undefined> = { f: f === 'todas' ? undefined : f, q: sp.q || undefined, n: sp.n, ...extra };
    for (const [k, v] of Object.entries(atual)) if (v) u.set(k, v);
    const s = u.toString();
    return `/painel/atendimento${s ? `?${s}` : ''}`;
  };

  // ----- conversa aberta -----
  const mensagens: Mensagem[] = aberta ? [...aberta.mensagens].sort((a, b) => a.em - b.em) : [];
  const podeResponder = aberta ? evolution || janelaAberta(aberta) : false;
  const chave = aberta ? chaveTelefone(aberta.numero) || aberta.numero : '';
  const pedidosDoCliente = aberta ? (pedidosPorTelefone(pedidos).get(chave) || []).sort((a, b) => b.criado - a.criado).slice(0, 4) : [];
  const AUTOR: Record<string, string> = { cliente: '', robo: iaLigada ? '🤖 IA' : '🤖 Robô', loja: 'Você', aviso: '🔔 Aviso automático' };

  return (
    <div className="space-y-3 md:-m-4 lg:-m-6">
      <AutoAtualizar />
      {/* Topo compacto numa linha só: título, situação (canal, IA, última mensagem) e atalhos */}
      <div className={`flex-wrap items-center gap-x-4 gap-y-2 ${aberta ? 'hidden md:flex' : 'flex'}`}>
        <h1 className="text-2xl">Atendimento</h1>
        {pendentes > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-sm font-semibold text-rose-700">{pendentes} esperando você</span>}
        <div className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 text-xs [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:px-0 sm:text-sm">
          <Pilula ok={canal.ok} texto={`WhatsApp: ${canal.valor}`} ajuda={canal.ajuda} />
          <Pilula ok={ia.ok} texto={`IA: ${ia.valor}`} ajuda={ia.ajuda} />
          <Pilula
            ok={ultimaRecebida ? true : 'aviso'}
            texto={`Última mensagem: ${ultimaRecebida ? quandoCurto(ultimaRecebida, agora) : 'nenhuma'}`}
            ajuda="Se o celular recebe mensagens e aqui não aparece nada, clique em Conexão → Configurar recebimento."
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-sm">
          <Link href="/atendimento/simulador" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">
            🧪 Testar a IA
          </Link>
          <Link href="/painel/crm" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">
            Contatos (CRM)
          </Link>
          <Link href="/painel/whatsapp" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">
            Conexão
          </Link>
        </div>
      </div>
      {sp.erro && <Aviso tipo="erro">{sp.erro}</Aviso>}
      {sp.ok && <Aviso tipo="ok">{sp.ok}</Aviso>}
      {iaLigada && ultimaIA?.resultado === 'erro' && (
        <Aviso tipo="erro">
          A última tentativa da IA deu erro ({quandoCurto(ultimaIA.em, agora)}): {ultimaIA.detalhe}. Enquanto isso, as mensagens vão para você.
        </Aviso>
      )}

      <div
        className={`wa wa-fundo grid overflow-hidden border wa-borda shadow-sm md:rounded-xl md:h-[calc(100dvh-6rem)] md:min-h-[560px] md:grid-cols-[minmax(280px,34%)_minmax(0,1fr)] lg:grid-cols-[minmax(300px,30%)_minmax(0,1fr)] 2xl:grid-cols-[minmax(340px,26%)_minmax(0,1fr)_300px] ${
          aberta ? '-mx-4 -mb-4 -mt-4 h-[calc(100dvh-4.4rem)] md:m-0' : 'rounded-xl h-[calc(100dvh-13rem)] min-h-[420px]'
        }`}
      >
        {/* ---------- Lista de conversas ---------- */}
        <div className={`min-h-0 min-w-0 flex-col border-r wa-borda ${aberta ? 'hidden md:flex' : 'flex'}`}>
          <div className="wa-barra flex h-[59px] shrink-0 items-center justify-between px-4">
            <span className="text-[19px] font-bold">Conversas</span>
            <span className="wa-suave text-xs">{conversas.length} no total</span>
          </div>
          <form className="px-3 pb-2 pt-2" action="/painel/atendimento">
            {f !== 'todas' && <input type="hidden" name="f" value={f} />}
            <div className="relative">
              <svg viewBox="0 0 24 24" className="wa-suave absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                name="q"
                defaultValue={sp.q || ''}
                placeholder="Pesquisar"
                className="wa-busca h-9 w-full rounded-lg border-0 pl-10 pr-3 text-sm focus:outline-none"
              />
            </div>
          </form>
          <div className="flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
            {FILTROS.map(([v, r]) => (
              <Link
                key={v}
                href={link({ f: v === 'todas' ? undefined : v })}
                aria-current={f === v ? 'true' : undefined}
                className="wa-chip shrink-0 rounded-full px-3 py-1 text-[13px]"
              >
                {r}
                {v !== 'todas' && contagem[v] > 0 && <span className="ml-1 opacity-80">{contagem[v]}</span>}
              </Link>
            ))}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {lista.map((c) => {
              const u = ultimaDe(c);
              const ativa = Boolean(aberta && chaveTelefone(aberta.numero) === chaveTelefone(c.numero));
              return (
                <li key={c.numero}>
                  <Link href={link({ n: c.numero })} aria-current={ativa ? 'true' : undefined} className="wa-item flex items-center gap-3 pl-3">
                    <span className={`grid h-[49px] w-[49px] shrink-0 place-items-center rounded-full text-lg font-semibold text-white ${corAvatar(c.numero)}`}>{inicial(c)}</span>
                    <span className="min-w-0 flex-1 border-b wa-borda py-3 pr-3">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[17px]">{nomeDe(c)}</span>
                        <span className={`shrink-0 text-xs ${c.naoLidas ? 'wa-verde font-medium' : 'wa-suave'}`}>{quandoCurto(c.atualizadaEm, agora)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="wa-suave truncate text-[15px]">
                          {u?.de === 'loja' ? 'Você: ' : u?.de === 'robo' ? '🤖 ' : u?.de === 'aviso' ? '🔔 ' : ''}
                          {u?.texto || ''}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Selo c={c} agora={agora} />
                          {c.naoLidas > 0 && <span className="wa-badge min-w-5 rounded-full px-1.5 text-center text-xs font-semibold leading-5">{c.naoLidas}</span>}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {lista.length === 0 && (
              <li className="wa-suave p-8 text-center text-sm">
                {conversas.length === 0 ? (
                  <>
                    Nenhuma conversa ainda.
                    <br />
                    Quando um cliente mandar mensagem para a loja, ela aparece aqui.
                  </>
                ) : (
                  'Nenhuma conversa com esse filtro.'
                )}
              </li>
            )}
          </ul>
        </div>

        {/* ---------- Chat ---------- */}
        <div className={`min-h-0 min-w-0 flex-col ${aberta ? 'flex' : 'hidden md:flex'}`}>
          {!aberta ? (
            <div className="wa-barra grid flex-1 place-items-center border-b-[6px] border-[#25d366] p-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-[#25d366]/15 text-4xl">💬</div>
                <p className="text-[28px] font-light">Samba Vest Atendimento</p>
                <p className="wa-suave mt-3 text-sm">Escolha uma conversa à esquerda. As respostas saem pelo WhatsApp da loja, como se você estivesse no celular.</p>
                <p className="wa-suave mt-6 text-xs">🔒 Só quem entra no painel vê estas conversas.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="wa-barra flex h-[59px] shrink-0 items-center gap-3 px-4">
                <Link href={link({ n: undefined })} className="wa-suave text-xl md:hidden" aria-label="Voltar para a lista">
                  ←
                </Link>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-semibold text-white ${corAvatar(aberta.numero)}`}>{inicial(aberta)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px]">{nomeDe(aberta)}</div>
                  <div className="wa-suave truncate text-[13px]">
                    {comPessoa(aberta, agora)
                      ? `com você até ${hora(aberta.humanoAte!)} · a IA não responde`
                      : iaLigada
                        ? 'a IA responde esta conversa'
                        : `+${aberta.numero}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {iaLigada &&
                    (comPessoa(aberta, agora) ? (
                      <form action={acaoAtendimento}>
                        <input type="hidden" name="numero" value={aberta.numero} />
                        <input type="hidden" name="acao" value="devolver" />
                        <button className="wa-chip rounded-full px-3 py-1.5 text-xs font-medium" aria-current="true" title="Devolver para a IA">
                          🤖<span className="hidden lg:inline"> Devolver para a IA</span>
                        </button>
                      </form>
                    ) : (
                      <form action={acaoAtendimento}>
                        <input type="hidden" name="numero" value={aberta.numero} />
                        <input type="hidden" name="acao" value="assumir" />
                        <button className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900" title="Assumir a conversa (a IA para de responder por 12 h)">
                          ✋<span className="hidden sm:inline"> Assumir</span>
                        </button>
                      </form>
                    ))}
                  {aberta.naoLidas > 0 && (
                    <form action={acaoAtendimento}>
                      <input type="hidden" name="numero" value={aberta.numero} />
                      <input type="hidden" name="acao" value="lida" />
                      <button className="wa-chip rounded-full px-3 py-1.5 text-xs" title="Marcar como lida">
                        ✓<span className="hidden lg:inline"> Lida</span>
                      </button>
                    </form>
                  )}
                  <a href={`https://wa.me/${aberta.numero}`} target="_blank" rel="noreferrer" className="wa-chip hidden rounded-full px-3 py-1.5 text-xs xl:inline-block">
                    Abrir no celular ↗
                  </a>
                </div>
              </div>

              <RolarParaFim chave={`${aberta.numero}:${mensagens.length}`} className="wa-papel min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-[4%] lg:px-[7%]">
                {mensagens.map((m, i) => {
                  const ant = mensagens[i - 1];
                  const novoDia = i === 0 || diaChave(m.em) !== diaChave(ant.em);
                  const cliente = m.de === 'cliente';
                  const lado = cliente ? 'entrada' : m.de === 'aviso' ? 'aviso' : 'saida';
                  const rabo = novoDia || !ant || (ant.de === 'cliente') !== cliente;
                  return (
                    <div key={m.id || i}>
                      {novoDia && (
                        <div className="my-3 text-center">
                          <span className="wa-dia inline-block rounded-lg px-3 py-1.5 text-[12.5px] uppercase">{rotuloDia(m.em, agora)}</span>
                        </div>
                      )}
                      <div className={`flex ${cliente ? 'justify-start' : 'justify-end'} ${rabo ? 'mt-3' : 'mt-0.5'}`}>
                        <div className={`wa-balao ${lado} ${rabo ? 'rabo' : ''} max-w-[88%] px-3 pb-1.5 pt-1.5 text-[15px] leading-[21px] lg:max-w-[65%]`}>
                          {!cliente && m.de !== 'loja' && <div className="wa-verde mb-0.5 text-[12.5px] font-medium">{AUTOR[m.de] || m.de}</div>}
                          <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</span>
                          <span className="wa-suave float-right ml-3 mt-1.5 translate-y-1 text-[11px] leading-none">
                            {hora(m.em)}
                            {!cliente && (
                              <span className={`ml-1 ${m.status === 'lida' ? 'text-[#53bdeb]' : ''}`} title={m.status || 'enviada'}>
                                {m.status === 'falhou' ? '⚠' : m.status === 'entregue' || m.status === 'lida' ? '✓✓' : '✓'}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </RolarParaFim>

              {podeResponder ? (
                <CaixaResposta numero={aberta.numero} acao={responderAtendimento} rapidas={RAPIDAS} />
              ) : (
                <p className="wa-barra wa-suave p-3 text-center text-xs">
                  Janela de 24h fechada: pela API oficial, só é possível mandar texto livre até 24h depois da última mensagem do cliente.
                </p>
              )}
            </>
          )}
        </div>

        {/* ---------- Dados do cliente ---------- */}
        {aberta && (
          <aside className="hidden min-h-0 flex-col overflow-y-auto border-l wa-borda 2xl:flex">
            <div className="wa-barra flex h-[59px] shrink-0 items-center px-5 text-[16px]">Dados do contato</div>
            <div className="border-b-[10px] wa-borda px-5 py-6 text-center">
              <span className={`mx-auto grid h-24 w-24 place-items-center rounded-full text-4xl font-semibold text-white ${corAvatar(aberta.numero)}`}>{inicial(aberta)}</span>
              <div className="mt-3 text-[20px]">{nomeDe(aberta)}</div>
              <div className="wa-suave text-[15px]">+{aberta.numero}</div>
              <div className="mt-3 flex justify-center gap-4 text-sm">
                <Link href={`/painel/crm/${chave}`} className="wa-verde hover:underline">
                  Ficha no CRM
                </Link>
                <a href={`https://wa.me/${aberta.numero}`} target="_blank" rel="noreferrer" className="wa-verde hover:underline">
                  WhatsApp ↗
                </a>
              </div>
            </div>
            <div className="px-5 py-4">
              <h3 className="wa-suave mb-3 text-sm">Pedidos deste telefone</h3>
              {pedidosDoCliente.length === 0 ? (
                <p className="wa-suave text-sm">Nenhum pedido com este telefone.</p>
              ) : (
                <ul className="space-y-2">
                  {pedidosDoCliente.map((p) => (
                    <li key={p.id}>
                      <Link href={`/painel/pedidos/${p.id}`} className="wa-item block rounded-lg border wa-borda p-2.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">#{p.id}</span>
                          <StatusPedido status={p.status} />
                        </div>
                        <div className="wa-suave mt-1 flex justify-between text-xs">
                          <span>{quandoCurto(p.criado, agora)}</span>
                          <span className="tabular-nums">{brl(p.total)}</span>
                        </div>
                        <div className="wa-suave mt-1 truncate text-xs">{p.itens.map((i) => `${i.qtd}× ${i.nome}`).join(' · ')}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
