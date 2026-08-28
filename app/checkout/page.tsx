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
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('appmax_pix');
  const [isBuscandoCep, setIsBuscandoCep] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Força a atualização da store do Zustand caso use persistência local
    if (typeof window !== 'undefined') {
      useCartStore.persist.rehydrate();
    }
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

  // 🚀 BUSCA DE CEP AUTOMÁTICA (VIACEP)
  const handleBuscarCep = async (cepBuscado: string) => {
    const cepLimpo = cepBuscado.replace(/\D/g, '');
    
    if (cepLimpo.length !== 8) return;

    setIsBuscandoCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();

      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          endereco: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          uf: data.uf || ''
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    } finally {
      setIsBuscandoCep(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    // Dispara a busca automática assim que digitar 8 números no CEP
    if (name === 'cep') {
      const cepLimpo = value.replace(/\D/g, '');
      if (cepLimpo.length === 8) {
        handleBuscarCep(cepLimpo);
      }
    }
  };

  // Garante a captura dos itens direto da store ou do localStorage de segurança
  const getActiveItems = () => {
    if (items && items.length > 0) return items;
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('cart-storage');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.state?.items && parsed.state.items.length > 0) {
            return parsed.state.items;
          }
        }
      } catch (e) {
        console.error("Erro ao ler carrinho do storage", e);
      }
    }
    return items;
  };

  const activeItems = getActiveItems();
  
  const subtotal = activeItems.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
  
  // 💰 Cálculo Dinâmico do Desconto Pix (10% OFF se a opção selecionada for Pix)
  const isPixSelected = paymentMethod === 'appmax_pix';
  const descontoPix = isPixSelected ? subtotal * 0.10 : 0;
  const subtotalComDesconto = subtotal - descontoPix;

  const frete = shippingQuote ? shippingQuote.price : 0;
  const total = subtotalComDesconto + frete;

  const handleFinalizarPedido = async () => {
    const carrinhoAtual = getActiveItems();

    if (!carrinhoAtual || carrinhoAtual.length === 0) {
      alert('Seu carrinho está vazio! Adicione um produto antes de finalizar.');
      return;
    }

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

      const quoteAny = shippingQuote as any;
      const shippingMethodTitle = quoteAny.name || quoteAny.service || quoteAny.serviceName || 'Frete Correios / Transportadora';

      const payload = {
        paymentMethod: paymentMethod,
        items: carrinhoAtual.map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
          price: isPixSelected ? Number((item.price * 0.90).toFixed(2)) : item.price,
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

      console.log("🔗 URL de pagamento gerada:", data.paymentUrl);

      if (data.paymentUrl) {
        clearCart();
        // Redirecionamento forçado para a página de pagamento gerada
        setTimeout(() => {
          window.location.assign(data.paymentUrl);
        }, 150);
      } else {
        throw new Error('A API não retornou uma URL de pagamento válida.');
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Nome Completo *</label>
                  <input type="text" name="nome" value={formData.nome} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">E-mail *</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Telefone / WhatsApp *</label>
                  <input type="text" name="telefone" value={formData.telefone} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">CPF ou CNPJ (Somente números) *</label>
                  <input type="text" name="numeroDocumento" value={formData.numeroDocumento} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    CEP * {isBuscandoCep && <span className="text-[#C9A227] lowercase normal-case text-[10px] ml-2 animate-pulse">(buscando...)</span>}
                  </label>
                  <input 
                    type="text" 
                    name="cep" 
                    value={formData.cep} 
                    onChange={handleInputChange} 
                    required 
                    maxLength={9}
                    className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Estado (UF)</label>
                  <input type="text" name="uf" value={formData.uf} onChange={handleInputChange} className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Endereço (Rua, Avenida...) *</label>
                  <input type="text" name="endereco" value={formData.endereco} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Número *</label>
                  <input type="text" name="numero" value={formData.numero} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Bairro *</label>
                  <input type="text" name="bairro" value={formData.bairro} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">Cidade *</label>
                  <input type="text" name="cidade" value={formData.cidade} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>
              </div>
            </div>

            {/* 💳 3. SELEÇÃO DE FORMA DE PAGAMENTO (PIX OU CARTÃO) */}
            <div className="bg-white p-6 shadow-sm rounded-sm">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6 pb-2 border-b text-[#0B1B34]">3. Forma de Pagamento</h3>
              
              <div className="space-y-4">
                <label className={`flex items-center gap-3 p-4 border rounded cursor-pointer transition-all ${paymentMethod === 'appmax_pix' ? 'border-[#0B1B34] bg-[#0B1B34]/5' : 'border-gray-200'}`}>
                  <input 
                    type="radio" 
                    name="paymentMethod" 
                    value="appmax_pix" 
                    checked={paymentMethod === 'appmax_pix'} 
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="accent-[#0B1B34]" 
                  />
                  <div>
                    <span className="block text-sm font-bold text-[#0B1B34]">Pix <span className="text-xs text-emerald-600 font-bold ml-1">(10% de Desconto)</span></span>
                    <span className="text-xs text-gray-500">Aprova na hora e gera o QR Code / Copia e Cola.</span>
                  </div>
                </label>

                <label className={`flex items-center gap-3 p-4 border rounded cursor-pointer transition-all ${paymentMethod === 'appmax_credit' ? 'border-[#0B1B34] bg-[#0B1B34]/5' : 'border-gray-200'}`}>
                  <input 
                    type="radio" 
                    name="paymentMethod" 
                    value="appmax_credit" 
                    checked={paymentMethod === 'appmax_credit'} 
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="accent-[#0B1B34]" 
                  />
                  <div>
                    <span className="block text-sm font-bold text-[#0B1B34]">Cartão de Crédito</span>
                    <span className="text-xs text-gray-500">Parcele suas compras de forma segura.</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-white p-6 shadow-sm rounded-sm">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6 pb-2 border-b text-[#0B1B34]">2. Seus Produtos</h3>
              {activeItems.length === 0 ? (
                <p className="text-xs text-gray-500 py-4">Seu carrinho está vazio.</p>
              ) : (
                activeItems.map((item: any) => (
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
                      <p className="text-sm font-bold text-[#1E2233]">
                        R$ {(isPixSelected ? item.price * 0.90 : item.price).toFixed(2).replace('.', ',')}
                        {isPixSelected && <span className="text-[10px] text-emerald-600 ml-1 font-normal">(pix)</span>}
                      </p>
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

                {isPixSelected && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Desconto Pix (10%)</span>
                    <span>- R$ {descontoPix.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}

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
                <ShippingCalculator subtotal={subtotalComDesconto} onQuote={setShippingQuote} />
              </div>

              <div className="bg-[#0B1B34]/5 p-4 mb-6 text-[11px] text-[#0B1B34] leading-relaxed uppercase tracking-wider">
                Ao finalizar, o seu pedido será gerado e você será redirecionado para o pagamento seguro.
              </div>

              <button
                onClick={handleFinalizarPedido}
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