-- Real restaurant menu with stable IDs. Prices marked TEMPORARY should be
-- reviewed in Admin -> Food & prices before production launch.

insert into operating_hours(weekday, opens_at, closes_at) values
  (0,'12:00','22:00'),(1,'12:00','22:00'),(2,'12:00','22:00'),
  (3,'12:00','22:00'),(4,'12:00','22:00'),(5,'12:00','23:00'),(6,'12:00','23:00')
on conflict (weekday,opens_at) do update set closes_at=excluded.closes_at;

insert into delivery_zones(id,name,area,delivery_fee_kurus,priority,is_active) values
  ('10000000-0000-4000-8000-000000000001','Sample Istanbul Zone',
   ST_GeogFromText('POLYGON((28.94 41.00,29.04 41.00,29.04 41.08,28.94 41.08,28.94 41.00))'),
   7500,100,true)
on conflict(id) do update set name=excluded.name,area=excluded.area,
  delivery_fee_kurus=excluded.delivery_fee_kurus,priority=excluded.priority,is_active=excluded.is_active;

insert into categories(id,name_en,name_tr,sort_order,is_active) values
  ('20000000-0000-4000-8000-000000000001','Rice','Rice',10,true),
  ('20000000-0000-4000-8000-000000000002','Swallow','Swallow',20,true),
  ('20000000-0000-4000-8000-000000000003','Soups','Soups',30,true),
  ('20000000-0000-4000-8000-000000000004','Proteins & Grills','Proteins & Grills',40,true),
  ('20000000-0000-4000-8000-000000000005','Snacks','Snacks',50,true)
on conflict(id) do update set name_en=excluded.name_en,name_tr=excluded.name_tr,
  sort_order=excluded.sort_order,is_active=excluded.is_active;

