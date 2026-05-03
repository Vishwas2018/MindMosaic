import { z } from 'zod';
import { SubscriptionTierSchema, InvoiceStatusSchema } from './shared.js';

export const PlanCatalogDTOSchema = z.object({
  plans: z.array(
    z.object({
      tier: SubscriptionTierSchema,
      display_name: z.string(),
      price_monthly_cents: z.number().int(),
      price_yearly_cents: z.number().int(),
      currency: z.string(),
      features: z.array(z.string()),
      popular: z.boolean(),
      stripe_price_monthly: z.string(),
      stripe_price_yearly: z.string(),
    }),
  ),
});
export type PlanCatalogDTO = z.infer<typeof PlanCatalogDTOSchema>;

export const SubscriptionDTOSchema = z.object({
  tier: SubscriptionTierSchema,
  is_active: z.boolean(),
  started_at: z.string().datetime(),
  current_period_end: z.string().datetime().nullable(),
  cancel_at: z.string().datetime().nullable(),
  canceled_at: z.string().datetime().nullable(),
  stripe_subscription_id: z.string().nullable(),
});
export type SubscriptionDTO = z.infer<typeof SubscriptionDTOSchema>;

export const CheckoutRequestSchema = z.object({
  tier: z.enum(['standard', 'premium', 'institutional']),
  billing_interval: z.enum(['monthly', 'yearly']),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export const CheckoutResponseSchema = z.object({
  checkout_url: z.string().url(),
  session_id: z.string(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const InvoiceDTOSchema = z.object({
  id: z.string().uuid(),
  stripe_invoice_id: z.string(),
  amount_cents: z.number().int(),
  currency: z.string(),
  status: InvoiceStatusSchema,
  invoiced_at: z.string().datetime(),
  paid_at: z.string().datetime().nullable(),
  hosted_invoice_url: z.string().url().nullable(),
  invoice_pdf_url: z.string().url().nullable(),
});
export type InvoiceDTO = z.infer<typeof InvoiceDTOSchema>;
