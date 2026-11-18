add_action('wp_head', function () {
    if (!function_exists('is_wc_endpoint_url') || !is_wc_endpoint_url('order-pay')) return;
    echo '<style id="sv-pagamento">' . <<<'CSS'
/* Samba Vest: página de pagamento do pedido com a cara da loja. Desative este snippet para voltar ao padrão. */
body.woocommerce-order-pay{background:#f6f4ef!important}
body.woocommerce-order-pay .elementor-widget-fibosearch,
body.woocommerce-order-pay .elementor-widget-nav-menu,
body.woocommerce-order-pay .elementor-widget-woocommerce-menu-cart,
body.woocommerce-order-pay .woocommerce-privacy-policy-text,
body.woocommerce-order-pay .cr-customer-consent,
body.woocommerce-order-pay .entry-title{display:none!important}
body.woocommerce-order-pay #content{max-width:520px;margin:18px auto 40px;padding:0 14px;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;color:#0B1B34}
body.woocommerce-order-pay #content *{box-sizing:border-box}

/* Resumo do pedido */
body.woocommerce-order-pay .shop_table{width:100%;border:0!important;border-collapse:separate;border-spacing:0;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(11,27,52,.08);margin:0 0 14px;font-size:13.5px}
body.woocommerce-order-pay .shop_table th,body.woocommerce-order-pay .shop_table td{border:0!important;border-bottom:1px solid #eee!important;padding:11px 14px;background:transparent!important}
body.woocommerce-order-pay .shop_table thead th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#777}
body.woocommerce-order-pay .shop_table tfoot td{white-space:nowrap}
body.woocommerce-order-pay .shop_table tfoot tr:last-child th,body.woocommerce-order-pay .shop_table tfoot tr:last-child td{border-bottom:0!important;font-size:17px;font-weight:900;color:#0B1B34}

@media (max-width:560px){
body.woocommerce-order-pay .shop_table{table-layout:fixed}
body.woocommerce-order-pay .shop_table th,body.woocommerce-order-pay .shop_table td{padding:10px 8px}
body.woocommerce-order-pay .shop_table .product-name{overflow-wrap:anywhere}
body.woocommerce-order-pay .shop_table tfoot td{white-space:normal}
body.woocommerce-order-pay .shop_table tfoot tr:last-child td{white-space:nowrap}
body.woocommerce-order-pay .shop_table .product-quantity{width:40px;text-align:center}
body.woocommerce-order-pay .shop_table .product-total{width:118px}
}

/* Pix e Cartão como abas */
body.woocommerce-order-pay #payment{background:transparent!important;border-radius:0}
body.woocommerce-order-pay ul.wc_payment_methods{display:grid;grid-template-columns:1fr 1fr;gap:8px;list-style:none;margin:0 0 12px!important;padding:0!important;border:0!important}
body.woocommerce-order-pay li.wc_payment_method{display:contents}
body.woocommerce-order-pay li.wc_payment_method>input.input-radio{position:absolute;opacity:0;pointer-events:none}
body.woocommerce-order-pay li.wc_payment_method>label{grid-row:1;display:flex;align-items:center;justify-content:center;gap:8px;margin:0;padding:13px 8px;border:1.5px solid #d9d6cd;border-radius:12px;background:#fff;color:#777;font-weight:800;font-size:14px;cursor:pointer;text-align:center}
body.woocommerce-order-pay li.wc_payment_method>label img{max-height:20px;width:auto;margin:0}
body.woocommerce-order-pay li.payment_method_pagamentos_para_woocommerce_com_appmax_pix>label{grid-column:1}
body.woocommerce-order-pay li.payment_method_pagamentos_para_woocommerce_com_appmax_credit_card>label{grid-column:2}
body.woocommerce-order-pay li.wc_payment_method>input.input-radio:checked+label{border-color:#0B1B34;color:#0B1B34;box-shadow:0 0 0 3px rgba(201,162,39,.35)}
body.woocommerce-order-pay li.wc_payment_method>.payment_box{grid-row:2;grid-column:1/-1;margin:2px 0 0!important;padding:16px!important;background:#fff!important;border-radius:16px;box-shadow:0 4px 18px rgba(11,27,52,.08);color:#444;font-size:13.5px}
body.woocommerce-order-pay li.wc_payment_method>.payment_box:before{display:none!important}

/* Campos do cartão */
body.woocommerce-order-pay .wc-credit-card-form label{display:block;margin:10px 0 5px;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#444}
body.woocommerce-order-pay .wc-credit-card-form input[type=text],
body.woocommerce-order-pay .wc-credit-card-form input[type=tel],
body.woocommerce-order-pay .wc-credit-card-form select{width:100%;height:48px;padding:0 13px;border:1.5px solid #d9d6cd;border-radius:11px;background:#fff;font-size:16px;color:#0B1B34}
body.woocommerce-order-pay .wc-credit-card-form input:focus,body.woocommerce-order-pay .wc-credit-card-form select:focus{outline:0;border-color:#0B1B34;box-shadow:0 0 0 3px rgba(201,162,39,.35)}

/* Botão Pagar */
body.woocommerce-order-pay #place_order{display:block;width:100%;margin-top:14px;padding:16px;border:0;border-radius:12px;background:#C9A227!important;color:#0B1B34!important;font-size:15px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
body.woocommerce-order-pay #place_order:hover{filter:brightness(1.05)}
body.woocommerce-order-pay #payment .form-row:last-of-type::after{content:'🔒 Pagamento seguro · ⚡ Pix aprova na hora';display:block;margin-top:12px;text-align:center;font-size:11.5px;font-weight:700;color:#777}

/* Aviso quando o banco recusa */
body.woocommerce-order-pay ul.woocommerce-error{margin:0 0 12px!important;padding:12px 14px 12px 32px!important;border:1px solid #f3c6c6!important;border-radius:12px;background:#fff4f4!important;color:#8a1f1f;font-size:13px}
body.woocommerce-order-pay ul.woocommerce-error:before{display:none}
.sv-recusa{margin:0 0 12px;padding:18px 16px;background:#fff;border-radius:16px;box-shadow:0 4px 18px rgba(11,27,52,.08);text-align:center}
.sv-recusa strong{display:block;font-size:18px;font-weight:900;color:#0B1B34}
.sv-recusa p{margin:6px 0 0;font-size:13px;color:#666}
.sv-recusa button{display:block;width:100%;margin-top:14px;padding:14px;border:0;border-radius:12px;background:#C9A227;color:#0B1B34;font-size:14px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;cursor:pointer}
CSS
    . '</style>';
}, 100);

add_action('wp_footer', function () {
    if (!function_exists('is_wc_endpoint_url') || !is_wc_endpoint_url('order-pay')) return;
    echo '<script id="sv-pagamento-js">' . <<<'JS'
document.addEventListener('DOMContentLoaded', function () {
  // Banco recusou: avisa que não houve cobrança e oferece o Pix com um toque
  // ignora o aviso "pedido de terceiros" (só aparece para admin logado)
  var erro = null;
  document.querySelectorAll('ul.woocommerce-error').forEach(function (u) {
    if (!erro && !/terceiros/i.test(u.textContent)) erro = u;
  });
  var pix = document.querySelector('li.payment_method_pagamentos_para_woocommerce_com_appmax_pix input.input-radio');
  if (!erro || !pix || pix.checked) return;
  var caixa = document.createElement('div');
  caixa.className = 'sv-recusa';
  caixa.innerHTML = '<strong>Pagamento não aprovado</strong><p>O banco não autorizou este cartão. Isso é comum e, se não foi aprovado, <b>não há cobrança</b>.</p><button type="button">Pagar no Pix agora</button>';
  erro.parentNode.insertBefore(caixa, erro);
  caixa.querySelector('button').addEventListener('click', function () {
    pix.click();
    var alvo = document.getElementById('payment');
    if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ behavior: 'smooth' });
  });
});
JS
    . '</script>';
}, 100);
