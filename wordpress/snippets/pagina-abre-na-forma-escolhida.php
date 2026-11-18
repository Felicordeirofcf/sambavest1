add_filter('woocommerce_available_payment_gateways', function ($gateways) {
    if (is_admin() || !function_exists('is_wc_endpoint_url') || !is_wc_endpoint_url('order-pay')) return $gateways;
    $pedido = wc_get_order(absint(get_query_var('order-pay')));
    if (!$pedido) return $gateways;
    $escolhido = $pedido->get_payment_method();
    if (!isset($gateways[$escolhido])) return $gateways;
    foreach ($gateways as $id => $g) { $g->chosen = ($id === $escolhido); }
    return [$escolhido => $gateways[$escolhido]] + $gateways;
}, 100);
