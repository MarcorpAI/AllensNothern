-- Development seed data. All IDs are stable so this file can be run repeatedly
-- without duplicating menu records or replacing unrelated local test data.

insert into operating_hours(weekday, opens_at, closes_at) values
  (0, '12:00', '22:00'),
  (1, '12:00', '22:00'),
  (2, '12:00', '22:00'),
  (3, '12:00', '22:00'),
  (4, '12:00', '22:00'),
  (5, '12:00', '23:00'),
  (6, '12:00', '23:00')
on conflict (weekday, opens_at) do update set closes_at = excluded.closes_at;

insert into delivery_zones(
  id, name, area, delivery_fee_kurus, priority, is_active
) values (
  '10000000-0000-4000-8000-000000000001',
  'Sample Istanbul Zone',
  ST_GeogFromText('POLYGON((28.94 41.00,29.04 41.00,29.04 41.08,28.94 41.08,28.94 41.00))'),
  7500,
  100,
  true
)
on conflict (id) do update set
  name = excluded.name,
  area = excluded.area,
  delivery_fee_kurus = excluded.delivery_fee_kurus,
  priority = excluded.priority,
  is_active = excluded.is_active;

insert into categories(id, name_en, name_tr, sort_order, is_active) values
  ('20000000-0000-4000-8000-000000000001', 'Rice Dishes', 'Rice Dishes', 10, true),
  ('20000000-0000-4000-8000-000000000002', 'Soups & Swallows', 'Soups & Swallows', 20, true),
  ('20000000-0000-4000-8000-000000000003', 'Grills & Proteins', 'Grills & Proteins', 30, true),
  ('20000000-0000-4000-8000-000000000004', 'Sides & Small Chops', 'Sides & Small Chops', 40, true)
on conflict (id) do update set
  name_en = excluded.name_en,
  name_tr = excluded.name_tr,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into menu_items(
  id,
  category_id,
  name_en,
  name_tr,
  description_en,
  description_tr,
  price_kurus,
  image_url,
  image_variants,
  image_storage_paths,
  is_available,
  is_published,
  sort_order
) values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Jollof Rice & Grilled Chicken',
    'Jollof Rice & Grilled Chicken',
    'Smoky Nigerian party jollof with grilled chicken, fried plantain and fresh slaw.',
    'Smoky Nigerian party jollof with grilled chicken, fried plantain and fresh slaw.',
    32500,
    '/seed-menu/nigerian-jollof-chicken.png',
    '{"card":"/seed-menu/nigerian-jollof-chicken.png","detail":"/seed-menu/nigerian-jollof-chicken.png"}'::jsonb,
    '[]'::jsonb,
    true,
    true,
    10
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Nigerian Fried Rice & Chicken',
    'Nigerian Fried Rice & Chicken',
    'Seasoned fried rice with mixed vegetables, fried chicken and ripe plantain.',
    'Seasoned fried rice with mixed vegetables, fried chicken and ripe plantain.',
    31500,
    '/seed-menu/nigerian-fried-rice-chicken.png',
    '{"card":"/seed-menu/nigerian-fried-rice-chicken.png","detail":"/seed-menu/nigerian-fried-rice-chicken.png"}'::jsonb,
    '[]'::jsonb,
    true,
    true,
    20
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    'Egusi Soup & Pounded Yam',
    'Egusi Soup & Pounded Yam',
    'Rich melon-seed soup with greens and assorted meat, served with smooth pounded yam.',
    'Rich melon-seed soup with greens and assorted meat, served with smooth pounded yam.',
    39500,
    '/seed-menu/egusi-pounded-yam.png',
    '{"card":"/seed-menu/egusi-pounded-yam.png","detail":"/seed-menu/egusi-pounded-yam.png"}'::jsonb,
    '[]'::jsonb,
    true,
    true,
    10
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000002',
    'Efo Riro & Amala',
    'Efo Riro & Amala',
    'Deeply seasoned spinach stew with tender beef, served with soft amala.',
    'Deeply seasoned spinach stew with tender beef, served with soft amala.',
    38500,
    '/seed-menu/efo-riro-amala.png',
    '{"card":"/seed-menu/efo-riro-amala.png","detail":"/seed-menu/efo-riro-amala.png"}'::jsonb,
    '[]'::jsonb,
    true,
    true,
    20
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000003',
    'Beef Suya',
    'Beef Suya',
    'Yaji-spiced grilled beef with onion, tomato, cucumber and cabbage.',
    'Yaji-spiced grilled beef with onion, tomato, cucumber and cabbage.',
    34500,
    '/seed-menu/beef-suya.png',
    '{"card":"/seed-menu/beef-suya.png","detail":"/seed-menu/beef-suya.png"}'::jsonb,
    '[]'::jsonb,
    true,
    true,
    10
  ),
  (
    '30000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000003',
    'Peppered Chicken',
    'Peppered Chicken',
    'Bone-in chicken tossed in a rich, spicy Nigerian red-pepper sauce.',
    'Bone-in chicken tossed in a rich, spicy Nigerian red-pepper sauce.',
    29500,
    '/seed-menu/peppered-chicken.png',
    '{"card":"/seed-menu/peppered-chicken.png","detail":"/seed-menu/peppered-chicken.png"}'::jsonb,
    '[]'::jsonb,
    true,
    true,
    20
  ),
  (
    '30000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000004',
    'Moi Moi',
    'Moi Moi',
    'Steamed seasoned bean pudding with a boiled egg centre and pepper sauce.',
    'Steamed seasoned bean pudding with a boiled egg centre and pepper sauce.',
    14500,
    '/seed-menu/moi-moi.png',
    '{"card":"/seed-menu/moi-moi.png","detail":"/seed-menu/moi-moi.png"}'::jsonb,
    '[]'::jsonb,
    true,
    true,
    10
  ),
  (
    '30000000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000004',
    'Puff Puff',
    'Puff Puff',
    'Golden Nigerian fried dough bites with a soft, airy centre.',
    'Golden Nigerian fried dough bites with a soft, airy centre.',
    12000,
    '/seed-menu/puff-puff.png',
    '{"card":"/seed-menu/puff-puff.png","detail":"/seed-menu/puff-puff.png"}'::jsonb,
    '[]'::jsonb,
    true,
    true,
    20
  )
on conflict (id) do update set
  category_id = excluded.category_id,
  name_en = excluded.name_en,
  name_tr = excluded.name_tr,
  description_en = excluded.description_en,
  description_tr = excluded.description_tr,
  price_kurus = excluded.price_kurus,
  image_url = excluded.image_url,
  image_variants = excluded.image_variants,
  image_storage_paths = excluded.image_storage_paths,
  is_available = excluded.is_available,
  is_published = excluded.is_published,
  sort_order = excluded.sort_order;

-- Remove the original one-item Turkish-oriented development sample only. This
-- intentionally does not touch administrator-created menu content.
delete from menu_items
where name_en = 'Northern Grill'
  and description_en = 'Char-grilled chicken with seasonal sides.';

delete from categories category
where category.name_en = 'Mains'
  and not exists (select 1 from menu_items item where item.category_id = category.id);
