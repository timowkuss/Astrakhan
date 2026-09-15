CREATE TABLE `cart_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `carts` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `cart_version` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_cart_version` ON `orders` (`user_id`,`cart_version`);--> statement-breakpoint
CREATE TRIGGER orders_cart_version BEFORE INSERT ON orders
WHEN NEW.cart_version IS NOT NULL AND NOT EXISTS (SELECT 1 FROM carts WHERE id=NEW.user_id AND revision=NEW.cart_version)
BEGIN SELECT RAISE(ABORT, 'CART_CHANGED'); END;
