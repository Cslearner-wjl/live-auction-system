-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(80) NOT NULL,
    `masked_name` VARCHAR(80) NOT NULL,
    `role` ENUM('admin', 'bidder') NOT NULL DEFAULT 'bidder',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `users_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `live_rooms` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `host_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('LIVE', 'CLOSED') NOT NULL DEFAULT 'LIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `live_rooms_host_user_id_idx`(`host_user_id`),
    INDEX `live_rooms_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auction_items` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `image_url` VARCHAR(500) NOT NULL,
    `description` TEXT NOT NULL,
    `selling_points` JSON NOT NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `auction_items_name_idx`(`name`),
    INDEX `auction_items_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auction_rules` (
    `id` VARCHAR(191) NOT NULL,
    `start_price_fen` INTEGER NOT NULL,
    `increment_fen` INTEGER NOT NULL,
    `duration_seconds` INTEGER NOT NULL,
    `cap_price_fen` INTEGER NOT NULL,
    `anti_sniping_window_seconds` INTEGER NOT NULL DEFAULT 0,
    `extension_seconds` INTEGER NOT NULL DEFAULT 0,
    `max_extension_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auction_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `rule_id` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'RUNNING', 'ENDED_SOLD', 'ENDED_UNSOLD', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `start_time` DATETIME(3) NULL,
    `end_time` DATETIME(3) NULL,
    `start_price_fen` INTEGER NOT NULL,
    `current_price_fen` INTEGER NOT NULL,
    `increment_fen` INTEGER NOT NULL,
    `cap_price_fen` INTEGER NOT NULL,
    `highest_bidder_id` VARCHAR(191) NULL,
    `bid_count` INTEGER NOT NULL DEFAULT 0,
    `extended_count` INTEGER NOT NULL DEFAULT 0,
    `server_seq` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auction_sessions_rule_id_key`(`rule_id`),
    INDEX `auction_sessions_room_id_idx`(`room_id`),
    INDEX `auction_sessions_item_id_idx`(`item_id`),
    INDEX `auction_sessions_status_idx`(`status`),
    INDEX `auction_sessions_start_time_idx`(`start_time`),
    INDEX `auction_sessions_end_time_idx`(`end_time`),
    INDEX `auction_sessions_highest_bidder_id_idx`(`highest_bidder_id`),
    INDEX `auction_sessions_room_id_status_idx`(`room_id`, `status`),
    INDEX `auction_sessions_status_end_time_idx`(`status`, `end_time`),
    INDEX `auction_sessions_item_id_status_idx`(`item_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bids` (
    `id` VARCHAR(191) NOT NULL,
    `auction_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `amount_fen` INTEGER NOT NULL,
    `client_bid_id` VARCHAR(191) NOT NULL,
    `server_seq` INTEGER NOT NULL,
    `status` ENUM('ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'ACCEPTED',
    `reject_reason` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bids_auction_id_idx`(`auction_id`),
    INDEX `bids_user_id_idx`(`user_id`),
    INDEX `bids_amount_fen_idx`(`amount_fen`),
    INDEX `bids_status_idx`(`status`),
    INDEX `bids_created_at_idx`(`created_at`),
    INDEX `bids_auction_id_server_seq_idx`(`auction_id`, `server_seq`),
    INDEX `bids_auction_id_amount_fen_idx`(`auction_id`, `amount_fen`),
    UNIQUE INDEX `bids_auction_id_client_bid_id_key`(`auction_id`, `client_bid_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `auction_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `buyer_id` VARCHAR(191) NOT NULL,
    `amount_fen` INTEGER NOT NULL,
    `status` ENUM('PENDING_PAYMENT', 'PAID', 'CLOSED') NOT NULL DEFAULT 'PENDING_PAYMENT',
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_auction_id_key`(`auction_id`),
    INDEX `orders_item_id_idx`(`item_id`),
    INDEX `orders_buyer_id_idx`(`buyer_id`),
    INDEX `orders_status_idx`(`status`),
    INDEX `orders_buyer_id_status_idx`(`buyer_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auction_events` (
    `id` VARCHAR(191) NOT NULL,
    `auction_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `type` ENUM('AUCTION_STARTED', 'AUCTION_SNAPSHOT', 'BID_ACCEPTED', 'BID_REJECTED', 'OUTBID', 'LEADING', 'AUCTION_EXTENDED', 'AUCTION_ENDED', 'ORDER_CREATED', 'AUCTION_CANCELLED', 'PING', 'PONG') NOT NULL,
    `server_seq` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `outbox_status` ENUM('PENDING', 'PUBLISHED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `auction_events_auction_id_idx`(`auction_id`),
    INDEX `auction_events_room_id_idx`(`room_id`),
    INDEX `auction_events_type_idx`(`type`),
    INDEX `auction_events_outbox_status_idx`(`outbox_status`),
    INDEX `auction_events_created_at_idx`(`created_at`),
    INDEX `auction_events_outbox_status_created_at_idx`(`outbox_status`, `created_at`),
    UNIQUE INDEX `auction_events_auction_id_server_seq_key`(`auction_id`, `server_seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `action` VARCHAR(80) NOT NULL,
    `auction_id` VARCHAR(191) NULL,
    `room_id` VARCHAR(191) NULL,
    `client_bid_id` VARCHAR(191) NULL,
    `event_id` VARCHAR(191) NULL,
    `metadata` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_actor_user_id_idx`(`actor_user_id`),
    INDEX `audit_logs_action_idx`(`action`),
    INDEX `audit_logs_auction_id_idx`(`auction_id`),
    INDEX `audit_logs_room_id_idx`(`room_id`),
    INDEX `audit_logs_client_bid_id_idx`(`client_bid_id`),
    INDEX `audit_logs_event_id_idx`(`event_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `live_rooms` ADD CONSTRAINT `live_rooms_host_user_id_fkey` FOREIGN KEY (`host_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auction_items` ADD CONSTRAINT `auction_items_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auction_sessions` ADD CONSTRAINT `auction_sessions_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `live_rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auction_sessions` ADD CONSTRAINT `auction_sessions_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `auction_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auction_sessions` ADD CONSTRAINT `auction_sessions_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `auction_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auction_sessions` ADD CONSTRAINT `auction_sessions_highest_bidder_id_fkey` FOREIGN KEY (`highest_bidder_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bids` ADD CONSTRAINT `bids_auction_id_fkey` FOREIGN KEY (`auction_id`) REFERENCES `auction_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bids` ADD CONSTRAINT `bids_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_auction_id_fkey` FOREIGN KEY (`auction_id`) REFERENCES `auction_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `auction_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auction_events` ADD CONSTRAINT `auction_events_auction_id_fkey` FOREIGN KEY (`auction_id`) REFERENCES `auction_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auction_events` ADD CONSTRAINT `auction_events_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `live_rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_auction_id_fkey` FOREIGN KEY (`auction_id`) REFERENCES `auction_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `live_rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `auction_events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
