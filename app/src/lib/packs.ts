/**
 * Credit pack definitions — single source of truth.
 * Only the two packs that are actually reachable from the UI (`/create`) and
 * live in ECPay checkout exist here. Do not re-declare this table in a route.
 */

export interface CreditPack {
  id: string;
  credits: number;
  priceTWD: number;
  label: string;
}

export const CREDIT_PACKS: Record<string, CreditPack> = {
  pack20: { id: 'pack20', credits: 20, priceTWD: 299, label: '20 點生成組合包' },
  pack50: { id: 'pack50', credits: 50, priceTWD: 599, label: '50 點生成組合包' },
};

/**
 * Packs cheapest-first, for anything that displays the range. Every price
 * shown to a customer should come from here rather than being typed inline —
 * the landing page, /create's buy buttons, /upgrade and the comparison table
 * each used to hard-code NT$299/NT$599, and the comparison table had already
 * drifted to an NT$400 that matched no pack.
 */
export const PACK_LIST: CreditPack[] = Object.values(CREDIT_PACKS).sort(
  (a, b) => a.priceTWD - b.priceTWD,
);

/** Entry price, for "from NT$X" copy. */
export const MIN_PACK_PRICE_TWD = PACK_LIST[0].priceTWD;

/** Credits in the entry pack, for "from X credits" copy. */
export const MIN_PACK_CREDITS = PACK_LIST[0].credits;

/** Look up a pack by id. Returns undefined for unknown ids. */
export function getPack(packId: string): CreditPack | undefined {
  return CREDIT_PACKS[packId];
}

/**
 * Legacy fallback: map a paid TWD amount to a credit count.
 * Needed for orders created before packId (CustomField2) was signed into the
 * ECPay checkout, and to keep crediting the two historical orders.
 */
export function creditsForAmount(amount: number): number | undefined {
  for (const pack of Object.values(CREDIT_PACKS)) {
    if (pack.priceTWD === amount) return pack.credits;
  }
  return undefined;
}
