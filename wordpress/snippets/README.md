# Snippets do WordPress (api.sambavest.com)

Código que roda no WordPress pelo plugin **Code Snippets**. Cada arquivo é um snippet PHP (tipo
"Functions", "Run snippet everywhere"), colado **sem** `<?php` no começo. Desative o snippet no plugin para
voltar ao padrão.

| Arquivo | O que faz |
|---|---|
| `link-pagamento-sem-confirmacao-de-email.php` | O link de pagamento abre direto, sem pedir para o cliente confirmar o e-mail. |
| `pagina-abre-na-forma-escolhida.php` | A página de pagamento abre na forma escolhida no site (Pix ou cartão). |
| `estilo-pagamento.php` | Visual da página de pagamento com a cara da loja: abas Pix/Cartão, botão dourado, aviso de recusa com atalho para o Pix. |
| `parcelas-pagina-do-pedido.php` | Na página de pagamento do pedido, "Nº de parcelas" mostra "À vista" com o total do pedido (o plugin da AppMax calculava pelo carrinho do WordPress e o campo vinha vazio ou errado). |

Estrutura da página usada pelo estilo (tema Hello Elementor, plugin de pagamentos da AppMax): `body.woocommerce-order-pay`,
`form#order_review`, `.shop_table`, `#payment`, `li.wc_payment_method`, `.payment_box`, `#place_order`.
Foi lida com `?tarefa=diagnostico-pix`. Se o plugin mudar o HTML, o estilo pode precisar de ajuste.
