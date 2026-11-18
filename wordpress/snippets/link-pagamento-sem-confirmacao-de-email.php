add_filter('woocommerce_order_email_verification_required', function ($exigir, $pedido, $contexto) {
    return $contexto === 'order-pay' ? false : $exigir;
}, 10, 3);
