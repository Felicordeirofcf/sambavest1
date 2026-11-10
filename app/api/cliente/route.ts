// app/api/cliente/route.ts
import { NextResponse } from 'next/server';
import { bling } from '../../../lib/automacao/bling';

export const dynamic = 'force-dynamic';

type ContatoBling = {
  id: number;
  nome?: string;
  email?: string;
  telefone?: string;
  numeroDocumento?: string;
  endereco?: { geral?: { endereco?: string; numero?: string; bairro?: string; municipio?: string; cep?: string; uf?: string } };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cpf = searchParams.get('cpf');

    if (!cpf) {
      return NextResponse.json({ success: false, error: 'CPF não informado.' }, { status: 400 });
    }

    const docLimpo = cpf.replace(/\D/g, '');

    // 🔍 A API v3 do Bling aceita o filtro por número do documento diretamente na query string
    const json = await bling<{ data: ContatoBling[] }>(`/contatos?numeroDocumento=${docLimpo}`);
    const contatos = json.data || [];

    if (contatos.length === 0) {
      return NextResponse.json({ success: false, error: 'Cliente não encontrado.' }, { status: 404 });
    }

    // Busca os dados completos do contato utilizando o ID retornado
    let dadosCompletos = contatos[0];
    try {
      const detalhe = await bling<{ data: ContatoBling }>(`/contatos/${contatos[0].id}`);
      if (detalhe.data) dadosCompletos = detalhe.data;
    } catch {
      // segue com o resumo
    }
    const end = dadosCompletos.endereco?.geral || {};

    const clienteFormatado = {
      nome: dadosCompletos.nome || '',
      email: dadosCompletos.email || '',
      telefone: dadosCompletos.telefone || '',
      numeroDocumento: dadosCompletos.numeroDocumento || docLimpo,
      endereco: end.endereco || '',
      numero: end.numero || '',
      bairro: end.bairro || '',
      cidade: end.municipio || '',
      cep: end.cep || '',
      uf: end.uf || 'RJ',
    };

    return NextResponse.json({ success: true, cliente: clienteFormatado });
  } catch (error) {
    console.error("❌ Erro crítico ao buscar cliente:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}