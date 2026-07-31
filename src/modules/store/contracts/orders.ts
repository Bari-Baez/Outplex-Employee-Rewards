import { z } from 'zod';

const cartLineSchema = z.object({
  item: z.object({ id: z.string().uuid() }).passthrough(),
  quantity: z.number().int().min(1).max(100),
}).strict();

export const checkoutInputSchema = z.object({
  cart: z.array(cartLineSchema).min(1).max(50),
}).strict();

export const cancelOrderInputSchema = z.object({ orderId: z.string().uuid() }).strict();

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;

export function normalizeCheckoutCart(input: CheckoutInput): Array<{ itemId: string; quantity: number }> {
  const quantities = new Map<string, number>();
  for (const line of input.cart) {
    const total = (quantities.get(line.item.id) ?? 0) + line.quantity;
    if (total > 100) throw new Error('Cart quantity exceeds the per-item limit.');
    quantities.set(line.item.id, total);
  }
  return [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
}