-- price_kurus uses temporary prices except the five owner-supplied proteins.
insert into menu_items(id,category_id,name_en,name_tr,description_en,description_tr,
  price_kurus,minimum_order_quantity,image_url,is_available,is_published,sort_order) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Jollof Rice','Jollof Rice','Nigerian-style seasoned jollof rice. Choose one protein.','Nigerian-style seasoned jollof rice. Choose one protein.',35000,1,null,true,true,10),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Fried Rice','Fried Rice','Nigerian fried rice with mixed vegetables. Choose one protein.','Nigerian fried rice with mixed vegetables. Choose one protein.',35000,1,null,true,true,20),
  ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Coconut Rice','Coconut Rice','Fragrant rice cooked with coconut. Choose one protein.','Fragrant rice cooked with coconut. Choose one protein.',40000,1,null,true,true,30),
  ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','Native Rice','Native Rice','Traditional Nigerian native rice. Choose one protein.','Traditional Nigerian native rice. Choose one protein.',45000,1,null,true,true,40),

  ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','Banku','Banku','A smooth fermented corn and cassava swallow.','A smooth fermented corn and cassava swallow.',18000,1,null,true,true,10),
  ('30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000002','Eba','Eba','Cassava-garri swallow.','Cassava-garri swallow.',15000,1,null,true,true,20),
  ('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000002','Semo','Semo','Smooth semolina swallow.','Smooth semolina swallow.',15000,1,null,true,true,30),
  ('30000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000002','Poundo Yam','Poundo Yam','Smooth yam-flour swallow.','Smooth yam-flour swallow.',18000,1,null,true,true,40),
  ('30000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000002','Wheat','Wheat','Soft wheat swallow.','Soft wheat swallow.',16000,1,null,true,true,50),

  ('30000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000003','Egusi Soup','Egusi Soup','Melon-seed soup with leafy vegetables. Choose one protein.','Melon-seed soup with leafy vegetables. Choose one protein.',55000,1,null,true,true,10),
  ('30000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000003','Ogbono Soup','Ogbono Soup','Rich ogbono soup. Choose one protein.','Rich ogbono soup. Choose one protein.',55000,1,null,true,true,20),
  ('30000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000003','Okra Soup','Okra Soup','Nigerian okra soup. Choose one protein.','Nigerian okra soup. Choose one protein.',50000,1,null,true,true,30),
  ('30000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000003','Vegetable Soup','Vegetable Soup','Seasoned leafy vegetable soup. Choose one protein.','Seasoned leafy vegetable soup. Choose one protein.',60000,1,null,true,true,40),
  ('30000000-0000-4000-8000-000000000014','20000000-0000-4000-8000-000000000003','Pepper Soup','Pepper Soup','Aromatic Nigerian pepper soup. Choose one protein.','Aromatic Nigerian pepper soup. Choose one protein.',50000,1,null,true,true,50),
  ('30000000-0000-4000-8000-000000000015','20000000-0000-4000-8000-000000000003','Banga Soup','Banga Soup','Palm-fruit soup with traditional spices. Choose one protein.','Palm-fruit soup with traditional spices. Choose one protein.',60000,1,null,true,true,60),

  ('30000000-0000-4000-8000-000000000016','20000000-0000-4000-8000-000000000004','Beef Suya','Beef Suya','Yaji-spiced grilled beef.','Yaji-spiced grilled beef.',150000,1,null,true,true,10),
  ('30000000-0000-4000-8000-000000000017','20000000-0000-4000-8000-000000000004','Chicken Suya (6 Wings)','Chicken Suya (6 Wings)','Six yaji-spiced chicken wings.','Six yaji-spiced chicken wings.',60000,1,null,true,true,20),
  ('30000000-0000-4000-8000-000000000018','20000000-0000-4000-8000-000000000004','Grilled Catfish (1)','Grilled Catfish (1)','One whole seasoned grilled catfish.','One whole seasoned grilled catfish.',180000,1,null,true,true,30),
  ('30000000-0000-4000-8000-000000000019','20000000-0000-4000-8000-000000000004','Grilled Tilapia Fish (1)','Grilled Tilapia Fish (1)','One whole seasoned grilled tilapia.','One whole seasoned grilled tilapia.',130000,1,null,true,true,40),
  ('30000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000004','Grilled Turkey Wings (4 Pieces)','Grilled Turkey Wings (4 Pieces)','Four seasoned grilled turkey wings.','Four seasoned grilled turkey wings.',60000,1,null,true,true,50),

  ('30000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000005','Meat Pie','Meat Pie','Savoury pastry filled with seasoned meat. Minimum 10.','Savoury pastry filled with seasoned meat. Minimum 10.',12000,10,null,true,true,10),
  ('30000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000005','Chicken Pie','Chicken Pie','Savoury pastry filled with seasoned chicken. Minimum 10.','Savoury pastry filled with seasoned chicken. Minimum 10.',12000,10,null,true,true,20),
  ('30000000-0000-4000-8000-000000000023','20000000-0000-4000-8000-000000000005','Chin Chin','Chin Chin','Crunchy Nigerian fried snack. Minimum 10.','Crunchy Nigerian fried snack. Minimum 10.',6000,10,null,true,true,30),
  ('30000000-0000-4000-8000-000000000024','20000000-0000-4000-8000-000000000005','Puff Puff','Puff Puff','Soft golden fried dough bites. Minimum 10.','Soft golden fried dough bites. Minimum 10.',5000,10,null,true,true,40),
  ('30000000-0000-4000-8000-000000000025','20000000-0000-4000-8000-000000000005','Banana Bread Loaf','Banana Bread Loaf','Moist banana bread loaf. Minimum 10.','Moist banana bread loaf. Minimum 10.',25000,10,null,true,true,50),
  ('30000000-0000-4000-8000-000000000026','20000000-0000-4000-8000-000000000005','Vanilla Cake Loaf','Vanilla Cake Loaf','Soft vanilla cake loaf. Minimum 10.','Soft vanilla cake loaf. Minimum 10.',30000,10,null,true,true,60),
  ('30000000-0000-4000-8000-000000000027','20000000-0000-4000-8000-000000000005','Samosas','Samosas','Crisp savoury filled pastries. Minimum 10.','Crisp savoury filled pastries. Minimum 10.',7000,10,null,true,true,70),
  ('30000000-0000-4000-8000-000000000028','20000000-0000-4000-8000-000000000005','Spring Rolls','Spring Rolls','Crisp vegetable-filled rolls. Minimum 10.','Crisp vegetable-filled rolls. Minimum 10.',7000,10,null,true,true,80),
  ('30000000-0000-4000-8000-000000000029','20000000-0000-4000-8000-000000000005','Egg Rolls','Egg Rolls','Boiled egg wrapped in seasoned dough. Minimum 10.','Boiled egg wrapped in seasoned dough. Minimum 10.',10000,10,null,true,true,90),
  ('30000000-0000-4000-8000-000000000030','20000000-0000-4000-8000-000000000005','Agege Bread','Agege Bread','Soft Nigerian-style bread. Minimum 10.','Soft Nigerian-style bread. Minimum 10.',15000,10,null,true,true,100)
on conflict(id) do update set category_id=excluded.category_id,name_en=excluded.name_en,
  name_tr=excluded.name_tr,description_en=excluded.description_en,description_tr=excluded.description_tr,
  price_kurus=excluded.price_kurus,minimum_order_quantity=excluded.minimum_order_quantity,
  image_url=case when menu_items.image_url like '/seed-menu/%' then null
    else coalesce(menu_items.image_url,excluded.image_url) end,is_available=excluded.is_available,
  is_published=excluded.is_published,sort_order=excluded.sort_order;

