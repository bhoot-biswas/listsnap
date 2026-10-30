-- The shop's brand kit setting photo: a picture of the seller's own shop, table or display
-- corner that lifestyle photos are set in. It belongs to the shop, not to a listing.

ALTER TABLE `media`
  MODIFY COLUMN `kind` ENUM('original', 'mask', 'cutout', 'main', 'studio', 'lifestyle', 'banner', 'ig_jpeg', 'brand') NOT NULL;
