'use client';

import { useState, useEffect } from 'react';
import { useCartStore } from '../../store/cartStore';
import ShippingCalculator from '../../components/product/ShippingCalculator';
import type { ShippingQuote } from '../../lib/shipping';
import Link from 'next/link';

export default function CheckoutPage() {
  const { items, removeItem, clearCart } = useCartStore();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingClient, setIsSearchingClient] = useState(false);
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    numeroDocumento: '',
    endereco: '',
    numero: '',
    bairro: '',
    cidade: '',
    cep: '',
    uf: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Função para buscar cliente cadastrado no Bling/Base pelo CPF
  const handleBuscarCliente = async () => {
    const docLimpo = formData.numeroDocumento.replace(/\D/g, '');
    if (!docLimpo || docLimpo.length < 11) {
      alert('Por favor, digite um CPF válido com pelo menos 11 dígitos para buscar.');
      return;
    }

    setIsSearchingClient(true);
    try {
      const res = await fetch(`/api/cliente?cpf=${docLimpo}`);
      const data = await res.json();

      if (data.success && data.cliente) {
        setFormData(data.cliente);
        alert('✅ Dados encontrados e preenchidos com sucesso!');
      } else {
        alert('ℹ️ Nenhum cadastro anterior encontrado com este CPF. Preencha os campos normalmente.');
      }
    } catch (error) {
      console.error(error);
      alert('❌ Erro ao buscar cliente.');
    } finally {
      setIsSearchingClient(false);
    }
  };

  const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const frete = shippingQuote ? shippingQuote.price : 0;
  const total = subtotal + frete;

  const handleFinalizarPedidoBling = async () => {
    let carrinhoAtual = items;
    if (!carrinhoAtual || carrinhoAtual.length === 0) {
      carrinhoAtual = useCartStore.getState().items;
    }

    if (!carrinhoAtual || carrinhoAtual.length === 0) {
      alert('Seu carrinho está vazio! Adicione um produto antes de finalizar.');
      return;
    }

    // 🛑 VALIDAÇÃO OBRIGATÓRIA DE FRETE
    if (!shippingQuote) {
      alert('⚠️ Por favor, calcule o frete informando o seu CEP antes de finalizar o pedido.');
      return;
    }

    if (
      !formData.nome || 
      !formData.numeroDocumento || 
      !formData.email || 
      !formData.cep || 
      !formData.endereco || 
      !formData.numero || 
      !formData.bairro || 
      !formData.cidade
    ) {
      alert('Por favor, preencha todos os campos obrigatórios de identificação e endereço completo.');
      return;
    }

    setIsLoading(true);

    try {
      const partesNome = formData.nome.trim().split(' ');
      const firstName = partesNome[0] || '';
      const lastName = partesNome.slice(1).join(' ') || 'Cliente';

      // Captura segura do nome do serviço de frete para evitar erros no TypeScript
      const quoteAny = shippingQuote as any;
      const shippingMethodTitle = quoteAny.name || quoteAny.service || quoteAny.serviceName || 'Frete Correios / Transportadora';

      const payload = {
        items: carrinhoAtual.map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
          price: item.price,
        })),
        cliente: {
          nome: formData.nome,
          first_name: firstName,
          last_name: lastName,
          email: formData.email,
          telefone: formData.telefone,
          numeroDocumento: formData.numeroDocumento,
          endereco: formData.endereco,
          numero: formData.numero,
          bairro: formData.bairro,
          cidade: formData.cidade,
          cep: formData.cep,
          uf: formData.uf || 'RJ',
        },
        shipping: {
          method_title: shippingMethodTitle,
          price: shippingQuote.price,
        }
      };

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao registrar pedido.');
      }

      alert('✅ Pedido gerado com sucesso! Redirecionando para o pagamento...');
      clearCart();

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        window.location.href = '/';
      }

    } catch (error: any) {
      console.error(error);
      alert(`❌ Erro ao finalizar: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm uppercase tracking-widest text-gray-500">Carregando checkout...</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#FAF7EF] pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="font-heading text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-10 text-center md:text-left">
          Finalizar Pedido
        </h1>

        <div className="flex flex-col lg:flex-row gap-10">
          <div className="flex-1 space-y-6">
            
            <div className="bg-white p-6 shadow-sm rounded-sm">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6 pb-2 border-b text-[#0B1B34]">1. Seus Dados e Endereço</h3>
              
              <div className="mb-6 bg-[#0B1B34]/5 p-4 rounded-sm border border-[#0B1B34]/10">
                <label className="block text-xs font-bold uppercase text-[#0B1B34] mb-2">Já comprou conosco antes? Digite seu CPF:</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    name="numeroDocumento" 
                    value={formData.numeroDocumento} 
                    onChange={handleInputChange} 
                    className="flex-1 border p-2 text-sm rounded bg-white" 
                    placeholder="Somente números" 
                  />
                  <button 
                    type="button" 
                    onClick={handleBuscarCliente}
                    disabled={isSearchingClient}
                    className="px-4 py-2 bg-[#0B1B34] text-white text-xs font-bold uppercase tracking-wider rounded hover:bg-[#C9A227] hover:text-[#0B1B34] transition-colors disabled:bg-gray-400"
                  >
                    {isSearchingClient ? 'Buscando...' : 'Buscar Dados'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Nome Completo *</label>
                  <input type="text" name="nome" value={formData.nome} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="Ex: Amanda Pontes" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">E-mail *</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="amanda@gmail.com" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Telefone / WhatsApp *</label>
                  <input type="text" name="telefone" value={formData.telefone} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="(21) 99695-9903" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">CPF ou CNPJ (Somente números) *</label>
                  <input type="text" name="numeroDocumento" value={formData.numeroDocumento} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="12345678909" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">CEP *</label>
                  <input type="text" name="cep" value={formData.cep} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="22723002" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Estado (UF)</label>
                  <input type="text" name="uf" value={formData.uf} onChange={handleInputChange} className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="RJ" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Endereço (Rua, Avenida...) *</label>
                  <input type="text" name="endereco" value={formData.endereco} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="Estrada do Rio Grande" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Número *</label>
                  <input type="text" name="numero" value={formData.numero} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="40804" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Bairro *</label>
                  <input type="text" name="bairro" value={formData.bairro} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="Taquara" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Cidade *</label>
                  <input type="text" name="cidade" value={formData.cidade} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50" placeholder="Rio de Janeiro" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 shadow-sm rounded-sm">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6 pb-2 border-b text-[#0B1B34]">2. Seus Produtos</h3>
              {items.length === 0 ? (
                <p className="text-xs text-gray-500 py-4">Seu carrinho está vazio.</p>
              ) : (
                items.map((item) => (
                  <div key={`${item.id}-${item.size}`} className="flex gap-4 py-4 border-b last:border-0">
                    <img src={item.image} alt={item.name} className="w-20 h-24 object-contain bg-[#FAF7EF] p-1" />
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between">
                          <h4 className="text-sm font-medium uppercase text-[#1E2233]">{item.name}</h4>
                          <button onClick={() => removeItem(item.id, item.size)} className="text-xs text-gray-400 hover:text-red-500">Remover</button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Tamanho: {item.size}</p>
                        <p className="text-xs text-gray-500 italic">Qtd: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-bold text-[#1E2233]">R$ {item.price.toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="w-full lg:w-[400px] space-y-6">
            <div className="bg-white p-6 shadow-sm rounded-sm sticky top-24">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6 pb-2 border-b text-[#0B1B34]">Resumo do Pedido</h3>

              <div className="space-y-4 text-sm mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Frete</span>
                  <span>
                    {shippingQuote
                      ? frete === 0
                        ? 'GRÁTIS'
                        : `R$ ${frete.toFixed(2).replace('.', ',')}`
                      : 'Obrigatório calcular'}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold text-[#1E2233] pt-4 border-t">
                  <span>Total</span>
                  <span>R$ {total.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>

              <div className="mb-6">
                <ShippingCalculator subtotal={subtotal} onQuote={setShippingQuote} />
              </div>

              <div className="bg-[#0B1B34]/5 p-4 mb-6 text-[11px] text-[#0B1B34] leading-relaxed uppercase tracking-wider">
                Ao finalizar, o seu pedido será gerado e você será redirecionado para o pagamento seguro.
              </div>

              <button
                onClick={handleFinalizarPedidoBling}
                disabled={isLoading}
                className="w-full py-5 bg-[#C9A227] text-[#0B1B34] font-bold uppercase tracking-widest text-sm hover:bg-[#0B1B34] hover:text-white transition-colors shadow-lg flex justify-center items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  'Ir para o Pagamento'
                )}
              </button>

              <Link href="/" className="block text-center mt-6 text-xs text-gray-400 uppercase tracking-widest hover:text-[#0B1B34] underline">
                Continuar Comprando
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}