-- CreateTable
CREATE TABLE `ai_auction_insights` (
    `id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NULL,
    `auction_id` VARCHAR(191) NULL,
    `source` VARCHAR(20) NOT NULL DEFAULT 'mock',
    `target_audience` JSON NOT NULL,
    `selling_point_tags` JSON NOT NULL,
    `live_script` TEXT NOT NULL,
    `atmosphere_copy` TEXT NOT NULL,
    `suggested_start_price_fen` INTEGER NULL,
    `suggested_deal_min_fen` INTEGER NULL,
    `suggested_deal_max_fen` INTEGER NULL,
    `suggested_cap_price_fen` INTEGER NULL,
    `caution_price_fen` INTEGER NULL,
    `price_reasoning` TEXT NOT NULL,
    `risk_notes` JSON NOT NULL,
    `confidence` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `input_snapshot` JSON NOT NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_auction_insights_item_id_idx`(`item_id`),
    INDEX `ai_auction_insights_auction_id_idx`(`auction_id`),
    INDEX `ai_auction_insights_created_by_id_idx`(`created_by_id`),
    INDEX `ai_auction_insights_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_auction_insights` ADD CONSTRAINT `ai_auction_insights_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `auction_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_auction_insights` ADD CONSTRAINT `ai_auction_insights_auction_id_fkey` FOREIGN KEY (`auction_id`) REFERENCES `auction_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_auction_insights` ADD CONSTRAINT `ai_auction_insights_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
