export type Locale = 'en' | 'tr';

export interface ModifierOption {
  id: string;
  name: string;
  price_delta_kurus: number;
}

export interface Modifier {
  id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_kurus: number;
  image_url: string | null;
  is_available: boolean;
  minimum_order_quantity: number;
  modifiers: Modifier[];
}

export interface MenuCategory {id: string; name: string; items: MenuItem[]}
export interface MenuResponse {locale: Locale; is_open: boolean; categories: MenuCategory[]}
export interface ZoneCheck {
  deliverable: boolean;
  zone_id: string | null;
  zone_name: string | null;
  delivery_fee_kurus: number | null;
}

export interface CartLine {
  key: string;
  item: MenuItem;
  quantity: number;
  selections: CartSelection[];
}

export interface CartSelection {
  modifier_id: string;
  option_ids: string[];
}

export interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  customer_name: string;
  total_kurus: number;
  delivery_address: string;
  created_at: string;
  paid_at?: string | null;
  payment_method?: 'bank_transfer' | 'iyzico';
  payment_expires_at?: string | null;
  transfer_notified_at?: string | null;
  bank_transfer?: BankTransferInstructions | null;
  status_history?: OrderStatusHistory[];
  locale?: Locale;
  items?: CustomerOrderItem[];
}

export interface BankTransferInstructions {
  account_holder: string;
  bank_name: string;
  account_label: string;
  account_identifier: string;
  currency: string;
  amount_minor: number;
  customer_rate: string;
  reference: string;
  expires_at: string;
}

export interface PaymentRoute {
  id: string;
  code: string;
  name: string;
  route_type: 'local_transfer' | 'assisted';
  currency: string | null;
  contact_url: string;
  rate_valid_until: string | null;
}

export interface PaymentQuote {
  id: string;
  route_id: string;
  base_amount_kurus: number;
  settlement_currency: string;
  settlement_amount_minor: number;
  customer_rate: string;
  expires_at: string;
}

export interface PendingBankTransferOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  delivery_instructions: string;
  total_kurus: number;
  settlement_currency: string;
  settlement_amount_minor: number;
  payment_route_name: string;
  transfer_sender_name: string | null;
  transfer_customer_reference: string | null;
  transfer_mismatch_note: string | null;
  items: {item_name: string; quantity: number; selected_modifiers: KitchenModifierSelection[]}[];
  created_at: string;
  payment_expires_at: string;
  transfer_notified_at: string | null;
}

export interface OrderStatusHistory {status: string; changed_at: string}
export interface SavedAddress {id: string; label: string; full_address: string; instructions: string; latitude: number; longitude: number}
export interface CustomerOrderItem {id: string; item_name: string; quantity: number; unit_price_kurus: number; line_total_kurus: number; selected_modifiers: KitchenModifierSelection[]}
export interface CustomerOrderDetail extends Order {
  locale: Locale;
  customer_email: string;
  customer_phone: string;
  delivery_instructions: string;
  delivery_zone_name: string;
  subtotal_kurus: number;
  delivery_fee_kurus: number;
  items: CustomerOrderItem[];
  status_history: OrderStatusHistory[];
}

export interface KitchenModifierOption {
  id: string;
  name_en: string;
  name_tr: string;
  price_delta_kurus: number;
}

export interface KitchenModifierSelection {
  id: string;
  name_en: string;
  name_tr: string;
  options: KitchenModifierOption[];
}

export interface KitchenOrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price_kurus: number;
  line_total_kurus: number;
  selected_modifiers: KitchenModifierSelection[];
}

export interface KitchenOrderDetail {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  locale: Locale;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  delivery_instructions: string;
  delivery_zone_name: string;
  subtotal_kurus: number;
  delivery_fee_kurus: number;
  total_kurus: number;
  payment_reference: string | null;
  created_at: string;
  paid_at: string | null;
  updated_at: string;
  items: KitchenOrderItem[];
  status_history: {status: string; changed_at: string}[];
}
