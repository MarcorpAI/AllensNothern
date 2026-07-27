export type AdminModifierOption = {
  id?: string;
  name_en: string;
  name_tr: string;
  price_delta_kurus: number;
  sort_order: number;
};

export type AdminModifier = {
  id?: string;
  name_en: string;
  name_tr: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  options: AdminModifierOption[];
};

export type AdminMenuItem = {
  id: string;
  category_id: string;
  name_en: string;
  name_tr: string;
  description_en: string;
  description_tr: string;
  price_kurus: number;
  minimum_order_quantity: number;
  image_url: string | null;
  is_available: boolean;
  is_published: boolean;
  sort_order: number;
  modifiers: AdminModifier[];
};

export type AdminCategory = {
  id: string;
  name_en: string;
  name_tr: string;
  sort_order: number;
  is_active: boolean;
  items: AdminMenuItem[];
};

export type AdminMenu = {categories: AdminCategory[]};
