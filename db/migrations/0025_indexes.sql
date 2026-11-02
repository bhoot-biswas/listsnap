-- Indexes for queries that read more than they need to. Each one names the query it serves;
-- without them those queries read whole tables (some across every shop) and sort afterwards,
-- and they get slower as the platform grows rather than as one shop does.

-- Media page and the nightly cutout sweep: which item, if any, a cutout belongs to, and
-- whether any image was made from this one.
ALTER TABLE `items` ADD INDEX IF NOT EXISTS `items_cutout_idx` (`cutout_media_id`);
ALTER TABLE `items` ADD INDEX IF NOT EXISTS `items_cutout_png_idx` (`cutout_png_media_id`);
ALTER TABLE `media` ADD INDEX IF NOT EXISTS `media_from_idx` (`from_media_id`);

-- Connections page: a shop's last failed save to one store.
ALTER TABLE `job_steps` ADD INDEX IF NOT EXISTS `job_steps_ws_step_idx` (`workspace_id`, `step`, `status`, `finished_at`);

-- Dashboard activity and Usage's call log: a shop's newest rows of a few types.
ALTER TABLE `events` ADD INDEX IF NOT EXISTS `events_ws_type_idx` (`workspace_id`, `type`, `id`);
ALTER TABLE `api_calls` ADD INDEX IF NOT EXISTS `api_calls_ws_provider_idx` (`workspace_id`, `provider`, `id`);
