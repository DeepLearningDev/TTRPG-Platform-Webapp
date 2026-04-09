# Campaign Vault Alpha Checklist

Alpha means every major system is usable in text form, even if the presentation is still plain.

## Complete

- DM login and workspace shell
- Player bank login and signed session flow
- Campaign and character management baseline
- Layered NPC and companion cards
- Compendium-backed encounter drafts
- Manual loot awards into bank or inventory
- Quest board baseline
- Storefront baseline
- In-world mail baseline
- Crafting recipe and job scaffolding
- Bounded compendium sync with fallback
- Seed data, lint, typecheck, tests, and build gates

## Current Alpha Priorities

- DM mutation hardening and safer server-side ownership checks
- Better validation and user-facing error handling for duplicate or invalid inputs
- Text-based loot generation and party distribution
- Text-based crafting gameplay with recipes, materials, and roll resolution
- Broader player-facing interaction loops where needed

## Remaining For Alpha

### Loot

- Text-based loot generation from imported and local magic items
- Encounter-aware loot inputs such as party level and difficulty
- Awarded loot pool per encounter or reward event
- Party distribution flow:
  - assign directly to a character
  - roll for item
  - bank unresolved loot

### Crafting

- Recipe discovery and collection
- Material requirements on recipes
- Material availability checks against holdings
- Server-side dice-roll crafting resolution
- Text result output for success, failure, or mixed outcome
- Material consumption and crafted item award through the ledger

### Player Access

- Stronger player-facing visibility and interaction for quests, mail, storefronts, and crafting
- Text-based participation flows where appropriate

### Hardening

- End-to-end checks for critical DM and player flows
- Better mutation ownership validation across all DM actions
- More graceful duplicate-name and invalid-state handling

## Beta Later

- Strong visual design and improved UX
- Richer dashboards and browsing flows
- Better result presentation for loot and crafting

## Release Later

- Animation and motion polish
- Reinforcement polish and UX refinement
