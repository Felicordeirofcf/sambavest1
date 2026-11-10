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
3. Crie e aprove os **templates** (categoria **Utilidade**, idioma **Português (BR)**). Os nomes e a
   ordem das variáveis precisam ser exatamente estes. Textos sugeridos na seção 5.4.

| Template              | Quando                         | Variáveis                                          |
|-----------------------|--------------------------------|----------------------------------------------------|
| `pagamento_aprovado`  | pagamento aprovado             | {{1}} nome, {{2}} nº do pedido                     |
| `pedido_enviado`      | rastreio disponível            | {{1}} nome, {{2}} pedido, {{3}} código, {{4}} link |
| `lembrete_pix`        | Pix gerado e não pago (1h)     | {{1}} nome, {{2}} pedido, {{3}} valor, {{4}} link  |
| (opcional) recebido   | pedido criado, antes de pagar  | {{1}} nome, {{2}} pedido, {{3}} valor              |
| (opcional) alerta     | alerta de mensagem para você   | {{1}} cliente, {{2}} trecho da mensagem            |

### E-mail (Resend)
1. Crie uma conta em resend.com e verifique o domínio `sambavest.com`.
2. Preencha `RESEND_API_KEY`, `EMAIL_REMETENTE` e `EMAIL_ADMIN` (recebe os alertas da loja).
3. `AVISOS_EMAIL_EVENTOS` define o que também vai por e-mail. O padrão é `enviado,pixLembrete`,
   porque o WooCommerce já manda os e-mails de pagamento aprovado e de pedido concluído.

## 5. Atendimento pelo WhatsApp (mensagens recebidas)

Quando um cliente escreve para o número da loja, a Meta avisa o site (`/api/webhooks/whatsapp`). O site:

1. **Guarda a conversa** no Upstash (últimas 60 mensagens por cliente, por 30 dias).
2. **Avisa você** por e-mail (`EMAIL_ADMIN`) e/ou WhatsApp (`WHATSAPP_NUMERO_DONO`). No máximo um alerta
   por conversa a cada 15 min (`WHATSAPP_ALERTA_INTERVALO_MIN`); quando a dúvida precisa de uma pessoa,
   o alerta vai sempre.
3. **Responde sozinho** as dúvidas simples, se `WHATSAPP_RESPOSTAS_AUTOMATICAS=true`:
   - *Status do pedido* ("cadê meu pedido", "pedido 1234", "rastreio"): procura no WooCommerce pelo
     telefone de quem escreveu ou pelo número do pedido. Só responde se o telefone do pedido for o mesmo
     de quem perguntou. Mostra até 3 pedidos dos últimos 180 dias, com o rastreio.
   - *Prazo* ("quanto tempo demora", "quando chega", "prazo"): responde "O prazo de envio é de 3 a 7
     dias úteis." Para mudar, preencha `WHATSAPP_RESPOSTA_PRAZO`.
   - *Tabela de tamanhos* e *boas-vindas*: só se o texto estiver preenchido em
     `WHATSAPP_RESPOSTA_TAMANHOS` e `WHATSAPP_RESPOSTA_BOAS_VINDAS`.
   - Qualquer outra coisa (ou áudio, foto etc.): **passa para você**. A conversa fica marcada como
     "humano" e o robô não responde mais nela por 12 h (`WHATSAPP_HUMANO_SILENCIO_HORAS`). Se
     `WHATSAPP_RESPOSTA_HUMANO` estiver preenchido, o cliente recebe esse texto.

### 5.1 Ligar o webhook na Meta
1. Invente um texto qualquer e coloque em `WHATSAPP_VERIFY_TOKEN`.
2. Em developers.facebook.com → seu app → Configurações do app → Básico, copie a **Chave secreta do
   aplicativo** para `WHATSAPP_APP_SECRET`. Faça o deploy.
3. Em WhatsApp → Configuração → Webhook → Editar:
   - URL de retorno: `https://SEU-SITE/api/webhooks/whatsapp`
   - Token de verificação: o mesmo `WHATSAPP_VERIFY_TOKEN`
   - Depois de salvar, em **Campos do webhook**, assine `messages`.
4. Se o app ainda estiver em modo de desenvolvimento, só chegam mensagens de números cadastrados como
   teste. Para receber de qualquer cliente, publique o app (modo Ativo).

### 5.2 Alertas no seu WhatsApp
A Meta só deixa a loja mandar texto livre para quem falou com ela nas últimas 24 h. Por isso:
- Mande qualquer mensagem do seu celular (`WHATSAPP_NUMERO_DONO`) para o número da loja. Isso abre a
  janela por 24 h e os alertas chegam no seu WhatsApp. Suas mensagens não aparecem como cliente.
- Fora da janela, o alerta vai pelo template `WHATSAPP_TEMPLATE_ALERTA_DONO` (se você criar um) e
  sempre por e-mail.
- Para testar como cliente, use **outro** celular.

### 5.3 Painel `/atendimento`
Defina `ATENDIMENTO_SENHA` e abra `https://SEU-SITE/atendimento`. Mostra as conversas dos últimos 30 dias,
as mensagens não lidas, os avisos automáticos enviados (com status entregue/lida/falhou) e permite
**responder** enquanto a janela de 24 h estiver aberta. "Devolver ao robô" tira a marca de "humano".

