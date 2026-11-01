-- The seller's Stop for a chat turn. A dropped connection must not end a turn (it keeps
-- running and is stored for the next visit), so Stop is its own request that marks the
-- chat; the turn checks the mark between steps and ends there. Each new turn clears it.

ALTER TABLE `chats` ADD COLUMN IF NOT EXISTS `stop_requested_at` TIMESTAMP(3) NULL AFTER `title`;
