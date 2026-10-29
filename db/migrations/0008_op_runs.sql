-- Operations: everything the seller (and later the chat) asks the app to do runs as a
-- named op. op_runs is their audit trail, the idempotency record (a repeated request
-- with the same key gets the saved result instead of running again), and the undo
-- history: an undoable op keeps the listing as it was before it ran.

CREATE TABLE IF NOT EXISTS `op_runs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspace_id` VARCHAR(36) NOT NULL,
  `op` VARCHAR(64) NOT NULL,
  `via` ENUM('ui', 'chat', 'pipeline') NOT NULL,
  -- the caller's retry key (a form token, a chat tool-call id); NULL when it sent none
  `idem_key` VARCHAR(100) NULL,
  `status` ENUM('running', 'done', 'failed') NOT NULL DEFAULT 'running',
  `listing_id` VARCHAR(36) NULL,
  -- which fields were touched, never their text and never photos
  `summary` VARCHAR(300) NULL,
  `result_json` JSON NULL,
  `undo_json` JSON NULL,
  `undone_at` TIMESTAMP(3) NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `op_runs_idem_uq` (`workspace_id`, `op`, `idem_key`),
  KEY `op_runs_listing_idx` (`workspace_id`, `listing_id`, `id`),
  CONSTRAINT `op_runs_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which image a generated one was made from (a scene from its cutout, a refine from
-- the scene before it), so a later version can be traced back and undone.
ALTER TABLE `media` ADD COLUMN IF NOT EXISTS `from_media_id` VARCHAR(36) NULL AFTER `listing_id`;
