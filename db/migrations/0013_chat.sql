-- The shop assistant. A chat belongs to one listing, or to the whole shop when
-- listing_id is NULL; a listing can start a new chat, so old turns stop filling the
-- model's context. Messages are stored in the order the model saw them, including tool
-- calls and their results, so a conversation (and an approval card still waiting for
-- the seller) survives a reload. Results hold what the ops returned, never photos.

CREATE TABLE IF NOT EXISTS `chats` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `workspace_id` VARCHAR(36) NOT NULL,
  `listing_id` VARCHAR(36) NULL,
  -- the seller's first message, cut short, for a list of chats
  `title` VARCHAR(120) NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `chats_listing_idx` (`workspace_id`, `listing_id`, `created_at`),
  CONSTRAINT `chats_workspace_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chats_listing_fk` FOREIGN KEY (`listing_id`) REFERENCES `listings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `chat_id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `role` ENUM('user', 'assistant', 'tool') NOT NULL,
  `body_json` JSON NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `chat_messages_chat_idx` (`workspace_id`, `chat_id`, `id`),
  CONSTRAINT `chat_messages_chat_fk` FOREIGN KEY (`chat_id`) REFERENCES `chats` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