Sem coexistência (5.5), o número ligado à API não funciona no app WhatsApp. Nesse caso, responda pelo
painel.

### 5.4 Templates: como criar e aprovar
Em business.facebook.com → WhatsApp Manager → Modelos de mensagem → Criar modelo:
- Categoria **Utilidade** (aviso sobre um pedido do cliente). Se a Meta reclassificar como Marketing,
  tire palavras de venda ("promoção", "aproveite").
- Idioma **Português (BR)** → `pt_BR` (`WHATSAPP_TEMPLATE_IDIOMA`).
- Nome exatamente como na tabela da seção 4, em minúsculas.
- Regras que mais reprovam: o texto **não pode começar nem terminar com uma variável**; não pode ter
  duas variáveis coladas; precisa ter mais texto fixo que variáveis; preencha os **exemplos** de cada
  variável no formulário.

Textos sugeridos (ajuste à vontade, mantendo a ordem das variáveis):

`pagamento_aprovado`
> Oi, {{1}}! O pagamento do seu pedido #{{2}} na Samba Vest foi aprovado. Agora vamos separar e enviar, e você recebe o código de rastreio por aqui.

`pedido_enviado`
> Oi, {{1}}! Seu pedido #{{2}} da Samba Vest foi enviado. Código de rastreio: {{3}}. Acompanhe a entrega em {{4}} . Qualquer dúvida, é só responder esta mensagem.

`lembrete_pix`
> Oi, {{1}}! O Pix do seu pedido #{{2}} ({{3}}) ainda não foi pago. Para concluir, acesse {{4}} . Se já pagou, pode ignorar esta mensagem.

`alerta_atendimento` (opcional, para você)
> Nova mensagem no WhatsApp da loja de {{1}}: "{{2}}". Responda pelo painel de atendimento.

Teste cada template, depois de aprovado, gerando um pedido de teste com o seu telefone. Se a mensagem
não chegar, o site manda um e-mail "WhatsApp não entregue" com o motivo dado pela Meta
(ex.: 132001 = template não existe nesse idioma; 131026 = número sem WhatsApp; 132000 = número
de variáveis diferente do template).

### 5.5 Coexistência: continuar usando o app WhatsApp Business

Com a coexistência, o número da loja **continua no app WhatsApp Business** (celular e PC) e também fica
ligado à API. Você atende pelo app como sempre, e o site recebe tudo: guarda no painel, manda os avisos
automáticos (templates) e responde as dúvidas simples.

**Conectar (feito uma vez, pelo celular que tem o WhatsApp Business):**
1. Atualize o app WhatsApp Business no celular.
2. Em developers.facebook.com → seu app → WhatsApp → Configuração da API → **Adicionar número de
   telefone**, escolha a opção de **conectar um número que já está no app WhatsApp Business**. A Meta
   mostra um QR code ou manda um aviso para o app; confirme no celular. Aceite compartilhar o histórico
   de conversas, se perguntar.
   - Se essa opção não aparecer, a Meta ainda não liberou a coexistência por este caminho para a sua
     conta. Ela também é oferecida pelos parceiros oficiais da Meta (BSPs). **Não** use a opção de
     cadastrar o número do zero: isso tira o número do app.
3. Pegue o **Phone number ID** do número conectado → `WHATSAPP_PHONE_NUMBER_ID`. Gere o token
   permanente (seção 4) → `WHATSAPP_TOKEN`.
4. No webhook (5.1), assine os campos **`messages`** e **`smb_message_echoes`**.
5. Na Vercel: `WHATSAPP_COEXISTENCIA=true`. Faça o deploy.

**Como fica no dia a dia:**
- Mensagem de cliente: aparece no app, como sempre, e também no painel. Se as respostas automáticas
  estiverem ligadas, o robô responde o que reconhecer (a resposta aparece no app também).
- Quando **você** responde pelo app (celular ou PC), o site recebe a cópia ("pelo app" no painel) e o
  robô fica quieto naquela conversa por 12 h. Assim ele não fala por cima de você.
- Alertas: por padrão (`WHATSAPP_ALERTAS` vazio) só chegam quando a dúvida precisa de você, porque o
  resto você já vê no app.
- Os avisos de pedido (pagamento aprovado, enviado, Pix) saem do mesmo número da loja e aparecem no app.

**Cuidados:**
- Abra o app WhatsApp Business no celular de vez em quando (a Meta exige uso regular do app, em torno
  de pelo menos uma vez a cada 14 dias, para manter a coexistência ativa).
- Alguns recursos do app ficam limitados com a API ligada (ex.: mensagens temporárias, ver uma vez,
  listas de transmissão). Os grupos continuam só no app e não passam pelo site.
- Confira, depois de conectar, se o WhatsApp do PC continua conectado. Se cair, conecte de novo pelo QR
  code no PC.

## Testar

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://SEU-SITE/api/cron/automacao?tarefa=pedidos"
```

A resposta lista cada pedido com o que foi feito e os erros. Os logs também ficam na Vercel
(Logs → buscar `[automacao]`).

Webhook do WhatsApp (deve devolver `ok`):

```bash
curl "https://SEU-SITE/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=ok"
```

Os logs do atendimento ficam na Vercel (Logs → buscar `[atendimento]`).
