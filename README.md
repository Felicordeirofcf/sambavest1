<div align="center">

# 🪩 Samba Vest — E-commerce Oficial

> *"Onde o amor pelo samba vira camisa."*

[![Next.js](https://img.shields.io/badge/Next.js-14+-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.8+-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Meta Pixel](https://img.shields.io/badge/Meta_Pixel-Active-1877F2?style=for-the-badge&logo=meta&logoColor=white)](https://developers.facebook.com/)

Plataforma de e-commerce moderna e de alta performance desenvolvida para a **Samba Vest**, especializada em camisas oficiais e exclusivas de enredo das escolas de samba.

</div>

---

## ✨ Sobre o Projeto

A **Samba Vest** nasceu da paixão pelo carnaval e pela cultura das escolas de samba do Rio de Janeiro. O projeto foi arquitetado para oferecer uma experiência de compra fluida, elegante e altamente otimizada para conversão de vendas, contando com seletores dinâmicos de modelos e tamanhos, integração completa com meios de pagamento, cálculo automatizado de frete e rastreamento de campanhas via Meta Pixel.

---

## 🚀 Principais Funcionalidades

* **Arquitetura Moderna (App Router):** Desenvolvido em Next.js para máxima velocidade de carregamento e excelente otimização para motores de busca (SEO).
* **Seletor de Variações Inteligente:** Navegação fluida entre diferentes modelos (*Unissex, Regata, Baby Look, Vestido*) e grades de tamanhos (*P ao EXG*).
* **Galeria Interativa:** Visualização detalhada de fotos do produto com sincronização dinâmica e guia de medidas acessível.
* **Conversão e Marketing:** Meta Pixel integrado nativamente para rastreamento de conversões (`PageView`) em todas as páginas da loja.
* **Atendimento Humanizado:** Botão flutuante de WhatsApp otimizado com mensagens customizadas por produto para tirar dúvidas de forma ágil.
* **Cálculo de Frete e Pix:** Ferramentas integradas de frete e destaque visual para pagamentos via Pix com desconto.

---

## 🛠️ Tecnologias Utilizadas

* **Front-end:** React, Next.js (App Router), TypeScript
* **Estilização:** Tailwind CSS
* **Gerenciamento de Estado:** Zustand (Carrinho de compras)
* **Marketing & Analytics:** Meta Pixel (Facebook Ads)
* **Hospedagem & Deploy:** Vercel

---

## 📂 Estrutura do Repositório

```text
├── app/                  # Rotas e páginas da aplicação (Next.js App Router)
│   ├── layout.tsx        # Layout global, SEO, metadados e Meta Pixel
│   └── produto/          # Páginas dinâmicas de produtos e variantes
├── components/           # Componentes reutilizáveis da interface
│   ├── layout/           # Header, Footer, Minicart e WhatsAppButton
│   └── product/          # Calculadora de frete e seções de produto
├── store/                # Gerenciamento de estado global (Zustand)
└── lib/                  # Utilitários, regras de negócio e constantes
