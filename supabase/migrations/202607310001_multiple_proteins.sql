-- Protein selections may contain different choices and repeated portions of one choice.
update modifiers
set max_select = 25
where name_en = 'Choose your protein'
  and max_select = 1;
