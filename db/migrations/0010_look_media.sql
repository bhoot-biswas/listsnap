-- Campaign looks: the seller asks for the product photographed for an occasion (Eid,
-- Pohela Boishakh, a wedding). One kind per look, so a photo says which look it is.

ALTER TABLE `media`
  MODIFY COLUMN `kind` ENUM(
    'original', 'mask', 'cutout', 'main', 'studio', 'lifestyle', 'banner', 'ig_jpeg', 'brand',
    'look_eid', 'look_boishakh', 'look_minimal', 'look_outdoor', 'look_wedding'
  ) NOT NULL;
