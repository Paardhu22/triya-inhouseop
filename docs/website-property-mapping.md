# Website listing <-> admin Property mapping audit

Audited 2026-11-23. Website source: `triya-website/src/data/properties.ts` (8 static listings, Unsplash
placeholder photos). Admin source: the local development database (read-only) and `prisma/seed.ts` — the same 3
properties. **Production properties were not inspected** (no credentials here), so this report cannot prove there is
no match in production.

## Admin properties seen (dev DB / seed)

| slug | name | city |
|---|---|---|
| `joystayz` | Joystayz | Hyderabad |
| `frieden` | Frieden Co-Living | Hyderabad |
| `cozy-gowlidoddy` | Cozy Gowlidoddy | Hyderabad |

## Website listings

| website slug | name | location | kind | Matching admin property |
|---|---|---|---|---|
| `triya-house` | Triya House | Banjara Hills | Residence | **UNMATCHED** |
| `the-terrace` | The Terrace | Gachibowli | Hotel | **UNMATCHED** |
| `kondapur-collective` | Kondapur Collective | Kondapur | Residence | **UNMATCHED** |
| `triya-court` | Triya Court | Madhapur | Hotel | **UNMATCHED** |
| `the-annexe` | The Annexe | Jubilee Hills | Residence | **UNMATCHED** |
| `triya-pavilion` | Triya Pavilion | Financial District | Hotel | **UNMATCHED** |
| `the-grove` | The Grove | Kokapet | Residence | **UNMATCHED** |
| `triya-reserve` | Triya Reserve | Begumpet | Hotel | **UNMATCHED** |

Admin properties with no website listing: **Joystayz, Frieden Co-Living, Cozy Gowlidoddy (all UNMATCHED)**.

No slug, name or location matches in either direction. No mapping has been invented and no `Property.websiteSlug`
has been set anywhere outside the disposable e2e database. Consequence: **every listing refuses registrations**
until an ADMIN links a property to a website slug on the Registrations page.

## Human decision required

Either the website's placeholder listings are replaced/renamed to the real hotels (then enter each real
website slug in admin), or the real hotels get website listings. Only the business owner can say which
website listing is which hotel.
