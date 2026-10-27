-- The pipeline: a job starts from one upload and ends as one or more
-- listings. job_steps holds each step's state, lock and saved result, so a refresh,
-- a second tab or a restart repeats nothing that already finished.

CREATE TABLE IF NOT EXISTS `batches` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `workspace_id` VARCHAR(36) NOT NULL,
  `total` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `batches_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `jobs` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `workspace_id` VARCHAR(36) NOT NULL,
  `batch_id` VARCHAR(36) NULL,
  `status` ENUM('processing', 'awaiting_choice', 'ready', 'failed') NOT NULL DEFAULT 'processing',
  `group_mode` ENUM('single', 'pair', 'identical', 'separate', 'set', 'variants', 'angles') NULL,
  `camera_angle` ENUM('top_down', 'side', 'angled') NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `jobs_workspace_created_idx` (`workspace_id`, `created_at`),
  CONSTRAINT `jobs_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `jobs_batch_fk` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- target: '-' for job-level steps, a listing id, or 'listingId:scene' for renders.
CREATE TABLE IF NOT EXISTS `job_steps` (
  `job_id` VARCHAR(36) NOT NULL,
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
  PRIMARY KEY (`job_id`, `step`, `target`),
  CONSTRAINT `job_steps_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `media` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `workspace_id` VARCHAR(36) NOT NULL,
  `kind` ENUM('original', 'mask', 'cutout', 'main', 'studio', 'lifestyle', 'banner', 'ig_jpeg') NOT NULL,
  `path` VARCHAR(255) NOT NULL,
  `mime` VARCHAR(32) NOT NULL,
  `bytes` INT NOT NULL,
  `width` INT NOT NULL,
  `height` INT NOT NULL,
  `listing_id` VARCHAR(36) NULL,
  `selected` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `media_workspace_kind_idx` (`workspace_id`, `kind`, `created_at`),
  KEY `media_listing_idx` (`listing_id`),
  CONSTRAINT `media_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `photos` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `job_id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `media_id` VARCHAR(36) NOT NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `width` INT NOT NULL,
  `height` INT NOT NULL,
  `check_json` JSON NULL,
  KEY `photos_job_idx` (`job_id`),
  CONSTRAINT `photos_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `photos_media_fk` FOREIGN KEY (`media_id`) REFERENCES `media` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `items` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `photo_id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `instance_idx` INT NOT NULL,
  `box_json` JSON NOT NULL,
  `score` DECIMAL(4, 3) NULL,
  `mask_media_id` VARCHAR(36) NULL,
  `cutout_media_id` VARCHAR(36) NULL,
  `color` VARCHAR(40) NULL,
  `kept` BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY `items_photo_instance_uq` (`photo_id`, `instance_idx`),
  CONSTRAINT `items_photo_fk` FOREIGN KEY (`photo_id`) REFERENCES `photos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `listings` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `job_id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `item_ids_json` JSON NOT NULL,
  `status` ENUM('processing', 'needs_review', 'ready', 'in_store', 'posted', 'failed') NOT NULL DEFAULT 'processing',
  `fields_json` JSON NULL,
  `confidence` DECIMAL(3, 2) NULL,
  `check_notes` JSON NULL,
  `stock_qty` INT NULL,
  `wc_product_id` BIGINT NULL,
  `ig_container_ids` JSON NULL,
  `ig_media_id` VARCHAR(64) NULL,
  `sent_at` TIMESTAMP(3) NULL,
  `posted_at` TIMESTAMP(3) NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `listings_workspace_status_idx` (`workspace_id`, `status`, `updated_at`),
  KEY `listings_job_idx` (`job_id`),
  CONSTRAINT `listings_job_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
