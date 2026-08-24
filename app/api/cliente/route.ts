// app/api/cliente/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getValidAccessToken(): Promise<string | null> {
  return process.env.BLING_ACCESS_TOKEN || null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cpf = searchParams.get('cpf');

    if (!cpf) {
      return NextResponse.json({ success: false, error: 'CPF não informado.' }, { status: 400 });
    }

    const docLimpo = cpf.replace(/\D/g, '');
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'Token do Bling não configurado.' }, { status: 500 });
    }

    // 🔍 A API v3 do Bling aceita o filtro por número do documento diretamente na query string
    const response = await fetch(`https://www.bling.com.br/Api/v3/contatos?numeroDocumento=${docLimpo}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Erro retornado pela API do Bling:", errorText);
      return NextResponse.json({ success: false, error: 'Erro ao buscar cliente no Bling.' }, { status: 400 });
    }

    const json = await response.json();
    const contatos = json.data || [];

    if (contatos.length === 0) {
      return NextResponse.json({ success: false, error: 'Cliente não encontrado.' }, { status: 404 });
    }

    const clienteResumo = contatos[0];

    // Busca os dados completos do contato utilizando o ID retornado
    const detalheRes = await fetch(`https://www.bling.com.br/Api/v3/contatos/${clienteResumo.id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    let dadosCompletos = clienteResumo;
    if (detalheRes.ok) {
      const detalheJson = await detalheRes.json();
      if (detalheJson.data) {
        dadosCompletos = detalheJson.data;
      }
    }

    const clienteFormatado = {
      nome: dadosCompletos.nome || '',
      email: dadosCompletos.email || '',
      telefone: dadosCompletos.telefone || '',
      numeroDocumento: dadosCompletos.numeroDocumento || docLimpo,
      endereco: dadosCompletos.endereco?.geral || '',
      numero: dadosCompletos.endereco?.numero || '',
      bairro: dadosCompletos.endereco?.bairro || '',
      cidade: dadosCompletos.endereco?.cidade || '',
      cep: dadosCompletos.endereco?.cep || '',
      uf: dadosCompletos.endereco?.uf || 'RJ',
    };

    return NextResponse.json({ success: true, cliente: clienteFormatado });
  } catch (error: any) {
    console.error("❌ Erro crítico ao buscar cliente:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}