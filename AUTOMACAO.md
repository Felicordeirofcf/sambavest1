# Automações da Samba Vest

Tudo gira em torno do **pedido no WooCommerce**. Quando o pedido muda, o WooCommerce avisa o site
(webhook) e o site faz o resto sozinho. A cada 30 minutos uma rotina passa de novo nos pedidos, para
pegar o que tiver falhado e buscar códigos de rastreio.

```
Cliente paga (AppMax) ──► WooCommerce "Processando"
                              │ webhook
                              ▼
                    /api/webhooks/woocommerce
                              │
     ┌───────────────┬────────┴────────┬──────────────────┬──────────────────┐
     ▼               ▼                 ▼                  ▼                  ▼
 Aviso ao cliente  Alerta p/ loja   Bling: pedido      Bling: NF-e     Melhor Envio: envio
 (WhatsApp/e-mail) (e-mail)         de venda           (opcional)      + etiqueta (opcional)
                                                                              │
                         rotina a cada 30 min (/api/cron/automacao) ◄─────────┘
                         • busca o rastreio → avisa o cliente → pedido "Concluído"
                         • lembra quem gerou Pix e não pagou
                         • sincroniza o estoque Bling → WooCommerce (opcional)
```

Cada etapa grava uma marca no pedido (campos `_sv_*`). Por isso nada é feito duas vezes, mesmo que o
webhook chegue repetido. Se alguma etapa der erro, aparece uma nota "⚠️ Automação" no pedido e chega um
e-mail para `EMAIL_ADMIN`. A rotina tenta de novo na próxima passada.

Pedidos com mais de 15 dias não são tocados (evita mandar pedidos antigos para o Bling ou mensagens
para clientes antigos ao ligar a automação).

Todas as variáveis estão em `.env.example`. Cadastre-as na Vercel (Settings → Environment Variables)
e faça um novo deploy.

---

## 1. Base (obrigatório)

1. **CRON_SECRET**: invente uma senha longa e coloque na Vercel.
2. **Upstash Redis**: na Vercel, abra Storage → Upstash (Redis) → conecte ao projeto. Isso cria
   `KV_REST_API_URL` e `KV_REST_API_TOKEN`. É obrigatório para o Bling (guarda o token que o Bling
   troca a cada renovação) e evita processar o mesmo pedido duas vezes ao mesmo tempo.
3. **Webhook do WooCommerce**: WooCommerce → Configurações → Avançado → Webhooks → Adicionar.
   Crie dois, com status **Ativo**:
   - Tópico **Pedido criado**
   - Tópico **Pedido atualizado**

   Para os dois, use a URL `https://SEU-SITE/api/webhooks/woocommerce` e o mesmo **Segredo**. Coloque esse
   segredo em `WC_WEBHOOK_SECRET`.
4. **Rotina a cada 30 min**: no GitHub do projeto, abra Settings → Secrets and variables → Actions e
   crie `SITE_URL` (ex.: `https://sambavest.com`) e `CRON_SECRET` (o mesmo da Vercel). O workflow
   `.github/workflows/automacao.yml` passa a rodar sozinho. Ele também pode ser disparado à mão em
   Actions → Automação da loja → Run workflow. O `vercel.json` ainda roda tudo uma vez por dia como
   reserva.

### Conferir a Base

- **Gerar o CRON_SECRET**: no terminal, `openssl rand -hex 32` (ou um gerador de senhas com 40+
  caracteres, só letras e números). Use exatamente o mesmo valor na Vercel e no GitHub.
- **Certificado de `api.sambavest.com`**: o site agora exige HTTPS válido ao falar com o WooCommerce.
  Teste em https://www.ssllabs.com/ssltest/ — nota A/B e **sem "Chain issues"**. Se faltar o
  certificado intermediário, o navegador abre normal mas o servidor da Vercel recusa a conexão
  (checkout e automações param). Na hospedagem, reemita/reinstale o Let's Encrypt com a cadeia completa.
