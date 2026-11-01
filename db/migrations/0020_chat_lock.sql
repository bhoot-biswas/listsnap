-- One turn at a time per chat. A second tab, or Approve tapped twice, would otherwise run
-- the same turn twice: the store save is kept to one by its idempotency key, but the model
-- loop, its tool results and its replies are not. A turn claims the chat until a time, so
-- a crashed server never leaves it locked; the token lets a turn release only its own claim.

ALTER TABLE `chats`
  ADD COLUMN IF NOT EXISTS `busy_until` TIMESTAMP(3) NULL AFTER `stop_requested_at`,
  ADD COLUMN IF NOT EXISTS `busy_token` CHAR(36) NULL AFTER `busy_until`;
