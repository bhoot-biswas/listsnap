-- Listings from a video: the seller films their products while talking about them. The
-- video is media; the bulk batch it fills points at it, and watching it is a step of the
-- batch, with the same rules as a job's steps, in its own table.

ALTER TABLE `media`
  MODIFY COLUMN `kind` ENUM(
    'original', 'mask', 'cutout', 'main', 'studio', 'lifestyle', 'banner', 'ig_jpeg', 'brand',
    'look_eid', 'look_boishakh', 'look_minimal', 'look_outdoor', 'look_wedding', 'reel', 'voice', 'video'
  ) NOT NULL;

ALTER TABLE `batches` ADD COLUMN IF NOT EXISTS `video_media_id` VARCHAR(36) NULL AFTER `total`;

CREATE TABLE IF NOT EXISTS `batch_steps` (
  `batch_id` VARCHAR(36) NOT NULL,
  `step` VARCHAR(32) NOT NULL,
  `target` VARCHAR(64) NOT NULL DEFAULT '-',
  `workspace_id` VARCHAR(36) NOT NULL,
  `status` ENUM('pending', 'running', 'done', 'failed') NOT NULL DEFAULT 'pending',
  `started_at` TIMESTAMP(3) NULL,
  `finished_at` TIMESTAMP(3) NULL,
  `locked_until` TIMESTAMP(3) NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `last_error` VARCHAR(500) NULL,
  `result_json` JSON NULL,
  PRIMARY KEY (`batch_id`, `step`, `target`),
  CONSTRAINT `batch_steps_batch_fk` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
