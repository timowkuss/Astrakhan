CREATE TRIGGER products_stock_update BEFORE UPDATE OF stock ON products
WHEN NEW.stock < 0 OR NEW.stock != CAST(NEW.stock AS INTEGER)
BEGIN SELECT RAISE(ABORT, 'INVALID_STOCK'); END;
--> statement-breakpoint
CREATE TRIGGER products_stock_insert BEFORE INSERT ON products
WHEN NEW.stock < 0 OR NEW.stock != CAST(NEW.stock AS INTEGER)
BEGIN SELECT RAISE(ABORT, 'INVALID_STOCK'); END;
