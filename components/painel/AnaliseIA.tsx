// Cartão "Análise da IA" no painel de anúncios: resumo, sugestões com Fiz/Ignorar e o que vigiar.
import type { AnaliseSalva, Decisao } from '../../lib/automacao/agenteAnuncios';
import { decidirSugestaoAnuncio, gerarAnaliseAnuncios } from '../../app/painel/actions';
import { BotaoEnviando } from './BotaoEnviando';
import { dataHora } from './ui';

const SITUACAO = {
  bom: { rotulo: 'Indo bem', cor: 'bg-emerald-50 text-emerald-800 ring-emerald-200', ponto: 'bg-emerald-500' },
  atencao: { rotulo: 'Pede atenção', cor: 'bg-amber-50 text-amber-900 ring-amber-200', ponto: 'bg-amber-500' },
  ruim: { rotulo: 'Precisa agir', cor: 'bg-red-50 text-red-800 ring-red-200', ponto: 'bg-red-500' },
} as const;

const TIPO: Record<string, string> = {
  pausar: '⏸ Pausar',
  escalar: '📈 Escalar',
  reduzir: '📉 Reduzir',
  trocar_arte: '🎨 Trocar arte',
  ajustar_publico: '🎯 Público',
  ajustar_site: '🛒 Site',
  manter: '✅ Manter',
  outro: '💡 Ideia',
};
const NIVEL: Record<string, string> = { alto: 'impacto alto', medio: 'impacto médio', baixo: 'impacto baixo' };
const CONFIANCA: Record<string, string> = { alta: 'confiança alta', media: 'confiança média', baixa: 'poucos dados ainda' };

export function AnaliseIA({
  analise,
  decisoes,
  disponivel,
  erro,
}: {
  analise: AnaliseSalva | null;
  decisoes: Record<string, Decisao>;
  disponivel: boolean;
  erro?: string;
}) {
  const a = analise?.analise;
  const pendentes = a ? a.sugestoes.filter((s) => !decisoes[s.id]) : [];
  const decididas = a ? a.sugestoes.filter((s) => decisoes[s.id]) : [];
  return (
    <section id="analise-ia" className="scroll-mt-6 rounded-2xl border border-violet-200 bg-white p-4 shadow-sm ring-1 ring-violet-200 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <span aria-hidden>🤖</span> Análise da IA
          </h2>
          <p className="text-xs text-slate-500">
            {analise
              ? `Feita ${dataHora(analise.em)} · roda sozinha a cada 8 h (8h–22h) · a IA só sugere, quem decide é você`
              : 'A IA lê os números da Meta e do site e sugere o que fazer. Ela só sugere: quem decide é você.'}
          </p>
        </div>
        {disponivel ? (
          <form action={gerarAnaliseAnuncios}>
            <BotaoEnviando
              texto="Analisar agora"
              enviando="Analisando… (até 1 min)"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            />
          </form>
        ) : (
          <span className="text-xs text-slate-500">Precisa da ANTHROPIC_API_KEY na Vercel.</span>
        )}
      </div>

      {erro && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">Não consegui analisar agora: {erro}</p>}

      {a && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${SITUACAO[a.situacao].cor}`}>
              <span className={`h-2 w-2 rounded-full ${SITUACAO[a.situacao].ponto}`} aria-hidden />
              {SITUACAO[a.situacao].rotulo}
            </span>
            <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-slate-800">{a.resumo}</p>
          </div>

          {a.destaques.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {a.destaques.map((d, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {d}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3">
            {pendentes.map((s, i) => (
              <article key={s.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-violet-600 font-bold text-white">{i + 1}</span>
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-800">{TIPO[s.tipo] || s.tipo}</span>
                  {s.anuncio && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{s.anuncio}</span>}
                  <span className="text-slate-500">
                    {NIVEL[s.impacto]} · {CONFIANCA[s.confianca]}
                  </span>
                </div>
                <h3 className="mt-2 font-semibold text-slate-900">{s.titulo}</h3>
                <p className="mt-1 text-sm text-slate-700">
                  <b>Por quê:</b> {s.porque}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                  <b>Como fazer:</b> {s.como}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={decidirSugestaoAnuncio}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="acao" value="fiz" />
                    <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">✓ Fiz</button>
                  </form>
                  <form action={decidirSugestaoAnuncio}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="acao" value="ignorar" />
                    <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Ignorar</button>
                  </form>
                </div>
              </article>
            ))}
            {pendentes.length === 0 && <p className="text-sm text-slate-600">Nenhuma sugestão pendente. 👍</p>}
          </div>

          {decididas.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500">Já decididas ({decididas.length})</summary>
              <ul className="mt-2 space-y-1">
                {decididas.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 text-slate-600">
                    <span>{decisoes[s.id].acao === 'fiz' ? '✓ Feito' : '— Ignorado'}:</span>
                    <span>{s.titulo}</span>
                    <form action={decidirSugestaoAnuncio}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="acao" value="desfazer" />
                      <button className="text-xs underline">desfazer</button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {a.vigiar.length > 0 && (
            <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
              <b>De olho nas próximas 24 h:</b>
              <ul className="mt-1 list-disc pl-5">
                {a.vigiar.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            {analise!.modelo} · {analise!.tokens.entrada.toLocaleString('pt-BR')} + {analise!.tokens.saida.toLocaleString('pt-BR')} tokens
          </p>
        </div>
      )}
    </section>
  );
}
