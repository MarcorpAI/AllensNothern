'use client';

import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import type {CartLine, MenuItem} from './types';

interface CartState {
  lines: CartLine[];
  add: (item: MenuItem) => void;
  addQuantity: (item: MenuItem, quantity: number) => void;
  remove: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
}

function addLines(lines: CartLine[], item: MenuItem, quantity: number): CartLine[] {
  const existing = lines.find((line) => line.item.id === item.id);
  return existing
    ? lines.map((line) => line.item.id === item.id ? {...line, quantity: line.quantity + quantity} : line)
    : [...lines, {key: item.id, item, quantity}];
}

export const useCart = create<CartState>()(persist((set) => ({
  lines: [],
  add: (item) => set((state) => ({lines: addLines(state.lines, item, 1)})),
  addQuantity: (item, quantity) => set((state) => ({lines: addLines(state.lines, item, Math.max(1, quantity))})),
  remove: (key) => set((state) => ({lines: state.lines.filter((line) => line.key !== key)})),
  setQuantity: (key, quantity) => set((state) => ({
    lines: quantity < 1 ? state.lines.filter((line) => line.key !== key)
      : state.lines.map((line) => line.key === key ? {...line, quantity} : line)
  })),
  clear: () => set({lines: []})
}), {name: 'allensnothern-cart', version: 2}));

export function linePrice(line: CartLine): number {
  return line.item.price_kurus * line.quantity;
}