-- Original flyer proteins retained with TEMPORARY prices.
insert into menu_items(id,category_id,name_en,name_tr,description_en,description_tr,
  price_kurus,minimum_order_quantity,image_url,is_available,is_published,sort_order) values
  ('30000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000004','Grilled Turkey','Grilled Turkey','Seasoned grilled turkey portion.','Seasoned grilled turkey portion.',70000,1,null,true,true,60),
  ('30000000-0000-4000-8000-000000000032','20000000-0000-4000-8000-000000000004','Chicken','Chicken','Seasoned chicken portion.','Seasoned chicken portion.',45000,1,null,true,true,70),
  ('30000000-0000-4000-8000-000000000033','20000000-0000-4000-8000-000000000004','Goat Meat','Goat Meat','Seasoned goat meat portion.','Seasoned goat meat portion.',70000,1,null,true,true,80),
  ('30000000-0000-4000-8000-000000000034','20000000-0000-4000-8000-000000000004','Beef','Beef','Seasoned beef portion.','Seasoned beef portion.',65000,1,null,true,true,90),
  ('30000000-0000-4000-8000-000000000035','20000000-0000-4000-8000-000000000004','Fish Portion','Fish Portion','Seasoned fish portion.','Seasoned fish portion.',80000,1,null,true,true,100),
  ('30000000-0000-4000-8000-000000000036','20000000-0000-4000-8000-000000000004','Eggs','Eggs','Boiled egg portion.','Boiled egg portion.',10000,1,null,true,true,110),
  ('30000000-0000-4000-8000-000000000037','20000000-0000-4000-8000-000000000004','Cow Leg','Cow Leg','Seasoned cow-leg portion.','Seasoned cow-leg portion.',50000,1,null,true,true,120)
on conflict(id) do update set category_id=excluded.category_id,name_en=excluded.name_en,
  name_tr=excluded.name_tr,description_en=excluded.description_en,description_tr=excluded.description_tr,
  price_kurus=excluded.price_kurus,minimum_order_quantity=excluded.minimum_order_quantity,
  image_url=case when menu_items.image_url like '/seed-menu/%' then null
    else coalesce(menu_items.image_url,excluded.image_url) end,is_available=excluded.is_available,
  is_published=excluded.is_published,sort_order=excluded.sort_order;

-- Required, exactly-one protein group for every rice and soup item.
delete from modifiers where menu_item_id in (
  select id from menu_items where category_id in (
    '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003'
  )
);

insert into modifiers(id,menu_item_id,name_en,name_tr,is_required,min_select,max_select,sort_order)
select ('40000000-0000-4000-8000-' || right(item.id::text,12))::uuid,
  item.id,'Choose your protein','Choose your protein',true,1,1,10
from menu_items item
where item.category_id in (
  '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003'
);

insert into modifier_options(modifier_id,name_en,name_tr,price_delta_kurus,sort_order)
select modifier.id,protein.name,protein.name,protein.price,protein.position
from modifiers modifier
cross join (values
  ('Beef Suya',150000,10),
  ('Chicken Suya (6 Wings)',60000,20),
  ('Grilled Catfish (1)',180000,30),
  ('Grilled Tilapia Fish (1)',130000,40),
  ('Grilled Turkey Wings (4 Pieces)',60000,50),
  ('Grilled Turkey',70000,60),
  ('Chicken',45000,70),
  ('Goat Meat',70000,80),
  ('Beef',65000,90),
  ('Fish Portion',80000,100),
  ('Eggs',10000,110),
  ('Cow Leg',50000,120)
) as protein(name,price,position)
where modifier.menu_item_id in (
  select id from menu_items where category_id in (
    '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003'
  )
);

-- Remove only legacy demo records outside the stable real-menu IDs.
delete from menu_items where name_en in (
  'Northern Grill','Efo Riro & Amala','Moi Moi','Peppered Chicken',
  'Jollof Rice & Grilled Chicken','Nigerian Fried Rice & Chicken','Egusi Soup & Pounded Yam'
) and id not in (select ('30000000-0000-4000-8000-' || lpad(number::text,12,'0'))::uuid
                   from generate_series(1,30) number);

delete from categories category
where category.name_en in ('Mains','Rice Dishes','Soups & Swallows','Grills & Proteins','Sides & Small Chops')
  and category.id not in (
    select ('20000000-0000-4000-8000-' || lpad(number::text,12,'0'))::uuid
    from generate_series(1,5) number
  )
  and not exists (select 1 from menu_items item where item.category_id=category.id);
