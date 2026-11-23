/*
 * Samba Vest — Parcelas na página de pagamento do pedido (order-pay), calculadas pelo PEDIDO
 *
 * O plugin "Pagamentos com AppMax para WooCommerce" (1.1.1-beta) monta "Nº de parcelas" com
 * CreditCardService::installmentsOnCart(), que usa o CARRINHO do WordPress. Na página do pedido o
 * carrinho é outro (ou vazio): o campo sumia ou mostrava valores de outra compra.
 *
 * Aqui usamos as mesmas peças do plugin, mas com o total do pedido:
 *   (new AppMaxService())->getInstallments(total do pedido, máx.)  → juros calculados pela API da AppMax
 *   CreditCardService::displayInstallments(...)                     → mesmas <option> do checkout
 * A cobrança continua do jeito do plugin (process_payment → installmentsToOrder sobre o pedido,
 * com o item "Juros"), então o que o cliente vê é o que ele paga.
 *
 * Máximo: 3x (ou menos, se o plugin estiver configurado com menos). Se a API não devolver parcelas,
 * mostra só "À vista" com o total do pedido. Para desfazer: desative este snippet.
 */
add_action('wp_footer', function () {
    if (!function_exists('is_wc_endpoint_url') || !is_wc_endpoint_url('order-pay')) return;
    global $wp;
    $id = isset($wp->query_vars['order-pay']) ? absint($wp->query_vars['order-pay']) : 0;
    $pedido = $id ? wc_get_order($id) : null;
    if (!$pedido) return;
    $total = (float) $pedido->get_total();
    if ($total <= 0) return;

    $opcoes = '';
    $svc = '\\AppMax\\WooCommerce\\Gateway\\Core\\Services\\AppMaxService';
    $cc = '\\AppMax\\WooCommerce\\Gateway\\Core\\Services\\CreditCardService';
    $con = '\\AppMax\\WooCommerce\\Gateway\\Vendor\\Piggly\\Wordpress\\Connector';
    if (class_exists($svc) && class_exists($cc) && class_exists($con)) {
        try {
            $cfg = $con::settings()->get('credit_card');
            $max = min(3, (int) $cfg->get('max_installments', 12));
            $lista = (new $svc())->getInstallments($total, max(1, $max));
            if (!empty($lista)) $opcoes = implode(' ', $cc::displayInstallments($lista, (bool) $cfg->get('show_total', false)));
        } catch (\Throwable $e) {
            $opcoes = '';
        }
    }
    if ($opcoes === '') {
        $opcoes = "<option value='1' selected='selected'>R$ " . number_format($total, 2, ',', '.') . ' à vista</option>';
    }
    $html = wp_json_encode($opcoes);
    echo '<script id="sv-parcelas-pedido">' . <<<JS
document.addEventListener('DOMContentLoaded', function () {
  var NOME = 'pagamentos_para_woocommerce_com_appmax_credit_card_installments';
  var ajustar = function () {
    var sel = document.querySelector('select[name="' + NOME + '"]');
    if (!sel) {
      // Carrinho vazio: o plugin nem imprime o campo. Cria igual ao do checkout, dentro do cartão.
      var caixa = document.querySelector('.payment_box.payment_method_pagamentos_para_woocommerce_com_appmax_credit_card');
      if (!caixa) return;
      var alvo = caixa.querySelector('.wc-credit-card-form') || caixa.querySelector('fieldset') || caixa;
      var p = document.createElement('p');
      p.className = 'form-row form-row-wide';
      p.innerHTML = '<label for="pagamentos-para-woocommerce-com-appmax-credit_card-installments">Nº de Parcelas <span class="required">*</span></label>';
      sel = document.createElement('select');
      sel.id = 'pagamentos-para-woocommerce-com-appmax-credit_card-installments';
      sel.name = NOME;
      sel.className = 'input';
      p.appendChild(sel);
      alvo.appendChild(p);
    }
    if (sel.dataset.svAjustado) return;
    sel.dataset.svAjustado = '1';
    sel.innerHTML = {$html};
  };
  ajustar();
  new MutationObserver(ajustar).observe(document.body, { childList: true, subtree: true });
});
JS
    . '</script>';
}, 100);
