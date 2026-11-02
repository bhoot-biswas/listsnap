-- A demo shop is free to make, so what one visitor spends across all their demo shops is
-- counted by address too: videos (disk and the video model), AI photos, and chat,
-- dictation and assist calls. Only listings were counted this way before.

ALTER TABLE `ip_daily` ADD COLUMN IF NOT EXISTS `videos` INT NOT NULL DEFAULT 0 AFTER `listings`;
ALTER TABLE `ip_daily` ADD COLUMN IF NOT EXISTS `images` INT NOT NULL DEFAULT 0 AFTER `videos`;
ALTER TABLE `ip_daily` ADD COLUMN IF NOT EXISTS `ai_calls` INT NOT NULL DEFAULT 0 AFTER `images`;
