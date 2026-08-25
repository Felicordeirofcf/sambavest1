import Link from 'next/link';

export default function TrocasDevolucoesPage() {
  return (
    <div className="w-full min-h-screen bg-white pb-20">
      {/* Banner Superior */}
      <div className="w-full bg-[#0B1B34] py-16 text-center border-b border-[#C9A227]/30">
        <h1 className="font-heading text-2xl md:text-4xl font-extrabold uppercase tracking-widest text-white px-4">
          Trocas e Devoluções
        </h1>
        <div className="w-12 h-0.5 bg-[#C9A227] mx-auto mt-4"></div>
      </div>

      {/* Breadcrumbs */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <nav className="text-xs text-gray-500 uppercase tracking-wide">
          <Link href="/" className="hover:text-[#0B1B34] transition-colors">Início</Link>
          <span className="mx-2">/</span>
          <span className="text-[#1E2233] font-semibold">Trocas e Devoluções</span>
        </nav>
      </div>

      {/* Conteúdo da Política */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 text-gray-700 font-light leading-relaxed">
        
        <section>
          <p className="text-lg mb-4">
            A <strong>SambaVest</strong> deseja que sua experiência de compra seja perfeita e que você vista nossa camisa com o maior orgulho. Caso precise trocar ou devolver algum produto, criamos uma política clara, baseada no Código de Defesa do Consumidor.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-bold uppercase tracking-widest text-[#0B1B34] mb-4">
            1. Troca por Tamanho ou Arrependimento
          </h2>
          <p className="mb-4">
            Se a camisa não serviu ou se você simplesmente se arrependeu da compra, você tem o prazo de <strong>até 7 (sete) dias corridos</strong>, contados a partir da data de recebimento do pedido, para solicitar a troca ou devolução.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>O custo do frete da primeira troca por tamanho é dividido: você paga para enviar a peça de volta, e nós pagamos o frete para enviar a nova peça até você.</li>
            <li>No caso de devolução por arrependimento, o valor estornado será referente aos produtos adquiridos.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-xl font-bold uppercase tracking-widest text-[#0B1B34] mb-4">
            2. Troca por Defeito de Fabricação
          </h2>
          <p className="mb-4">
            Nossos produtos passam por um rigoroso controle de qualidade, mas caso alguma peça chegue com defeito, você tem <strong>até 30 (trinta) dias corridos</strong> após o recebimento para nos comunicar.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Neste caso específico, todos os custos de frete (ida e volta) ficam por conta da SambaVest.</li>
            <li>O produto será analisado pela nossa equipe de qualidade. Caso seja constatado mau uso, a troca não será autorizada e a peça será devolvida ao cliente.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-xl font-bold uppercase tracking-widest text-[#0B1B34] mb-4">
            3. Condições para Troca ou Devolução
          </h2>
          <p className="mb-4">Para que a troca ou devolução seja aceita, o produto deve atender obrigatoriamente às seguintes condições:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>A peça deve estar com todas as etiquetas originais afixadas.</li>
            <li>Não pode apresentar indícios de uso, manchas, suor ou odores (como perfume).</li>
            <li>Não pode ter sido lavada ou alterada pelo cliente (ajustes, bainhas, etc).</li>
          </ul>
          <p className="mt-4 font-medium text-[#c0392b]">
            Atenção: Peças que não atenderem às condições acima serão devolvidas ao comprador e a troca/devolução será recusada.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-bold uppercase tracking-widest text-[#0B1B34] mb-4">
            4. Como Solicitar
          </h2>
          <p className="mb-4">
            Para iniciar o processo, envie um e-mail para <strong>adm@sambavest.com</strong> ou entre em contato pelo nosso <strong>WhatsApp</strong> informando:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Número do pedido.</li>
            <li>Nome completo e CPF de quem fez a compra.</li>
            <li>Motivo da troca ou devolução (se for defeito, favor anexar fotos claras).</li>
          </ul>
          <p className="mt-4">
            Nossa equipe responderá em até 2 dias úteis com todas as instruções e o código de postagem (quando aplicável).
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-bold uppercase tracking-widest text-[#0B1B34] mb-4">
            5. Prazos de Reembolso
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Cartão de Crédito:</strong> O estorno poderá ocorrer em até 2 (duas) faturas subsequentes, dependendo da data de fechamento do seu cartão e da administradora.</li>
            <li><strong>PIX ou Boleto:</strong> O reembolso será realizado na conta bancária do titular do pedido em até 7 dias úteis após a aprovação da devolução em nosso centro de distribuição.</li>
          </ul>
        </section>

        <div className="pt-8 border-t border-gray-100 flex justify-center">
          <Link
            href="/contato"
            className="px-8 py-4 bg-[#0B1B34] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#C9A227] hover:text-[#0B1B34] transition-colors rounded-sm text-center"
          >
            Falar com o Atendimento
          </Link>
        </div>

      </div>
    </div>
  );
}