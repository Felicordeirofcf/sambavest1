'use client';

import { useState, useEffect } from 'react';
import { useCartStore } from '../../store/cartStore';
import ShippingCalculator from '../../components/product/ShippingCalculator';
import { FREE_SHIPPING_THRESHOLD, type ShippingQuote } from '../../lib/shipping';
import Link from 'next/link';
import Image from 'next/image';
import { podeOtimizar } from '../../lib/imagem';
import { descontoPixAtual } from '../../lib/pix';
import { marcarEtapa, origemAtual } from '../../components/analytics/Etapa';

/** ID único da compra para o Meta Ads (gravado no pedido e usado na API de Conversões). */
function novoEventId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CheckoutPage() {
  const { items, removeItem, clearCart } = useCartStore();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('appmax_pix');
  const [isBuscandoCep, setIsBuscandoCep] = useState(false);

  const [avisoPrecos, setAvisoPrecos] = useState('');

  useEffect(() => {
    setIsMounted(true);
    marcarEtapa('checkout');
    // Força a atualização da store do Zustand caso use persistência local
    if (typeof window !== 'undefined') {
      useCartStore.persist.rehydrate();
    }
  }, []);

  // Link do e-mail de carrinho abandonado (?recuperar=...): remonta a sacola se ela estiver vazia
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('recuperar');
    if (!id) return;
    fetch(`/api/carrinho-abandonado?recuperar=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; itens?: { id: number; nome: string; qtd: number; preco: number; imagem?: string; tamanho?: string }[] }) => {
        const loja = useCartStore.getState();
        if (!d?.ok || !d.itens?.length || loja.items.length > 0) return;
        for (const i of d.itens) {
          loja.addItem({ id: i.id, name: i.nome, price: i.preco, image: i.imagem || '', size: i.tamanho || '', quantity: i.qtd });
        }
      })
      .catch(() => {})
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('recuperar');
        window.history.replaceState(null, '', url.toString());
      });
  }, []);

  // Link da IA do WhatsApp (?sacola=...): troca o conteúdo da sacola pelos itens combinados na conversa
  const [sacolaPronta, setSacolaPronta] = useState(0);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('sacola');
    if (!id) return;
    fetch(`/api/sacola?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; itens?: { id: number; nome: string; qtd: number; preco: number; imagem?: string; tamanho?: string }[] }) => {
        if (!d?.ok || !d.itens?.length) return;
        const loja = useCartStore.getState();
        loja.clearCart();
        for (const i of d.itens) {
          loja.addItem({ id: i.id, name: i.nome, price: i.preco, image: i.imagem || '', size: i.tamanho || '', quantity: i.qtd });
        }
        setSacolaPronta((n) => n + 1); // reconfere os preços com os itens novos
      })
      .catch(() => {})
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('sacola');
        window.history.replaceState(null, '', url.toString());
      });
  }, []);

  // A sacola guarda o preço de quando o item foi adicionado. Antes de mostrar o total,
  // busca o preço atual (promoção que começou ou acabou) e avisa se algo mudou ou esgotou.
  useEffect(() => {
    if (!isMounted) return;
    const atuais = useCartStore.getState().items;
    if (atuais.length === 0) return;
    let cancelado = false;
    fetch('/api/carrinho', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: atuais.map((i) => i.id) }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelado || !data?.success) return;
        const precos: Record<string, number> = {};
        const mudou: string[] = [];
        const esgotados: string[] = [];
        for (const item of atuais) {
          const info = data.itens?.[String(item.id)];
          if (!info) continue;
          if (!info.disponivel) esgotados.push(item.name);
          else if (Math.abs(info.preco - item.price) > 0.009) {
            precos[String(item.id)] = info.preco;
            mudou.push(item.name);
          }
        }
        if (Object.keys(precos).length) useCartStore.getState().atualizarPrecos(precos);
        const partes = [];
        if (mudou.length) partes.push(`O preço de ${mudou.join(', ')} foi atualizado.`);
        if (esgotados.length) partes.push(`${esgotados.join(', ')} não está mais disponível: remova da sacola para continuar.`);
        setAvisoPrecos(partes.join(' '));
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [isMounted, sacolaPronta]);

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    numeroDocumento: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    cep: '',
    uf: '',
  });

  // Máscaras simples para o celular (o cliente digita só números)
  const soNumeros = (v: string) => v.replace(/\D/g, '');
  const mascaras: Record<string, (v: string) => string> = {
    cep: (v) => {
      const d = soNumeros(v).slice(0, 8);
      return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    },
    telefone: (v) => {
      const d = soNumeros(v).slice(0, 11);
      if (d.length <= 2) return d.length ? `(${d}` : '';
      if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    },
    numeroDocumento: (v) => soNumeros(v).slice(0, 14),
    uf: (v) => v.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase(),
  };

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
        // Endereço preenchido: leva o cliente direto para o campo "Número"
        if (data.logradouro) {
          setTimeout(() => (document.querySelector('input[name="numero"]') as HTMLInputElement | null)?.focus(), 50);
        }
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    } finally {
      setIsBuscandoCep(false);
    }
  };

  // Carrinho abandonado: ao sair do campo de e-mail/nome/telefone, guarda a sacola para o lembrete
  const salvarSacola = () => {
    const email = formData.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
    const itens = getActiveItems();
    if (!itens?.length) return;
    fetch('/api/carrinho-abandonado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        email,
        nome: formData.nome,
        telefone: formData.telefone,
        origem: origemAtual()?.source,
        itens: itens.map((i: { id: number; name: string; quantity: number; price: number; image?: string; size?: string }) => ({
          id: i.id,
          nome: i.name,
          qtd: i.quantity,
          preco: i.price,
          imagem: i.image,
          tamanho: i.size,
        })),
      }),
    }).catch(() => {});
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target;
    const value = mascaras[name] ? mascaras[name](e.target.value) : e.target.value;
    setFormData((prev) => ({ ...prev, [name]: value }));

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
        const stored = localStorage.getItem('samba-vest-cart');
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
  const pctPix = descontoPixAtual();
  const descontoPix = isPixSelected ? subtotal * pctPix : 0;
  const subtotalComDesconto = subtotal - descontoPix;

  // O frete grátis depende do subtotal atual (ex.: trocar Pix por cartão muda o subtotal),
  // então recalcula aqui com a mesma regra do servidor.
  const freteGratisAgora = Boolean(
    shippingQuote &&
      shippingQuote.maisBarato &&
      subtotalComDesconto >= FREE_SHIPPING_THRESHOLD
  );
  const frete = shippingQuote ? (freteGratisAgora ? 0 : shippingQuote.originalPrice ?? shippingQuote.price) : 0;
  const total = subtotalComDesconto + frete;

  const handleFinalizarPedido = async () => {
    const carrinhoAtual = getActiveItems();

    if (!carrinhoAtual || carrinhoAtual.length === 0) {
      alert('Seu carrinho está vazio! Adicione um produto antes de finalizar.');
      return;
    }

    const docLimpo = soNumeros(formData.numeroDocumento);
    const telLimpo = soNumeros(formData.telefone);
    const cepLimpo = soNumeros(formData.cep);
    const faltando: string[] = [];
    if (formData.nome.trim().split(/\s+/).length < 2) faltando.push('Nome completo (nome e sobrenome)');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) faltando.push('E-mail válido');
    if (telLimpo.length < 10) faltando.push('Telefone / WhatsApp com DDD');
    if (![11, 14].includes(docLimpo.length)) faltando.push('CPF (11 números) ou CNPJ (14 números)');
    if (cepLimpo.length !== 8) faltando.push('CEP com 8 números');
    if (formData.uf.length !== 2) faltando.push('Estado (UF)');
    if (!formData.endereco.trim()) faltando.push('Endereço');
    if (!formData.numero.trim()) faltando.push('Número');
    if (!formData.bairro.trim()) faltando.push('Bairro');
    if (!formData.cidade.trim()) faltando.push('Cidade');

    if (faltando.length > 0) {
      alert(`Confira os campos abaixo:\n\n• ${faltando.join('\n• ')}`);
      return;
    }

    if (!shippingQuote) {
      alert('⚠️ Por favor, calcule o frete informando o seu CEP antes de finalizar o pedido.');
      return;
    }

    if (shippingQuote.cep && shippingQuote.cep !== cepLimpo) {
      alert('O frete foi calculado para um CEP diferente do CEP do endereço. Calcule o frete de novo com o CEP de entrega.');
      return;
    }

    setIsLoading(true);

    try {
      const partesNome = formData.nome.trim().split(' ');
      const firstName = partesNome[0] || '';
      const lastName = partesNome.slice(1).join(' ') || 'Cliente';

      const quoteAny = shippingQuote as any;
      const shippingMethodTitle = quoteAny.name || quoteAny.service || quoteAny.serviceName || 'Frete Correios / Transportadora';

      // Identifica esta compra para o Meta Ads (gravado no pedido e usado na API de Conversões)
      const eventId = novoEventId();

      const payload = {
        eventId,
        // De qual anúncio/campanha o cliente veio (últimos 7 dias), para medir o retorno dos anúncios
        origem: origemAtual(),
        paymentMethod: paymentMethod,
        items: carrinhoAtual.map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
          // O preço (e o desconto do Pix) é calculado no servidor com os valores do WooCommerce.
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
          complemento: formData.complemento,
          bairro: formData.bairro,
          cidade: formData.cidade,
          cep: formData.cep,
          uf: formData.uf,
        },
        shipping: {
          id: quoteAny.id,
          method_title: shippingMethodTitle,
          price: shippingQuote.price,
        }
      };

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        data = await response.json();
      } catch {
        throw new Error(
          'O servidor demorou para responder. Antes de tentar de novo, confira seu e-mail: o pedido pode ter sido criado. Se precisar, fale com a gente no WhatsApp.'
        );
      }

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
                  <label htmlFor="checkout-nome" className="block text-xs font-bold uppercase text-gray-600 mb-1">Nome Completo *</label>
                  <input id="checkout-nome" type="text" name="nome" autoComplete="name" value={formData.nome} onChange={handleInputChange} onBlur={salvarSacola} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>
                
                <div>
                  <label htmlFor="checkout-email" className="block text-xs font-bold uppercase text-gray-600 mb-1">E-mail *</label>
                  <input id="checkout-email" type="email" name="email" autoComplete="email" inputMode="email" value={formData.email} onChange={handleInputChange} onBlur={salvarSacola} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                  <p className="mt-1 text-[11px] text-gray-500">Se você não finalizar, podemos te lembrar por e-mail do que ficou na sacola.</p>
                </div>

                <div>
                  <label htmlFor="checkout-telefone" className="block text-xs font-bold uppercase text-gray-600 mb-1">Telefone / WhatsApp *</label>
                  <input id="checkout-telefone" type="tel" name="telefone" autoComplete="tel" inputMode="tel" placeholder="(21) 99999-9999" value={formData.telefone} onChange={handleInputChange} onBlur={salvarSacola} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="checkout-numeroDocumento" className="block text-xs font-bold uppercase text-gray-600 mb-1">CPF ou CNPJ (Somente números) *</label>
                  <input id="checkout-numeroDocumento" type="text" name="numeroDocumento" inputMode="numeric" autoComplete="off" value={formData.numeroDocumento} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div>
                  <label htmlFor="checkout-cep" className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    CEP * {isBuscandoCep && <span className="text-[#C9A227] lowercase normal-case text-[10px] ml-2 animate-pulse">(buscando...)</span>}
                  </label>
                  <input 
                    id="checkout-cep" type="text" 
                    name="cep" 
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="00000-000"
                    value={formData.cep} 
                    onChange={handleInputChange} 
                    required 
                    maxLength={9}
                    className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" 
                  />
                </div>

                <div>
                  <label htmlFor="checkout-uf" className="block text-xs font-bold uppercase text-gray-600 mb-1">Estado (UF)</label>
                  <input id="checkout-uf" type="text" name="uf" autoComplete="address-level1" maxLength={2} value={formData.uf} onChange={handleInputChange} className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="checkout-endereco" className="block text-xs font-bold uppercase text-gray-600 mb-1">Endereço (Rua, Avenida...) *</label>
                  <input id="checkout-endereco" type="text" name="endereco" autoComplete="address-line1" value={formData.endereco} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div>
                  <label htmlFor="checkout-numero" className="block text-xs font-bold uppercase text-gray-600 mb-1">Número *</label>
                  <input id="checkout-numero" type="text" name="numero" inputMode="text" autoComplete="off" placeholder="Ex.: 108 ou S/N" maxLength={10} value={formData.numero} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div>
                  <label htmlFor="checkout-complemento" className="block text-xs font-bold uppercase text-gray-600 mb-1">Complemento</label>
                  <input id="checkout-complemento" type="text" name="complemento" autoComplete="address-line2" placeholder="Apto, bloco, casa (opcional)" value={formData.complemento} onChange={handleInputChange} className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div>
                  <label htmlFor="checkout-bairro" className="block text-xs font-bold uppercase text-gray-600 mb-1">Bairro *</label>
                  <input id="checkout-bairro" type="text" name="bairro" autoComplete="address-level3" value={formData.bairro} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="checkout-cidade" className="block text-xs font-bold uppercase text-gray-600 mb-1">Cidade *</label>
                  <input id="checkout-cidade" type="text" name="cidade" autoComplete="address-level2" value={formData.cidade} onChange={handleInputChange} required className="w-full border p-2 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
                </div>
              </div>
            </div>

            {/* 💳 3. SELEÇÃO DE FORMA DE PAGAMENTO (PIX OU CARTÃO) */}
            <div className="bg-white p-6 shadow-sm rounded-sm">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6 pb-2 border-b text-[#0B1B34]">2. Forma de Pagamento</h3>
              
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
                    <span className="block text-sm font-bold text-[#0B1B34]">Pix {pctPix > 0 && <span className="text-xs text-emerald-600 font-bold ml-1">({Math.round(pctPix * 100)}% de Desconto)</span>}</span>
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
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6 pb-2 border-b text-[#0B1B34]">3. Seus Produtos</h3>
              {avisoPrecos && (
                <p role="status" className="mb-3 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded p-2">{avisoPrecos}</p>
              )}
              {activeItems.length === 0 ? (
                <p className="text-xs text-gray-500 py-4">Seu carrinho está vazio.</p>
              ) : (
                activeItems.map((item: any) => (
                  <div key={`${item.id}-${item.size}`} className="flex gap-4 py-4 border-b last:border-0">
                    <Image src={item.image} width={80} height={96} unoptimized={!podeOtimizar(item.image)} alt={item.name} className="w-20 h-24 object-contain bg-[#FAF7EF] p-1" />
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
                        R$ {(isPixSelected ? item.price * (1 - pctPix) : item.price).toFixed(2).replace('.', ',')}
                        {isPixSelected && pctPix > 0 && <span className="text-[10px] text-emerald-600 ml-1 font-normal">(pix)</span>}
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

                {isPixSelected && pctPix > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Desconto Pix ({Math.round(pctPix * 100)}%)</span>
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
                <ShippingCalculator subtotal={subtotalComDesconto} onQuote={setShippingQuote} cepExterno={formData.cep} />
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