- **Webhooks**: em WooCommerce → Avançado → Webhooks, a coluna de status deve continuar **Ativo**.
  Ao editar um webhook, o fim da página mostra as últimas entregas: o esperado é resposta **200**.
  Resposta **401** = o Segredo do webhook é diferente de `WC_WEBHOOK_SECRET` na Vercel.
- **Rotina**: em GitHub → Actions → Automação da loja → Run workflow. O passo "Chamar
  /api/cron/automacao" deve terminar verde e mostrar `"ok":true`.

## Checkout: preço e frete

O navegador só envia **ID da variação, quantidade, forma de pagamento e serviço de frete**. O servidor
(`app/api/checkout`) busca o preço atual de cada variação no WooCommerce, aplica os 10% do Pix
(o pedido mostra o preço cheio e o desconto) e refaz a cotação no Melhor Envio para cobrar o frete
real (PAC grátis a partir de R$ 300 em produtos, mesma regra da calculadora). Para mudar o desconto
do Pix, altere `METODOS` em `app/api/checkout/route.ts` e o texto do checkout.

## 2. Bling: pedido de venda, NF-e e estoque

1. No Bling, abra Central de Extensões → Área do Integrador → Criar aplicativo.
   - Link de redirecionamento: `https://SEU-SITE/api/bling/callback`
   - Escopos: Contatos, Pedidos de Venda, Produtos, Estoques, Notas Fiscais
2. Coloque `BLING_CLIENT_ID` e `BLING_CLIENT_SECRET` na Vercel e faça o deploy.
3. Abra o **link de convite** do aplicativo e autorize. Se a página mostrar "Bling conectado!", deu
   certo. Os tokens ficam salvos e são renovados sozinhos.
4. **SKUs**: o código do produto no Bling precisa ser igual ao SKU da variação no WooCommerce
   (ex.: `BF27-BASICA-M`). É assim que o pedido e o estoque se ligam.

Liga/desliga:
- `BLING_ENVIAR_PEDIDOS=true`: cria o pedido de venda quando o pagamento é aprovado.
- `BLING_EMITIR_NFE=true`: gera a NF-e do pedido e envia para a SEFAZ. Antes de ligar, confira no
  Bling a natureza de operação padrão e os dados fiscais dos produtos (NCM, origem, CFOP).
- `BLING_SINCRONIZAR_ESTOQUE=true`: copia o saldo do Bling para o WooCommerce. Só altera variações
  que estão com **Gerenciar estoque** ligado no WooCommerce, então peças sob encomenda continuam
  sempre disponíveis.

## 3. Melhor Envio: etiqueta e rastreio

1. No Melhor Envio, abra Configurações → Tokens → Gerar token, com permissões de carrinho, envio e
   compra. Coloque em `MELHOR_ENVIO_TOKEN` (é o mesmo token já usado na cotação de frete).
2. Preencha os dados do remetente (`REMETENTE_*` e `CEP_ORIGEM`).
3. Com `MELHOR_ENVIO_CRIAR_ENVIOS=true`, cada pedido pago entra no **carrinho** do Melhor Envio já
   com o serviço escolhido pelo cliente no checkout. Você só confere e paga lá.
4. Com `MELHOR_ENVIO_COMPRAR_ETIQUETA=true`, a etiqueta é paga com o saldo da carteira e gerada
   sozinha. O link para imprimir aparece numa nota do pedido e chega por e-mail.
5. Quando a encomenda é postada, a rotina pega o código de rastreio, avisa o cliente e conclui o
   pedido.

Se a NF-e estiver ligada, o envio espera a NF-e ser autorizada e usa a chave dela. Sem NF-e, vai como
declaração de conteúdo.

**Envio sem Melhor Envio:** no pedido do WooCommerce, adicione o campo personalizado `_sv_rastreio`
com o código. O cliente é avisado na hora. O campo do plugin "Correios for WooCommerce"
(`_correios_tracking_code`) também funciona.

## 4. Avisos ao cliente (WhatsApp e e-mail)

### WhatsApp (API oficial da Meta)
1. Em developers.facebook.com, crie um app do tipo Business e adicione o WhatsApp. Use um número que
   **não** esteja no app WhatsApp comum.
