CREATE TRIGGER category_parent_insert BEFORE INSERT ON categories
WHEN NEW.parent_id IS NOT NULL AND (NEW.parent_id=NEW.id OR NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.parent_id AND parent_id IS NULL))
BEGIN SELECT RAISE(ABORT, 'INVALID_CATEGORY_PARENT'); END;
--> statement-breakpoint
CREATE TRIGGER category_parent_update BEFORE UPDATE OF parent_id ON categories
WHEN NEW.parent_id IS NOT NULL AND (NEW.parent_id=NEW.id OR NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.parent_id AND parent_id IS NULL) OR EXISTS (SELECT 1 FROM categories WHERE parent_id=NEW.id))
BEGIN SELECT RAISE(ABORT, 'INVALID_CATEGORY_PARENT'); END;
--> statement-breakpoint
CREATE TRIGGER category_delete_children BEFORE DELETE ON categories
WHEN EXISTS (SELECT 1 FROM categories WHERE parent_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'CATEGORY_HAS_CHILDREN'); END;
