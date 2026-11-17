import type { CatalogItem, CatalogTier } from './types';
import { r2 } from './calc';

/** Tier price with any announced increase applied once its date has passed. */
export function tierPrice(c: CatalogItem, t: CatalogTier, today = new Date()): number {
  let p = Number(t.price) || 0;
  if (c.increase_pct && c.increase_from && new Date(c.increase_from) <= today) p *= 1 + Number(c.increase_pct) / 100;
  return p;
}
/** Price per estimating unit: pack price ÷ pack SF/LF/qty when the use unit differs from the sell unit. */
export function unitPrice(c: CatalogItem, t: CatalogTier, today = new Date()): number {
  const p = tierPrice(c, t, today);
  if (!c.use_unit || !c.sell_unit || c.use_unit.toLowerCase() === c.sell_unit.toLowerCase()) return r2(p);
  const div = c.use_unit === 'SF' ? c.pack?.sf : c.use_unit === 'LF' ? c.pack?.lenFt : c.pack?.qty;
  return div ? Math.round(p / Number(div) * 10000) / 10000 : r2(p);
}
export const ROLE_ORDER = ['trim', 'fastener', 'clip', 'sealant', 'accessory', 'delivery'];
