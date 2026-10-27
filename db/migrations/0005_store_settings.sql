-- Per-connection choices made when connecting: the default category, or that the shop
-- uses the shared demo store for now. Kept apart from checks_json, which each re-check
-- overwrites.

ALTER TABLE `store_connections` ADD COLUMN IF NOT EXISTS `settings_json` JSON NULL AFTER `checks_json`;
