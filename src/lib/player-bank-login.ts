import { z } from "zod";

export const bankLoginSchema = z.object({
  campaignId: z.string().trim().min(1),
  characterName: z.string().trim().min(2).max(80),
  pin: z.string().trim().regex(/^\d{4,8}$/),
});

export type BankLoginInput = z.infer<typeof bankLoginSchema>;

export function normalizeBankCharacterName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
