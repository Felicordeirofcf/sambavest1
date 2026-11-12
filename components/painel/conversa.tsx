import { semJanela24h } from '../../lib/automacao/atendimento';
import { janelaAberta, type Conversa as TConversa } from '../../lib/automacao/conversas';
import { responderWhatsapp } from '../../app/painel/actions';
import { dataHora } from './ui';

export function Conversa({ conversa, voltar, limite = 15 }: { conversa: TConversa; voltar: string; limite?: number }) {
  const aberta = semJanela24h() || janelaAberta(conversa);
  const AUTOR: Record<string, string> = { cliente: 'Cliente', robo: 'Robô', loja: 'Loja', aviso: 'Aviso' };
  return (
    <div>
      <ul className={`space-y-2 overflow-y-auto mb-3 ${limite > 15 ? "max-h-[60vh]" : "max-h-80"}`}>
        {[...conversa.mensagens].sort((a, b) => a.em - b.em).slice(-limite).map((m, i) => (
          <li key={m.id || i} className={`text-sm rounded-lg p-2 max-w-[85%] ${m.de === 'cliente' ? 'bg-slate-100' : 'bg-emerald-50 ml-auto'}`}>
            <div className="text-[11px] text-slate-500">
              {AUTOR[m.de] || m.de} · {dataHora(m.em)}
            </div>
            <div className="whitespace-pre-wrap break-words">{m.texto}</div>
          </li>
        ))}
      </ul>
      {aberta ? (
        <form action={responderWhatsapp} className="flex gap-2">
          <input type="hidden" name="numero" value={conversa.numero} />
          <input type="hidden" name="voltar" value={voltar} />
          <input name="texto" required placeholder="Responder pelo WhatsApp" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <button className="text-sm px-3 py-2 rounded-lg bg-emerald-700 text-white">Enviar</button>
        </form>
      ) : (
        <p className="text-xs text-slate-500">
          Janela de 24h fechada: a Meta só permite texto livre até 24h depois da última mensagem do cliente. Use o app do WhatsApp ou um template.
        </p>
      )}
    </div>
  );
}
