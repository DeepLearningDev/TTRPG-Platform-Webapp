import {
  EncounterDifficulty,
  HoldingScope,
  LootKind,
  LootRarity,
} from "@prisma/client";
import { Compass, Coins, Package2, ScrollText, Sparkles } from "lucide-react";
import Link from "next/link";
import { getDashboardData } from "@/lib/campaign-vault";
import {
  formatCopperAsGold,
  formatDifficultyLabel,
  formatEnumLabel,
  splitTags,
} from "@/lib/format";
import {
  archiveNpcAction,
  awardLootAction,
  createEncounterAction,
  createNpcAction,
  updateNpcAction,
} from "./actions";

type DmPageProps = {
  searchParams: Promise<{
    campaign?: string;
    monster?: string;
  }>;
};

export default async function DmPage({ searchParams }: DmPageProps) {
  const params = await searchParams;
  const data = await getDashboardData({
    slug: params.campaign,
    monsterQuery: params.monster,
  });

  if (!data) {
    return (
      <main className="app-shell">
        <p className="error-banner">No campaigns are available yet.</p>
      </main>
    );
  }

  const { campaigns, campaign, activeNpcs, companions, filteredMonsters, partySummaries } =
    data;

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark">
          <span className="brand-glyph">CV</span>
          DM Workspace
        </div>
        <div className="nav-links">
          <Link className="nav-link" href="/">
            Overview
          </Link>
          <Link className="nav-link" href="/bank">
            Player bank
          </Link>
        </div>
      </header>

      <section className="hero">
        <span className="section-kicker">
          <Compass size={14} />
          Active Campaign
        </span>
        <h1>{campaign.name}</h1>
        <p>{campaign.summary}</p>
        <div className="pill-row">
          {campaigns.map((option) => (
            <Link
              className={`pill-link ${option.slug === campaign.slug ? "active" : ""}`}
              href={`/dm?campaign=${option.slug}`}
              key={option.id}
            >
              {option.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="stats-grid">
        <article className="metric-card">
          <span className="metric-label">Setting</span>
          <div className="metric-value">{campaign.setting}</div>
        </article>
        <article className="metric-card">
          <span className="metric-label">Session night</span>
          <div className="metric-value">{campaign.sessionNight ?? "TBD"}</div>
        </article>
        <article className="metric-card">
          <span className="metric-label">Active NPCs</span>
          <div className="metric-value">{activeNpcs.length + companions.length}</div>
        </article>
        <article className="metric-card">
          <span className="metric-label">Encounter drafts</span>
          <div className="metric-value">{campaign.encounters.length}</div>
        </article>
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                NPC Builder
              </span>
              <h2>Create and maintain layered cards</h2>
            </div>
          </div>

          <form action={createNpcAction} className="stack-form">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Name
                <input name="name" placeholder="Ilyra Mott" required />
              </label>
              <label className="field-label">
                Title
                <input name="title" placeholder="Harbor quartermaster" />
              </label>
              <label className="field-label">
                Type
                <select name="type" defaultValue="STANDARD">
                  <option value="STANDARD">Standard NPC</option>
                  <option value="COMPANION">Companion</option>
                </select>
              </label>
              <label className="field-label">
                Tags
                <input name="tags" placeholder="merchant, warded, anxious" />
              </label>
            </div>
            <label className="field-label">
              Surface card
              <textarea
                name="surfaceBlurb"
                placeholder="Quick table-facing summary and first impression."
                required
              />
            </label>
            <label className="field-label">
              Table hooks
              <textarea
                name="tableHooks"
                placeholder="Voice tics, gestures, repeated details, or reminders."
                required
              />
            </label>
            <label className="field-label">
              Persistent notes
              <textarea
                name="persistentNotes"
                placeholder="Secrets, motivations, continuity, faction ties."
                required
              />
            </label>
            <div className="subgrid">
              <label className="field-label">
                Faction
                <input name="faction" placeholder="Guild of Lanterns" />
              </label>
              <label className="field-label">
                Relationship notes
                <input name="relationshipNotes" placeholder="Party ally, rival, debtor" />
              </label>
            </div>
            <div className="button-row">
              <button className="button" type="submit">
                Save NPC card
              </button>
            </div>
          </form>

          <div className="card-stack">
            {[...activeNpcs, ...companions].map((npc) => (
              <div className="item-card" key={npc.id}>
                <div className="card-header">
                  <div>
                    <div className="value-line">{npc.name}</div>
                    <div className="muted">
                      {npc.title ?? "Untitled"} · {npc.type === "COMPANION" ? "Companion" : "NPC"}
                    </div>
                  </div>
                  <div className="tag-row">
                    {splitTags(npc.tags).map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <form action={updateNpcAction} className="stack-form">
                  <input type="hidden" name="id" value={npc.id} />
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                  <div className="subgrid">
                    <label className="field-label">
                      Name
                      <input name="name" defaultValue={npc.name} required />
                    </label>
                    <label className="field-label">
                      Title
                      <input name="title" defaultValue={npc.title ?? ""} />
                    </label>
                    <label className="field-label">
                      Type
                      <select name="type" defaultValue={npc.type}>
                        <option value="STANDARD">Standard NPC</option>
                        <option value="COMPANION">Companion</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Tags
                      <input name="tags" defaultValue={npc.tags} />
                    </label>
                  </div>
                  <label className="field-label">
                    Surface card
                    <textarea name="surfaceBlurb" defaultValue={npc.surfaceBlurb} required />
                  </label>
                  <label className="field-label">
                    Table hooks
                    <textarea name="tableHooks" defaultValue={npc.tableHooks} required />
                  </label>
                  <label className="field-label">
                    Persistent notes
                    <textarea
                      name="persistentNotes"
                      defaultValue={npc.persistentNotes}
                      required
                    />
                  </label>
                  <div className="subgrid">
                    <label className="field-label">
                      Faction
                      <input name="faction" defaultValue={npc.faction ?? ""} />
                    </label>
                    <label className="field-label">
                      Relationship notes
                      <input
                        name="relationshipNotes"
                        defaultValue={npc.relationshipNotes ?? ""}
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button className="button-secondary" type="submit">
                      Update card
                    </button>
                  </div>
                </form>

                <form action={archiveNpcAction}>
                  <input type="hidden" name="id" value={npc.id} />
                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                  <button className="button-danger" type="submit">
                    Archive card
                  </button>
                </form>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <Coins size={14} />
                Party Ledger
              </span>
              <h2>Bank holdings and manual loot awards</h2>
            </div>
          </div>

          <div className="bank-summary-grid">
            {partySummaries.map((character) => (
              <div className="bank-card" key={character.id}>
                <div className="card-header">
                  <div>
                    <div className="value-line">{character.name}</div>
                    <div className="muted">
                      L{character.level} {character.classRole}
                    </div>
                  </div>
                  <span className="tag">{formatCopperAsGold(character.bankSnapshot.gold)}</span>
                </div>
                <p>{character.notes}</p>
                <div className="tag-row">
                  {character.bankSnapshot.items.length > 0 ? (
                    character.bankSnapshot.items.map((item) => (
                      <span className="tag" key={item.id}>
                        {item.name} × {item.quantity}
                      </span>
                    ))
                  ) : (
                    <span className="tag danger-tag">No stored items</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form action={awardLootAction} className="stack-form">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Recipient
                <select name="characterId" defaultValue={partySummaries[0]?.id}>
                  {partySummaries.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Destination
                <select name="scope" defaultValue={HoldingScope.BANK}>
                  <option value={HoldingScope.BANK}>Bank</option>
                  <option value={HoldingScope.INVENTORY}>Inventory</option>
                </select>
              </label>
              <label className="field-label">
                Existing loot item
                <select name="lootItemId" defaultValue="">
                  <option value="">Create a custom item instead</option>
                  {campaign.lootItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatEnumLabel(item.rarity)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Quantity
                <input defaultValue="1" min="0" name="quantity" type="number" />
              </label>
            </div>
            <div className="subgrid">
              <label className="field-label">
                Custom item name
                <input name="customItemName" placeholder="Moonlit Compass" />
              </label>
              <label className="field-label">
                Rarity
                <select name="rarity" defaultValue={LootRarity.UNCOMMON}>
                  {Object.values(LootRarity).map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {formatEnumLabel(rarity)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Kind
                <select name="kind" defaultValue={LootKind.WONDROUS}>
                  {Object.values(LootKind).map((kind) => (
                    <option key={kind} value={kind}>
                      {formatEnumLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Gold award
                <input defaultValue="0" min="0" name="goldDelta" type="number" />
              </label>
            </div>
            <label className="field-label">
              Custom item description
              <textarea
                name="customItemDescription"
                placeholder="Short note for a new campaign-specific reward."
              />
            </label>
            <label className="field-label">
              Ledger note
              <textarea
                name="note"
                defaultValue="DM-awarded loot from the latest encounter."
                required
              />
            </label>
            <div className="button-row">
              <button className="button" type="submit">
                Award loot
              </button>
            </div>
          </form>

          <div className="list-card">
            {campaign.ledgerEntries.map((entry) => (
              <div className="list-item" key={entry.id}>
                <div className="card-header">
                  <strong>{entry.character.name}</strong>
                  <span className="tag">{formatEnumLabel(entry.scope)}</span>
                </div>
                <div className="muted">
                  {entry.lootItem ? `${entry.lootItem.name} × ${entry.quantity}` : "Gold only"} ·{" "}
                  {formatCopperAsGold(entry.goldDelta)}
                </div>
                <p>{entry.note}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <Package2 size={14} />
                Encounter Drafts
              </span>
              <h2>Compendium-backed encounter save</h2>
            </div>
          </div>

          <form action={createEncounterAction} className="stack-form">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Draft title
                <input name="title" placeholder="Floodgate ambush" required />
              </label>
              <label className="field-label">
                Difficulty
                <select name="difficulty" defaultValue={EncounterDifficulty.MEDIUM}>
                  {Object.values(EncounterDifficulty).map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {formatDifficultyLabel(difficulty)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Party level
                <input defaultValue="5" max="20" min="1" name="partyLevel" type="number" />
              </label>
              <label className="field-label">
                Quantity
                <input defaultValue="1" max="20" min="1" name="quantity" type="number" />
              </label>
            </div>
            <label className="field-label">
              First monster
              <select name="monsterId" defaultValue={filteredMonsters[0]?.id}>
                {filteredMonsters.map((monster) => (
                  <option key={monster.id} value={monster.id}>
                    {monster.name} · CR {monster.challengeRating}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Encounter notes
              <textarea
                name="notes"
                placeholder="What makes this fight memorable, dangerous, or location-aware?"
              />
            </label>
            <div className="button-row">
              <button className="button" type="submit">
                Save encounter draft
              </button>
            </div>
          </form>

          <div className="card-stack">
            {campaign.encounters.map((encounter) => (
              <div className="item-card" key={encounter.id}>
                <div className="card-header">
                  <div>
                    <div className="value-line">{encounter.title}</div>
                    <div className="muted">
                      {formatDifficultyLabel(encounter.difficulty)} · party level {encounter.partyLevel}
                    </div>
                  </div>
                  <span className="tag">{encounter.monsters.length} monster slot(s)</span>
                </div>
                <p>{encounter.notes}</p>
                <div className="tag-row">
                  {encounter.monsters.map((monsterSlot) => (
                    <span className="tag" key={monsterSlot.id}>
                      {monsterSlot.monster.name} × {monsterSlot.quantity}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <Sparkles size={14} />
                Compendium
              </span>
              <h2>Searchable monster reference</h2>
            </div>
          </div>

          <form className="stack-form" method="get">
            <input name="campaign" type="hidden" value={campaign.slug} />
            <label className="field-label">
              Monster search
              <input
                defaultValue={params.monster ?? ""}
                name="monster"
                placeholder="Search by name, type, environment, or drop hint"
              />
            </label>
            <div className="button-row">
              <button className="button-secondary" type="submit">
                Filter compendium
              </button>
            </div>
          </form>

          <div className="card-stack">
            {filteredMonsters.map((monster) => (
              <div className="item-card" key={monster.id}>
                <div className="card-header">
                  <div>
                    <div className="value-line">{monster.name}</div>
                    <div className="muted">
                      CR {monster.challengeRating} · {monster.monsterType}
                    </div>
                  </div>
                  <span className="tag">
                    {monster.isCustom ? "Custom" : formatEnumLabel(monster.source)}
                  </span>
                </div>
                <p>{monster.notes}</p>
                <div className="tag-row">
                  <span className="tag">{monster.environment}</span>
                  {splitTags(monster.tags).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="muted">Possible drops: {monster.specialDrops || "Not set yet"}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <p className="footer-note">
        Phase-2 systems already planned on top of this foundation: quest board,
        storefronts, mail, crafting, advanced loot generation, casino, and pet care.
      </p>
    </main>
  );
}
