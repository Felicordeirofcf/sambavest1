'use client';

import { useSyncExternalStore } from 'react';
import ProductClient from './ProductClient';

/* eslint-disable @typescript-eslint/no-explicit-any */

const semInscricao = () => () => {};
const modeloDaUrl = () => new URLSearchParams(window.location.search).get('modelo');

/**
 * Lê o ?modelo= da URL só no navegador. Assim a página do produto pode sair pronta do cache
 * (com o produto no HTML) e, se o link pedir um modelo, ele é selecionado logo depois.
 */
export default function ProdutoComModelo({ product }: { product: any }) {
  const modelo = useSyncExternalStore(semInscricao, modeloDaUrl, () => null);
  return <ProductClient key={modelo || ''} product={product} modeloUrl={modelo} />;
}
