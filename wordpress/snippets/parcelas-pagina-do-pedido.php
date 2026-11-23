/*
 * Samba Vest — Parcelas na página de pagamento do pedido (order-pay)
 *
 * O plugin "Pagamentos com AppMax para WooCommerce" (1.1.1-beta) monta as opções de
 * "Nº de parcelas" pelo CARRINHO do WordPress (installmentsOnCart), não pelo pedido. Na página
 * de pagamento do pedido o carrinho costuma estar vazio (o carrinho do site é outro): o campo,
 * obrigatório, vinha sem opções ou com valores de outra compra.
 *
 * Este snippet troca as opções por uma só, "À vista" com o total DO PEDIDO (valor 1), que é o
 * que o plugin cobra quando a parcela é 1 (process_payment usa $order->get_total()).
 * Para desfazer: desative este snippet.
 */
add_action('wp_footer', function () {
    if (!function_exists('is_wc_endpoint_url') || !is_wc_endpoint_url('order-pay')) return;
    global $wp;
    $id = isset($wp->query_vars['order-pay']) ? absint($wp->query_vars['order-pay']) : 0;
    $pedido = $id ? wc_get_order($id) : null;
    if (!$pedido) return;
    $total = 'R$ ' . number_format((float) $pedido->get_total(), 2, ',', '.');
    $rotulo = wp_json_encode('À vista · ' . $total);
    echo '<script id="sv-parcelas-pedido">' . <<<JS
document.addEventListener('DOMContentLoaded', function () {
  var ajustar = function () {
    var sel = document.querySelector('select[name="pagamentos_para_woocommerce_com_appmax_credit_card_installments"]');
    if (!sel || sel.dataset.svAjustado) return;
    sel.dataset.svAjustado = '1';
    sel.innerHTML = '';
    var op = document.createElement('option');
    op.value = '1';
    op.textContent = {$rotulo};
    op.selected = true;
    sel.appendChild(op);
  };
  ajustar();
  // O formulário do cartão pode ser montado depois (troca de aba Pix/Cartão)
  new MutationObserver(ajustar).observe(document.body, { childList: true, subtree: true });
});
JS
    . '</script>';
}, 100);
