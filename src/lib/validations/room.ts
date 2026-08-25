import { z } from "zod";

// Per-room rent defaults. Money is in RUPEES at this boundary (converted to paise in
// the action). A blank rent clears the room default and leaves rent purely per tenant.
export const roomRentSchema = z.object({
  roomId: z.string().trim().min(1),
  rent: z
    .number({ error: "Enter a valid amount" })
    .min(0, "Enter a valid amount")
    .max(10_000_000, "Amount is too large")
    .nullable(),
  maintenance: z
    .number({ error: "Enter a valid amount" })
    .min(0, "Enter a valid amount")
    .max(10_000_000, "Amount is too large")
    .nullable(),
  /** Also push the new amounts onto every ACTIVE tenancy in the room. */
  applyToOccupants: z.boolean(),
});

export type RoomRentInput = z.infer<typeof roomRentSchema>;
