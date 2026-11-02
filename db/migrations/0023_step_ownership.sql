-- Who owns a running step: claiming one writes a fresh token, and finishing it needs the
-- same token. A run that outlived its lock (and was claimed again by the next poll) then
-- can't overwrite the newer run's result or mark its finished work failed.
ALTER TABLE `job_steps` ADD COLUMN IF NOT EXISTS `claim_token` CHAR(36) NULL AFTER `locked_until`;
ALTER TABLE `batch_steps` ADD COLUMN IF NOT EXISTS `claim_token` CHAR(36) NULL AFTER `locked_until`;

-- How long a running op may hold its idempotency key. A run that died with the process (a
-- deploy, a crash) used to keep the key forever, so the same approval said "busy" for good.
ALTER TABLE `op_runs` ADD COLUMN IF NOT EXISTS `lease_until` TIMESTAMP(3) NULL AFTER `status`;

-- The products a video's watch found, kept before its jobs are made, so a watch that stops
-- between two products carries on from the next one instead of losing the rest.
ALTER TABLE `batches` ADD COLUMN IF NOT EXISTS `products_json` JSON NULL;
