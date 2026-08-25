const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5521996959903';
const WHATSAPP_DISPLAY = process.env.NEXT_PUBLIC_WHATSAPP_DISPLAY || '(21) 99695-9903';
const CONTACT_EMAIL = 'adm@sambavest.com';

export default function ContactPage() {
  return (
    <div className="w-full min-h-screen bg-white pb-20">
      {/* Banner Superior */}
      <div className="w-full bg-[#0B1B34] py-16 text-center border-b border-[#C9A227]/30">
        <h1 className="font-heading text-3xl md:text-4xl font-extrabold uppercase tracking-widest text-white">Contato</h1>
        <div className="w-12 h-0.5 bg-[#C9A227] mx-auto mt-4"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col md:flex-row gap-16">
        {/* Lado Esquerdo: Info de Contato */}
        <div className="w-full md:w-1/3 space-y-8">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#0B1B34] mb-4">Atendimento</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Segunda a Sexta: 09h às 18h<br />
              Sábado: 09h às 13h
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#0B1B34] mb-4">WhatsApp</h3>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}`} className="text-[#0B1B34] font-bold text-lg hover:text-[#C9A227] transition-colors">
              {WHATSAPP_DISPLAY}
            </a>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#0B1B34] mb-4">E-mail</h3>
            <p className="text-gray-500 text-sm">{CONTACT_EMAIL}</p>
          </div>

          <div className="pt-6 border-t border-gray-100">
             <h3 className="text-sm font-semibold uppercase tracking-widest text-[#0B1B34] mb-4">Siga-nos</h3>
             <div className="flex gap-4">
                <a href="https://www.instagram.com/sambavest/" target="_blank" rel="noopener noreferrer" className="text-xs uppercase tracking-widest text-gray-400 cursor-pointer hover:text-[#0B1B34] transition-colors">Instagram</a>
                <span className="text-xs uppercase tracking-widest text-gray-400 cursor-pointer hover:text-[#0B1B34] transition-colors">Facebook</span>
             </div>
          </div>
        </div>

        {/* Lado Direito: Formulário */}
        <div className="w-full md:w-2/3 bg-[#FAF7EF] p-8 md:p-12 rounded-sm">
          <h2 className="font-heading text-xl font-extrabold uppercase tracking-widest mb-8 text-[#0B1B34]">Envie uma mensagem</h2>
          
          {/* Formulário configurado com FormSubmit */}
          <form action={`https://formsubmit.co/${CONTACT_EMAIL}`} method="POST" className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Configurações ocultas do FormSubmit */}
            <input type="hidden" name="_subject" value="Novo contato recebido pelo site SambaVest!" />
            <input type="hidden" name="_captcha" value="false" />
            <input type="hidden" name="_template" value="table" />
            
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase font-semibold text-gray-500">Nome</label>
              <input type="text" name="Nome" required className="border border-gray-300 p-3 text-sm focus:outline-none focus:border-[#C9A227] bg-white" />
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase font-semibold text-gray-500">E-mail</label>
              <input type="email" name="Email" required className="border border-gray-300 p-3 text-sm focus:outline-none focus:border-[#C9A227] bg-white" />
            </div>
            
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-xs uppercase font-semibold text-gray-500">Assunto</label>
              <input type="text" name="Assunto" required className="border border-gray-300 p-3 text-sm focus:outline-none focus:border-[#C9A227] bg-white" />
            </div>
            
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-xs uppercase font-semibold text-gray-500">Mensagem</label>
              <textarea name="Mensagem" rows={5} required className="border border-gray-300 p-3 text-sm focus:outline-none focus:border-[#C9A227] bg-white"></textarea>
            </div>
            
            <button type="submit" className="md:w-max px-12 py-4 bg-[#0B1B34] text-white uppercase tracking-widest text-xs font-bold hover:bg-[#C9A227] hover:text-[#0B1B34] transition-colors cursor-pointer">
              Enviar Mensagem
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}