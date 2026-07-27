'use client';

import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import type {CartLine, CartSelection, MenuItem} from './types';

interface CartState {
  lines: CartLine[];
  add: (item: MenuItem, selections?: CartSelection[]) => void;
  addQuantity: (item: MenuItem, quantity: number, selections?: CartSelection[]) => void;
  remove: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
}

function lineKey(item: MenuItem, selections: CartSelection[]): string {
  const options = selections.flatMap((selection) => selection.option_ids).sort().join(',');
  return `${item.id}:${options}`;
}

function addLines(lines: CartLine[], item: MenuItem, quantity: number, selections: CartSelection[]): CartLine[] {
  const key = lineKey(item, selections);
  const existing = lines.find((line) => line.key === key);
  return existing
    ? lines.map((line) => line.key === key ? {...line, quantity: line.quantity + quantity} : line)
    : [...lines, {key, item, quantity, selections}];
}

export const useCart = create<CartState>()(persist((set) => ({
  lines: [],
  add: (item, selections = []) => set((state) => ({
    lines: addLines(state.lines, item, Math.max(1, item.minimum_order_quantity), selections)
  })),
  addQuantity: (item, quantity, selections = []) => set((state) => ({
    lines: addLines(state.lines, item, Math.max(item.minimum_order_quantity, quantity), selections)
  })),
  remove: (key) => set((state) => ({lines: state.lines.filter((line) => line.key !== key)})),
  setQuantity: (key, quantity) => set((state) => ({
    lines: quantity < 1 ? state.lines.filter((line) => line.key !== key)
      : state.lines.map((line) => line.key === key
        ? {...line, quantity: Math.max(line.item.minimum_order_quantity, quantity)} : line)
  })),
  clear: () => set({lines: []})
}), {
  name: 'allensnothern-cart',
  version: 4,
  migrate: (persisted, version) => version < 4
    ? {...persisted as CartState, lines: []}
    : persisted as CartState
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== 'allensnothern-cart') return;
    if (!event.newValue) {
      useCart.setState({lines: []});
      return;
    }
    try {
      const stored = JSON.parse(event.newValue) as {state?: {lines?: CartLine[]}};
      useCart.setState({lines: stored.state?.lines ?? []});
    } catch {
      useCart.setState({lines: []});
    }
  });
  window.addEventListener('pageshow', () => {
    void useCart.persist.rehydrate();
  });
}

export function linePrice(line: CartLine): number {
  const optionTotal = line.selections.reduce((sum, selection) => sum + selection.option_ids.reduce((subtotal, optionId) => {
    const option = line.item.modifiers.flatMap((modifier) => modifier.options).find((candidate) => candidate.id === optionId);
    return subtotal + (option?.price_delta_kurus ?? 0);
  }, 0), 0);
  return (line.item.price_kurus + optionTotal) * line.quantity;
}