2. Gere um token permanente (Usuário do sistema no Gerenciador de Negócios) e pegue o
   *Phone number ID*. Coloque em `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.
3. Crie e aprove estes **templates** (categoria Utilidade, idioma Português BR). As variáveis precisam
   ficar nesta ordem:

| Template              | Quando                         | Variáveis                                          |
|-----------------------|--------------------------------|----------------------------------------------------|
| `pagamento_aprovado`  | pagamento aprovado             | {{1}} nome, {{2}} nº do pedido                     |
| `pedido_enviado`      | rastreio disponível            | {{1}} nome, {{2}} pedido, {{3}} código, {{4}} link |
| `lembrete_pix`        | Pix gerado e não pago (1h)     | {{1}} nome, {{2}} pedido, {{3}} valor, {{4}} link  |
| (opcional) recebido   | pedido criado, antes de pagar  | {{1}} nome, {{2}} pedido, {{3}} valor              |

Exemplo de `pedido_enviado`:
> Oi, {{1}}! Seu pedido #{{2}} da Samba Vest foi enviado 🥁 Código de rastreio: {{3}}. Acompanhe: {{4}}

### E-mail (Resend)
1. Crie uma conta em resend.com e verifique o domínio `sambavest.com`.
2. Preencha `RESEND_API_KEY`, `EMAIL_REMETENTE` e `EMAIL_ADMIN` (recebe os alertas da loja).
3. `AVISOS_EMAIL_EVENTOS` define o que também vai por e-mail. O padrão é `enviado,pixLembrete`,
   porque o WooCommerce já manda os e-mails de pagamento aprovado e de pedido concluído.

## Testar

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://SEU-SITE/api/cron/automacao?tarefa=pedidos"
```

A resposta lista cada pedido com o que foi feito e os erros. Os logs também ficam na Vercel
(Logs → buscar `[automacao]`).

## 5. Meta Ads: rastreamento de compras e catálogo

**Por quê:** o pagamento acontece na página da AppMax, fora do site, então o Pixel do navegador nunca
via a compra. Sem a compra, o Meta Ads não sabe para quem mostrar o anúncio.

**O que é enviado:**
- **No navegador (Pixel):** `PageView`, `ViewContent` (página de produto), `AddToCart` e
  `InitiateCheckout` (botão "Ir para o Checkout").
- **Pelo servidor (API de Conversões):** `Purchase`, no momento em que o pagamento é aprovado, com o
  valor real do pedido. E-mail, telefone, nome, cidade, CEP e CPF vão **com hash SHA-256**, como a
  Meta exige. Também vão os cookies do Pixel (`_fbp`/`_fbc`), o IP e o navegador capturados no
  checkout, para a venda ser atribuída ao anúncio que a trouxe.
- **Catálogo:** `https://SEU-SITE/api/feed/meta` (CSV, atualizado a cada 1h). Cada modelo/tamanho é um
  item, e os IDs batem com os eventos acima. Isso habilita os anúncios de catálogo e o remarketing
  dinâmico.

**Configurar:**
1. Gerenciador de Eventos → seu Pixel → Configurações → **API de Conversões → Gerar token de
   acesso**. Coloque em `META_CAPI_TOKEN` na Vercel. `META_PIXEL_ID` é opcional: o padrão é o Pixel
   que já está no site.
2. **Teste:** em Gerenciador de Eventos → Testar eventos, copie o código (ex.: `TEST12345`), coloque
   em `META_TEST_EVENT_CODE`, faça uma compra de teste e confira o `Purchase` aparecendo. **Depois
   apague** `META_TEST_EVENT_CODE`, senão as compras não contam para os anúncios.
3. Gerenciador de Comércio → Catálogo → Fontes de dados → Feed de dados → **URL agendada** →
   `https://SEU-SITE/api/feed/meta`, de hora em hora. Depois, ligue o catálogo ao Pixel em
   Catálogo → Eventos.
4. Em Configurações do Pixel, ative a **correspondência avançada automática**.
