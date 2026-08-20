# Samba Vest

Loja da Samba Vest — camisas oficiais de enredo das escolas campeãs do carnaval. Projeto em [Next.js](https://nextjs.org) (App Router) + Tailwind CSS v4.

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org) 20 ou superior instalado.

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

## Configuração (opcional)

O site já funciona "out of the box", sem nenhuma variável de ambiente configurada. Se quiser
personalizar o número de WhatsApp usado no botão flutuante, no carrinho, no checkout e no
rodapé, copie `.env.example` para `.env.local` e preencha:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_WHATSAPP_NUMBER=5521999999999
NEXT_PUBLIC_WHATSAPP_DISPLAY="(21) 99999-9999"
NEXT_PUBLIC_CONTACT_EMAIL=contato@sambavest.com.br
```

## Como editar os produtos da vitrine

Os produtos mostrados na Home e nas páginas de categoria vêm de `lib/products.ts`. É um
catálogo estático: para trocar nome, preço, imagem, descrição ou tamanhos de qualquer camisa,
edite os objetos desse arquivo — nenhum outro componente precisa mudar.

As imagens dos produtos ficam em `public/products/`. Para adicionar uma nova camisa, coloque
a imagem nessa pasta e aponte o campo `image` do produto para ela (ex: `/products/nome-do-arquivo.webp`).

As categorias do menu (Lançamentos, Camisas de Enredo, Campeãs do Carnaval, Kits Promocionais,
Tamanho Grande, Acessórios) também estão em `lib/products.ts`, no array `categories`.

## Checkout

Como a loja ainda não está conectada a um checkout de pagamento, o botão "Finalizar Compra"
(no carrinho e na página `/checkout`) monta uma mensagem com o resumo do pedido e abre o
WhatsApp configurado em `NEXT_PUBLIC_WHATSAPP_NUMBER`. Essa lógica está em `lib/whatsapp.ts`.

## Integração futura com Nuvemshop (opcional)

Se no futuro você conectar uma loja real na Nuvemshop e quiser puxar produtos, estoque e
checkout de lá em vez do catálogo estático, o arquivo `lib/nuvemshop.ts` já tem a integração
pronta (busca de produtos e criação de checkout via API). Basta preencher
`NEXT_PUBLIC_NUVEMSHOP_STORE_ID` e `NUVEMSHOP_ACCESS_TOKEN` no `.env.local` e trocar, nas
páginas (`app/page.tsx`, `app/categoria/[slug]/page.tsx`, `app/produto/[handle]/page.tsx`),
as chamadas a `lib/products.ts` pelas chamadas equivalentes de `lib/nuvemshop.ts`.

## Logo e identidade visual

O header usa a logo oficial da marca (`public/logo-wordmark.png`, extraída da sua arte
original com o fundo removido). Os ícones de aba/atalho (`public/icon-mark.png`,
`public/apple-touch-icon.png`, `public/favicon.ico`) e a imagem de compartilhamento
(`public/og-image.png`) ainda usam um selo genérico gerado para o projeto — se quiser, é só
substituir esses arquivos por versões quadradas da sua logo oficial, com o mesmo nome, que
nenhum código precisa mudar.

As cores da marca estão centralizadas como valores em Tailwind (`#0B1B34` navy, `#C9A227`
dourado, `#FAF7EF` creme) espalhados pelos componentes, e também disponíveis como variáveis
CSS em `app/globals.css` (`--brand-navy`, `--brand-gold`, `--brand-cream`, `--brand-red`) para
quem preferir usá-las diretamente.

## Aprenda mais sobre o Next.js

- [Documentação do Next.js](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
