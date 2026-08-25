'use client';

import { useState } from 'react';
import Link from 'next/link';

// Função para traduzir o status do WooCommerce para Português de forma amigável
const translateStatus = (status: string) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: 'Aguardando Pagamento', color: 'bg-yellow-100 text-yellow-800' },
    processing: { label: 'Preparando Envio', color: 'bg-blue-100 text-blue-800' },
    'on-hold': { label: 'Em Análise', color: 'bg-orange-100 text-orange-800' },
    completed: { label: 'Enviado / Entregue', color: 'bg-green-100 text-green-800' },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
    refunded: { label: 'Reembolsado', color: 'bg-gray-100 text-gray-800' },
    failed: { label: 'Falhou', color: 'bg-red-100 text-red-800' },
  };
  return statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
};

export default function MeusPedidosPage() {
  const [formData, setFormData] = useState({ email: '', cpf: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleBuscarPedidos = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOrders(null);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/pedidos?email=${encodeURIComponent(formData.email)}&cpf=${formData.cpf}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nenhum pedido encontrado com esses dados.');
      }

      if (data.orders.length === 0) {
        setError('Não encontramos nenhum pedido com este E-mail e CPF.');
      } else {
        setOrders(data.orders);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#FAF7EF] py-10 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <h1 className="font-heading text-3xl font-extrabold uppercase tracking-widest text-[#0B1B34] mb-8 text-center">
          Rastrear Meus Pedidos
        </h1>

        {/* 📋 FORMULÁRIO DE BUSCA */}
        <div className="bg-white p-6 md:p-8 shadow-sm rounded-sm mb-10 max-w-xl mx-auto">
          <p className="text-sm text-gray-600 mb-6 text-center">
            Digite o E-mail e o CPF utilizados na compra para visualizar o status do seu pedido.
          </p>
          
          <form onSubmit={handleBuscarPedidos} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 mb-1">E-mail da Compra</label>
              <input 
                type="email" 
                name="email" 
                value={formData.email} 
                onChange={handleInputChange} 
                required 
                className="w-full border p-3 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#0B1B34]" 
                placeholder="seuemail@exemplo.com" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 mb-1">CPF (Somente números)</label>
              <input 
                type="text" 
                name="cpf" 
                value={formData.cpf} 
                onChange={handleInputChange} 
                required 
                className="w-full border p-3 text-sm rounded bg-gray-50 focus:outline-none focus:border-[#0B1B34]" 
                placeholder="12345678909" 
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 text-sm border border-red-200 rounded-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-[#0B1B34] text-white font-bold uppercase tracking-widest text-sm hover:bg-[#C9A227] transition-colors rounded-sm flex justify-center items-center mt-2"
            >
              {isLoading ? 'Buscando...' : 'Buscar Pedidos'}
            </button>
          </form>
        </div>

        {/* 📦 LISTA DE PEDIDOS */}
        {orders && orders.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold uppercase tracking-widest text-[#0B1B34] border-b pb-2">
              Histórico de Compras ({orders.length})
            </h2>

            {orders.map((order) => {
              const statusInfo = translateStatus(order.status);
              return (
                <div key={order.id} className="bg-white p-6 shadow-sm rounded-sm border-l-4 border-[#C9A227]">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 mb-4 gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-[#0B1B34]">Pedido #{order.id}</h3>
                      <p className="text-sm text-gray-500">Realizado em {order.date}</p>
                    </div>
                    <div className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm ${statusInfo.color}`}>
                      {statusInfo.label}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Produtos */}
                    <div>
                      <h4 className="text-xs font-bold uppercase text-gray-400 mb-3 tracking-wider">Produtos</h4>
                      <ul className="space-y-3">
                        {order.items.map((item: any, index: number) => (
                          <li key={index} className="flex justify-between text-sm text-[#1E2233]">
                            <span>{item.quantity}x {item.name}</span>
                            <span className="font-medium text-gray-500">R$ {parseFloat(item.price).toFixed(2).replace('.', ',')}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 pt-4 border-t flex justify-between font-bold text-[#0B1B34]">
                        <span>Total Pago:</span>
                        <span>R$ {parseFloat(order.total).toFixed(2).replace('.', ',')}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Via {order.payment_method_title}</p>
                    </div>

                    {/* Endereço */}
                    <div className="bg-gray-50 p-4 rounded-sm border">
                      <h4 className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Endereço de Entrega</h4>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {order.shipping.first_name} {order.shipping.last_name}<br />
                        {order.shipping.address_1}<br />
                        {order.shipping.city} - {order.shipping.state}<br />
                        CEP: {order.shipping.postcode}
                      </p>
                      
                      <div className="mt-5">
                        <Link 
                          href="https://wa.me/5521996959903?text=Olá, preciso de ajuda com o meu pedido." 
                          target="_blank"
                          className="inline-block text-xs font-bold uppercase text-[#0B1B34] underline hover:text-[#C9A227] transition-colors"
                        >
                          Precisa de ajuda com este pedido?
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}