-- AlterEnum
ALTER TABLE `auction_events` MODIFY `outbox_status` ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `auction_events`
  ADD COLUMN `publish_attempt_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `publish_claimed_by` VARCHAR(80) NULL,
  ADD COLUMN `publish_claimed_until` DATETIME(3) NULL,
  ADD COLUMN `last_publish_error` VARCHAR(500) NULL;

-- CreateIndex
CREATE INDEX `auction_events_outbox_status_publish_claimed_until_idx` ON `auction_events`(`outbox_status`, `publish_claimed_until`);
