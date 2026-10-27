-- Workspaces: every app row belongs to one. One owner per workspace for now.
-- Demo workspaces ("Try the demo") expire after 24 hours and are deleted by the cleanup.

CREATE TABLE IF NOT EXISTS `workspaces` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `is_demo` BOOLEAN NOT NULL DEFAULT FALSE,
  `expires_at` TIMESTAMP(3) NULL,
  `onboarded_at` TIMESTAMP(3) NULL,
  `settings_json` JSON NOT NULL,
  `daily_listing_limit` INT NOT NULL DEFAULT 20,
  `daily_image_limit` INT NOT NULL DEFAULT 60,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `workspaces_demo_expiry_idx` (`is_demo`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `memberships` (
  `user_id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `role` ENUM('owner') NOT NULL DEFAULT 'owner',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `workspace_id`),
  KEY `memberships_workspace_idx` (`workspace_id`),
  CONSTRAINT `memberships_user_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `memberships_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `store_connections` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `workspace_id` VARCHAR(36) NOT NULL,
  `kind` ENUM('woo', 'instagram') NOT NULL,
  `base_url` VARCHAR(255),
  `credentials_enc` TEXT,
  `status` ENUM('connected', 'broken', 'disconnected') NOT NULL DEFAULT 'disconnected',
  `checks_json` JSON,
  `last_checked_at` TIMESTAMP(3) NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `store_connections_kind_uq` (`workspace_id`, `kind`),
  CONSTRAINT `store_connections_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
