import type {KitchenModifierSelection} from './types';

export function countedNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  return [...counts].map(([name, count]) => `${name} × ${count}`);
}

export function modifierOptionCounts(modifier: KitchenModifierSelection, locale = 'en'): string {
  return countedNames(modifier.options.map((option) =>
    locale === 'tr' ? option.name_tr : option.name_en)).join(', ');
}
