'use client';

import { useSyncExternalStore } from 'react';
import ProductClient, { type TemaBlack } from './ProductClient';

/* eslint-disable @typescript-eslint/no-explicit-any */

const semInscricao = () => () => {};
const modeloDaUrl = () => new URLSearchParams(window.location.search).get('modelo');

/**
 * Lê o ?modelo= da URL só no navegador. Assim a página do produto pode sair pronta do cache
 * (com o produto no HTML) e, se o link pedir um modelo, ele é selecionado logo depois.
 */
export default function ProdutoComModelo({ product, black, modeloFixo }: { product: any; black?: TemaBlack; modeloFixo?: string | null }) {
  const daUrl = useSyncExternalStore(semInscricao, modeloDaUrl, () => null);
  // /produto/slug/vestido já vem com o modelo (do servidor); ?modelo= continua valendo
  const modelo = daUrl || modeloFixo || null;
  return <ProductClient key={modelo || ''} product={product} modeloUrl={modelo} black={black} />;
}
