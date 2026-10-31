-- Archived listings and jobs: hidden from the lists, the dashboard and the media library,
-- but kept, so the seller can bring them back. Archiving a job archives its listings at
-- the same moment, which is how restoring the job finds the ones to restore with it.

ALTER TABLE `listings` ADD COLUMN IF NOT EXISTS `archived_at` TIMESTAMP(3) NULL AFTER `edited_at`;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `archived_at` TIMESTAMP(3) NULL;
