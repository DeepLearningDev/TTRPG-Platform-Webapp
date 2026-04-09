# Campaign Vault

Campaign Vault is a local-first web application for running tabletop campaigns with:

- a DM workspace for campaigns, layered NPC cards, encounter drafts, monster lookup, and loot/bank operations
- a player portal for campaign-scoped bank access using character name and PIN
- a shared ledger model so item and gold movements are traceable

## Current Slice

Implemented now:

- campaign-aware DM dashboard at `/dm`
- editable NPC and companion cards
- compendium-backed encounter draft creation
- manual loot awards into inventory or bank storage
- player bank login and holdings view at `/bank`
- local Prisma schema, SQLite database, and seed data

Planned later:

- quest and bounty board
- NPC storefront
- fake mail system
- interactive crafting
- advanced loot generation and party distribution
- casino minigames and pet care

## Local Setup

1. Install dependencies.
2. Copy `.env.example` to `.env` if needed.
3. Initialize the local database.
4. Start the development server.

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

## Demo Accounts

The seed script creates these player-bank credentials:

- `Ashes of Highcrest` / `Miri Vale` / `2413`
- `Ashes of Highcrest` / `Toren Ash` / `4821`
- `The Sunken Crown` / `Sella Drift` / `9134`

## Quality Gates

```bash
npm run lint
npm run typecheck
npm run build
```

## Data Notes

- The current implementation uses SQLite for zero-config local development.
- The schema is structured so it can be migrated to PostgreSQL later when you want a hosted deployment.
- Monster data in this slice is seeded demo/SRD-style content only.

## Key Paths

- `src/app/(dm)/dm/page.tsx`: DM workspace
- `src/app/(player)/bank/page.tsx`: player login
- `src/app/(player)/bank/account/page.tsx`: player holdings view
- `prisma/schema.prisma`: data model
- `prisma/seed.ts`: local demo data

## Remaining Gaps

- DM auth is still local-trust and not yet enforced.
- The current loot system is manual; advanced loot generation and party roll-room logic are still future work.
- Quest board, storefront, mail, crafting, and casino systems are not implemented yet.
