import Link from 'next/link';
import { Aviso, Cartao } from '../../../components/painel/ui';
import { produtosBF } from '../../../lib/blackfriday';
import { exigirLogin } from '../../../lib/painel/auth';
import { escolherFotoVestida } from '../actions';

export const dynamic = 'force-dynamic';

export default async function FotosBlackPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await exigirLogin();
  const { ok, erro } = await searchParams;
  const produtos = await produtosBF();

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Fotos da Black</h1>
        <p className="mt-1 text-sm text-slate-500">
          Estas são todas as fotos das camisas da Black no WooCommerce (galeria e fotos de cada modelo). Clique em <b>&quot;Usar no topo&quot;</b> na
          foto de alguém <b>vestindo</b> a camisa: ela passa a aparecer no topo da{' '}
          <Link href="/black-friday" target="_blank" className="text-sky-800 underline">
            página da Black
          </Link>{' '}
          na hora.
        </p>
      </div>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {produtos
        .filter((p) => p.escola)
        .map((p) => (
          <Cartao
            key={p.id}
            titulo={p.titulo}
            acao={
              p.fotoVestida ? (
                <form action={escolherFotoVestida}>
                  <input type="hidden" name="oferta" value={p.id} />
                  <input type="hidden" name="url" value="" />
                  <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs">Voltar para a foto da camisa</button>
                </form>
              ) : (
                <span className="text-xs text-slate-500">no topo: foto da camisa</span>
              )
            }
          >
            {!p.encontrado ? (
              <p className="text-sm text-slate-400">Produto não encontrado no WooCommerce.</p>
            ) : !p.galeria?.length ? (
              <p className="text-sm text-slate-400">Este produto não tem fotos no WooCommerce.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {p.galeria.map((url) => {
                  const escolhida = p.fotoVestida === url;
                  return (
                    <li key={url} className={`overflow-hidden rounded-xl border bg-white ${escolhida ? 'border-emerald-500 ring-2 ring-emerald-400' : 'border-slate-200'}`}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/5] bg-slate-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </a>
                      <form action={escolherFotoVestida} className="p-2">
                        <input type="hidden" name="oferta" value={p.id} />
                        <input type="hidden" name="url" value={url} />
                        <button
                          disabled={escolhida}
                          className={`w-full rounded-lg px-2 py-1.5 text-xs font-semibold ${escolhida ? 'bg-emerald-50 text-emerald-800' : 'bg-[#0B1B34] text-white'}`}
                        >
                          {escolhida ? '● No topo' : 'Usar no topo'}
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        ))}

      <Cartao titulo="Dica">
        <p className="text-sm text-slate-600">
          Não achou foto vestida? Suba no WooCommerce (produto → &quot;Galeria do produto&quot; → adicionar imagem) e volte aqui: ela aparece nesta
          lista em até 2 minutos. Fotos verticais, com a pessoa de frente e a estampa visível, funcionam melhor.
        </p>
      </Cartao>
    </div>
  );
}
