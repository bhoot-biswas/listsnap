<?php
// Configures the demo store for ListSnap and prints a fresh REST key pair:
//   sudo -u www-data wp eval-file /srv/listsnap/deploy/store-setup.php --path=/var/www/store
// Running it again replaces the old ListSnap key. Same steps as scripts/store-setup.mjs locally.

update_option('woocommerce_currency', 'BDT');
// the color attribute ListSnap uses for colour variants
if (!wc_attribute_taxonomy_id_by_name('Color')) {
    wc_create_attribute(['name' => 'Color', 'slug' => 'color']);
}

global $wpdb;
$table = $wpdb->prefix . 'woocommerce_api_keys';
$wpdb->delete($table, ['description' => 'ListSnap']);
$admin = get_users(['role' => 'administrator', 'number' => 1])[0];
$key = 'ck_' . wc_rand_hash();
$secret = 'cs_' . wc_rand_hash();
$wpdb->insert($table, [
    'user_id' => $admin->ID,
    'description' => 'ListSnap',
    'permissions' => 'read_write',
    'consumer_key' => wc_api_hash($key),
    'consumer_secret' => $secret,
    'truncated_key' => substr($key, -7),
]);

echo "DEMO_WOO_URL=https://store.getlistsnap.com\n";
echo "DEMO_WOO_KEY=$key\n";
echo "DEMO_WOO_SECRET=$secret\n";
