// Sets up the local WooCommerce test store (docker compose profile "store") and writes
// its REST keys into .env.local as the demo store, so the live WooCommerce client can
// be tried without a hosted shop. Safe to run again: it only adds what's missing and
// replaces the ListSnap API key each time.
//
//   pnpm store:setup
//
// Keys and the admin password go into .env.local only; nothing secret is printed.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PORT = process.env.STORE_PORT || "8080";
const URL = `http://localhost:${PORT}`;
const ENV_FILE = ".env.local";

const compose = (...args) =>
  execFileSync("docker", ["compose", "--profile", "store", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
const wp = (...args) => compose("run", "--rm", "-T", "store-cli", "wp", ...args).trim();
const wpOk = (...args) => {
  try {
    wp(...args);
    return true;
  } catch {
    return false;
  }
};

function readEnv() {
  return existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
}

/** Sets or replaces KEY=value lines in .env.local, leaving every other line alone. */
function setEnv(values) {
  let text = readEnv();
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n*$/, "\n")}${line}\n`;
  }
  writeFileSync(ENV_FILE, text);
}

console.log("Starting the test store…");
compose("up", "-d", "--wait", "store");

if (!wpOk("core", "is-installed")) {
  const password = randomBytes(12).toString("base64url");
  console.log("Installing WordPress…");
  wp(
    "core",
    "install",
    `--url=${URL}`,
    "--title=ListSnap test store",
    "--admin_user=admin",
    `--admin_password=${password}`,
    "--admin_email=admin@listsnap.test",
    "--skip-email",
  );
  setEnv({ STORE_ADMIN_PASSWORD: password });
}

// pretty links make /wp-json/ answer, which the REST API needs
wp("rewrite", "structure", "/%postname%/", "--hard");

if (!wpOk("plugin", "is-active", "woocommerce")) {
  console.log("Installing WooCommerce…");
  wp("plugin", "install", "woocommerce", "--activate");
}

console.log("Configuring the shop and creating API keys…");
const php = `
update_option('woocommerce_currency', 'BDT');
if (!wc_attribute_taxonomy_id_by_name('Color')) wc_create_attribute(['name' => 'Color', 'slug' => 'color']);
global $wpdb;
$table = $wpdb->prefix . 'woocommerce_api_keys';
$wpdb->delete($table, ['description' => 'ListSnap local']);
$user = get_user_by('login', 'admin');
$key = 'ck_' . wc_rand_hash();
$secret = 'cs_' . wc_rand_hash();
$wpdb->insert($table, [
  'user_id' => $user->ID,
  'description' => 'ListSnap local',
  'permissions' => 'read_write',
  'consumer_key' => wc_api_hash($key),
  'consumer_secret' => $secret,
  'truncated_key' => substr($key, -7),
]);
echo $key . ' ' . $secret;
`;
const [key, secret] = wp("eval", php).split(/\s+/).slice(-2);
if (!key?.startsWith("ck_") || !secret?.startsWith("cs_")) throw new Error("Could not create WooCommerce API keys.");

setEnv({
  DEMO_WOO_URL: URL,
  DEMO_WOO_KEY: key,
  DEMO_WOO_SECRET: secret,
  // the store container reaches the app on the host through this name
  MEDIA_FETCH_BASE_URL: "http://host.docker.internal:3000",
});

console.log(`Test store ready at ${URL} (admin user "admin", password in ${ENV_FILE} as STORE_ADMIN_PASSWORD).`);
console.log(`REST keys written to ${ENV_FILE}. Set PROVIDER_MODE_WOO=live there to use it.`);
