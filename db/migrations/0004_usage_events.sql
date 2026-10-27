-- Every outside call is logged (Under the hood panel, Usage page, README cost numbers).
-- Daily counters back the usage limits; ip_daily stores a hash, never the address.

CREATE TABLE IF NOT EXISTS `api_calls` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspace_id` VARCHAR(36) NOT NULL,
  `job_id` VARCHAR(36) NULL,
  `provider` VARCHAR(16) NOT NULL,
  `model` VARCHAR(64) NOT NULL,
  `endpoint` VARCHAR(64) NOT NULL,
  `step` VARCHAR(32) NOT NULL,
  `mode` ENUM('mock', 'live') NOT NULL,
  `ms` INT NOT NULL,
  `cost_usd` DECIMAL(10, 6) NOT NULL DEFAULT 0,
  `ok` BOOLEAN NOT NULL,
  `summary` VARCHAR(300) NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `api_calls_job_idx` (`job_id`, `id`),
  KEY `api_calls_workspace_created_idx` (`workspace_id`, `created_at`),
  CONSTRAINT `api_calls_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usage_daily` (
  `workspace_id` VARCHAR(36) NOT NULL,
  `date` DATE NOT NULL,
  `listings` INT NOT NULL DEFAULT 0,
  `images` INT NOT NULL DEFAULT 0,
  `cost_usd` DECIMAL(10, 6) NOT NULL DEFAULT 0,
  PRIMARY KEY (`workspace_id`, `date`),
  CONSTRAINT `usage_daily_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ip_daily` (
  `ip_hash` CHAR(64) NOT NULL,
  `date` DATE NOT NULL,
  `listings` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`ip_hash`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspace_id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(40) NOT NULL,
  `ref_id` VARCHAR(36) NULL,
  `data_json` JSON NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `events_workspace_created_idx` (`workspace_id`, `created_at`),
  CONSTRAINT `events_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
