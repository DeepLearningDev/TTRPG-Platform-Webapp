import {
  CraftingJobStatus,
  MailThreadStatus,
  EncounterDifficulty,
  HoldingScope,
  LootKind,
  LootRarity,
  QuestStatus,
  StorefrontStatus,
} from "@prisma/client";
import { Compass, Coins, Package2, ScrollText, Sparkles } from "lucide-react";
import Link from "next/link";
import { requireDmSession } from "@/lib/dm-session";
import { getDashboardData } from "@/lib/campaign-vault";
import {
  formatCopperAsGold,
  formatDifficultyLabel,
  formatEnumLabel,
  splitTags,
} from "@/lib/format";
import {
  archiveNpcAction,
  archiveCampaignAction,
  awardLootAction,
  completeCraftingJobAction,
  completeQuestAction,
  createCampaignAction,
  createCharacterAction,
  createEncounterAction,
  createCraftingJobAction,
  createCraftingRecipeAction,
  createMailThreadAction,
  createNpcAction,
  createQuestAction,
  createStorefrontAction,
  createStorefrontOfferAction,
  recordStorefrontSaleAction,
  logoutDmAction,
  replyMailThreadAction,
  syncCompendiumAction,
  updateCharacterAction,
  updateNpcAction,
  updateQuestAction,
  updateStorefrontAction,
} from "./actions";

type DmPageProps = {
  searchParams: Promise<{
    campaign?: string;
    monster?: string;
    sync?: string;
    source?: string;
  }>;
};

export default async function DmPage({ searchParams }: DmPageProps) {
  const session = await requireDmSession();
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

  const {
    campaigns,
    campaign,
    activeNpcs,
    companions,
    filteredMonsters,
    partySummaries,
    quests,
    storefronts,
    mailThreads,
    craftingRecipes,
    craftingJobs,
  } = data;
  const openQuests = quests.filter((quest) => quest.status !== QuestStatus.COMPLETE);
  const activeStorefronts = storefronts.filter(
    (storefront) => storefront.status === StorefrontStatus.ACTIVE,
  );
  const openMailThreads = mailThreads.filter(
    (thread) => thread.status === MailThreadStatus.ACTIVE,
  );
  const activeCraftingJobs = craftingJobs.filter(
    (job) => job.status !== CraftingJobStatus.COMPLETE,
  );

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark">
          <span className="brand-glyph">CV</span>
          DM Workspace
        </div>
        <div className="nav-links">
          <span className="nav-link active">Signed in as {session.username}</span>
          <Link className="nav-link" href="/">
            Overview
          </Link>
          <Link className="nav-link" href="/bank">
            Player bank
          </Link>
          <form action={logoutDmAction}>
            <button className="pill-button" type="submit">
              Log out
            </button>
          </form>
        </div>
      </header>

      <section className="hero">
        <span className="section-kicker">
          <Compass size={14} />
          Active Campaign
        </span>
        <h1>{campaign.name}</h1>
        <p>{campaign.summary}</p>
        {params.sync ? (
          <p className="helper-text">
            Synced {formatEnumLabel(params.sync)} from {formatEnumLabel(params.source ?? "")}.
          </p>
        ) : null}
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
        <article className="metric-card">
          <span className="metric-label">Open quests</span>
          <div className="metric-value">{openQuests.length}</div>
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

          <form action={syncCompendiumAction} className="stack-form">
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Source
                <select defaultValue="OPEN5E" name="source">
                  <option value="OPEN5E">Open5e</option>
                  <option value="DND5E">D&D 5e SRD</option>
                </select>
              </label>
              <label className="field-label">
                Kind
                <select defaultValue="monsters" name="kind">
                  <option value="monsters">Monsters</option>
                  <option value="magic-items">Magic items</option>
                </select>
              </label>
              <label className="field-label">
                Page size
                <input defaultValue="10" min="1" max="10" name="pageSize" type="number" />
              </label>
              <label className="field-label">
                Pages
                <input defaultValue="1" min="1" max="2" name="pageLimit" type="number" />
              </label>
            </div>
            <div className="button-row">
              <button className="button-secondary" type="submit">
                Sync catalog
              </button>
            </div>
          </form>

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

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">Quest Board</span>
              <h2>Contract flow and reward handoff</h2>
            </div>
            <span className="tag">{openQuests.length} active</span>
          </div>

          <form action={createQuestAction} className="stack-form">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Quest title
                <input name="title" placeholder="Seal the lower floodgate" required />
              </label>
              <label className="field-label">
                Reward gold
                <input defaultValue="0" min="0" name="rewardGold" type="number" />
              </label>
              <label className="field-label">
                Recipient
                <select name="assigneeCharacterId" defaultValue="">
                  <option value="">No assignee yet</option>
                  {partySummaries.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field-label">
              Objective
              <textarea name="objective" placeholder="What must the party actually do?" required />
            </label>
            <label className="field-label">
              Reward text
              <textarea
                name="rewardText"
                placeholder="Optional item, favor, or story reward note."
              />
            </label>
            <label className="field-label">
              Notes
              <textarea name="notes" placeholder="Threads, deadlines, and hidden conditions." />
            </label>
            <div className="button-row">
              <button className="button" type="submit">
                Add quest
              </button>
            </div>
          </form>

          <div className="card-stack">
            {quests.map((quest) => (
              <div className="item-card" key={quest.id}>
                <div className="card-header">
                  <div>
                    <div className="value-line">{quest.title}</div>
                    <div className="muted">
                      {formatEnumLabel(quest.status)} · reward {formatCopperAsGold(quest.rewardGold)}
                    </div>
                  </div>
                  <span className="tag">{quest.assignee?.name ?? "Unassigned"}</span>
                </div>
                <p>{quest.objective}</p>
                {quest.rewardText ? <p className="muted">{quest.rewardText}</p> : null}
                <form action={updateQuestAction} className="stack-form">
                  <input type="hidden" name="id" value={quest.id} />
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                  <div className="subgrid">
                    <label className="field-label">
                      Title
                      <input defaultValue={quest.title} name="title" required />
                    </label>
                    <label className="field-label">
                      Status
                      <select defaultValue={quest.status} name="status">
                        {Object.values(QuestStatus).map((status) => (
                          <option key={status} value={status}>
                            {formatEnumLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Reward gold
                      <input
                        defaultValue={quest.rewardGold}
                        min="0"
                        name="rewardGold"
                        type="number"
                      />
                    </label>
                    <label className="field-label">
                      Recipient
                      <select defaultValue={quest.assigneeCharacterId ?? ""} name="assigneeCharacterId">
                        <option value="">No assignee yet</option>
                        {partySummaries.map((character) => (
                          <option key={character.id} value={character.id}>
                            {character.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field-label">
                    Objective
                    <textarea defaultValue={quest.objective} name="objective" required />
                  </label>
                  <label className="field-label">
                    Reward text
                    <textarea defaultValue={quest.rewardText ?? ""} name="rewardText" />
                  </label>
                  <label className="field-label">
                    Notes
                    <textarea defaultValue={quest.notes ?? ""} name="notes" />
                  </label>
                  <div className="button-row">
                    <button className="button-secondary" type="submit">
                      Update quest
                    </button>
                  </div>
                </form>
                <form action={completeQuestAction}>
                  <input type="hidden" name="id" value={quest.id} />
                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                  <button className="button-secondary" type="submit">
                    Mark complete and award
                  </button>
                </form>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">Storefronts</span>
              <h2>DM shop control and sale logging</h2>
            </div>
            <span className="tag">{activeStorefronts.length} active</span>
          </div>

          <form action={createStorefrontAction} className="stack-form">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Store name
                <input name="name" placeholder="Rook's Reliquary" required />
              </label>
              <label className="field-label">
                Keeper
                <input name="keeperName" placeholder="Rook the vendor" />
              </label>
            </div>
            <label className="field-label">
              Description
              <textarea name="description" placeholder="What this shop sells and how it feels." required />
            </label>
            <label className="field-label">
              Notes
              <textarea name="notes" placeholder="Rotating stock, rumors, or special rules." />
            </label>
            <div className="button-row">
              <button className="button" type="submit">
                Add storefront
              </button>
            </div>
          </form>

          <div className="card-stack">
            {storefronts.map((storefront) => (
              <div className="item-card" key={storefront.id}>
                <div className="card-header">
                  <div>
                    <div className="value-line">{storefront.name}</div>
                    <div className="muted">{storefront.keeperName ?? "No keeper listed"}</div>
                  </div>
                  <span className="tag">{formatEnumLabel(storefront.status)}</span>
                </div>
                <p>{storefront.description}</p>
                {storefront.notes ? <p className="muted">{storefront.notes}</p> : null}

                <form action={updateStorefrontAction} className="stack-form">
                  <input type="hidden" name="id" value={storefront.id} />
                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                  <div className="subgrid">
                    <label className="field-label">
                      Name
                      <input defaultValue={storefront.name} name="name" required />
                    </label>
                    <label className="field-label">
                      Keeper
                      <input defaultValue={storefront.keeperName ?? ""} name="keeperName" />
                    </label>
                    <label className="field-label">
                      Status
                      <select defaultValue={storefront.status} name="status">
                        {Object.values(StorefrontStatus).map((status) => (
                          <option key={status} value={status}>
                            {formatEnumLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field-label">
                    Description
                    <textarea defaultValue={storefront.description} name="description" required />
                  </label>
                  <label className="field-label">
                    Notes
                    <textarea defaultValue={storefront.notes ?? ""} name="notes" />
                  </label>
                  <div className="button-row">
                    <button className="button-secondary" type="submit">
                      Update storefront
                    </button>
                  </div>
                </form>

                <div className="list-card">
                  {storefront.offers.map((offer) => (
                    <div className="list-item" key={offer.id}>
                      <div className="card-header">
                        <div>
                          <strong>{offer.itemName}</strong>
                          <div className="muted">
                            {formatEnumLabel(offer.rarity)} · {formatEnumLabel(offer.kind)} ·{" "}
                            {formatCopperAsGold(offer.priceGold)}
                          </div>
                        </div>
                        <span className="tag">Stock {offer.quantity}</span>
                      </div>
                      <p>{offer.itemDescription}</p>
                      {offer.notes ? <p className="muted">{offer.notes}</p> : null}
                      <form action={recordStorefrontSaleAction} className="stack-form">
                        <input type="hidden" name="offerId" value={offer.id} />
                        <input type="hidden" name="campaignSlug" value={campaign.slug} />
                        <div className="subgrid">
                          <label className="field-label">
                            Buyer
                            <select name="characterId" defaultValue={partySummaries[0]?.id}>
                              {partySummaries.map((character) => (
                                <option key={character.id} value={character.id}>
                                  {character.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field-label">
                            Scope
                            <select defaultValue={HoldingScope.BANK} name="scope">
                              <option value={HoldingScope.BANK}>Bank</option>
                              <option value={HoldingScope.INVENTORY}>Inventory</option>
                            </select>
                          </label>
                          <label className="field-label">
                            Quantity
                            <input defaultValue="1" min="1" name="quantity" type="number" />
                          </label>
                        </div>
                        <label className="field-label">
                          Sale note
                          <textarea
                            defaultValue={`Purchased from ${storefront.name}.`}
                            name="note"
                            required
                          />
                        </label>
                        <div className="button-row">
                          <button className="button-secondary" type="submit">
                            Record sale
                          </button>
                        </div>
                      </form>
                    </div>
                  ))}
                </div>

                <form action={createStorefrontOfferAction} className="stack-form">
                  <input type="hidden" name="storefrontId" value={storefront.id} />
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                  <div className="subgrid">
                    <label className="field-label">
                      Item name
                      <input name="itemName" placeholder="Potion of Clean Passage" required />
                    </label>
                    <label className="field-label">
                      Price gold
                      <input defaultValue="25" min="0" name="priceGold" type="number" />
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
                  </div>
                  <div className="subgrid">
                    <label className="field-label">
                      Existing loot item
                      <select name="lootItemId" defaultValue="">
                        <option value="">Create a new catalog item</option>
                        {campaign.lootItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Stock
                      <input defaultValue="1" min="1" name="quantity" type="number" />
                    </label>
                  </div>
                  <label className="field-label">
                    Description
                    <textarea name="itemDescription" placeholder="What the buyer gets." required />
                  </label>
                  <label className="field-label">
                    Notes
                    <textarea name="notes" placeholder="Special conditions, bargaining hooks, etc." />
                  </label>
                  <div className="button-row">
                    <button className="button" type="submit">
                      Add offer
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">Mail</span>
              <h2>In-world threads and DM replies</h2>
            </div>
            <span className="tag">{openMailThreads.length} active</span>
          </div>

          <form action={createMailThreadAction} className="stack-form">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Subject
                <input name="subject" placeholder="A sealed note from the guild" required />
              </label>
              <label className="field-label">
                From
                <input name="senderName" placeholder="Guild courier" required />
              </label>
              <label className="field-label">
                To
                <input name="recipientName" placeholder="Miri Vale" required />
              </label>
            </div>
            <label className="field-label">
              Opening message
              <textarea name="body" placeholder="The first message in the thread." required />
            </label>
            <label className="field-label">
              Notes
              <textarea name="notes" placeholder="Tone, secrecy, or quest hooks." />
            </label>
            <div className="button-row">
              <button className="button" type="submit">
                Start thread
              </button>
            </div>
          </form>

          <div className="card-stack">
            {mailThreads.map((thread) => (
              <div className="item-card" key={thread.id}>
                <div className="card-header">
                  <div>
                    <div className="value-line">{thread.subject}</div>
                    <div className="muted">
                      {thread.senderName} to {thread.recipientName}
                    </div>
                  </div>
                  <span className="tag">{formatEnumLabel(thread.status)}</span>
                </div>
                {thread.notes ? <p className="muted">{thread.notes}</p> : null}
                <div className="list-card">
                  {thread.messages.map((message) => (
                    <div className="list-item" key={message.id}>
                      <div className="card-header">
                        <strong>
                          {message.fromName} to {message.toName}
                        </strong>
                        <span className="tag">{message.isFromDm ? "DM" : "Player"}</span>
                      </div>
                      <p>{message.body}</p>
                    </div>
                  ))}
                </div>
                <form action={replyMailThreadAction} className="stack-form">
                  <input type="hidden" name="threadId" value={thread.id} />
                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                  <div className="subgrid">
                    <label className="field-label">
                      From
                      <input defaultValue="DM" name="fromName" required />
                    </label>
                    <label className="field-label">
                      To
                      <input defaultValue={thread.recipientName} name="toName" required />
                    </label>
                  </div>
                  <label className="field-label">
                    Reply
                    <textarea name="body" placeholder="The next message in the thread." required />
                  </label>
                  <div className="button-row">
                    <button className="button-secondary" type="submit">
                      Add reply
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">Crafting</span>
              <h2>Recipes and active work orders</h2>
            </div>
            <span className="tag">{activeCraftingJobs.length} in progress</span>
          </div>

          <form action={createCraftingRecipeAction} className="stack-form">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Recipe name
                <input name="name" placeholder="Runed satchel" required />
              </label>
              <label className="field-label">
                Output name
                <input name="outputName" placeholder="Runed Satchel" required />
              </label>
              <label className="field-label">
                Gold cost
                <input defaultValue="0" min="0" name="goldCost" type="number" />
              </label>
              <label className="field-label">
                Time
                <input name="timeText" placeholder="2 days" />
              </label>
            </div>
            <div className="subgrid">
              <label className="field-label">
                Output rarity
                <select name="outputRarity" defaultValue={LootRarity.UNCOMMON}>
                  {Object.values(LootRarity).map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {formatEnumLabel(rarity)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Output kind
                <select name="outputKind" defaultValue={LootKind.WONDROUS}>
                  {Object.values(LootKind).map((kind) => (
                    <option key={kind} value={kind}>
                      {formatEnumLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field-label">
              Output description
              <textarea name="outputDescription" placeholder="What the finished item does." required />
            </label>
            <label className="field-label">
              Inputs
              <textarea name="inputText" placeholder="Required materials or craft steps." required />
            </label>
            <label className="field-label">
              Notes
              <textarea name="notes" placeholder="Special crafting rules or hooks." />
            </label>
            <div className="button-row">
              <button className="button" type="submit">
                Add recipe
              </button>
            </div>
          </form>

          <div className="card-stack">
            {craftingRecipes.map((recipe) => (
              <div className="item-card" key={recipe.id}>
                <div className="card-header">
                  <div>
                    <div className="value-line">{recipe.name}</div>
                    <div className="muted">
                      Outputs {recipe.outputName} · {formatCopperAsGold(recipe.goldCost)}
                    </div>
                  </div>
                  <span className="tag">{formatEnumLabel(recipe.status)}</span>
                </div>
                <p>{recipe.inputText}</p>
                <p className="muted">{recipe.outputDescription}</p>
                <form action={createCraftingJobAction} className="stack-form">
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                  <input type="hidden" name="recipeId" value={recipe.id} />
                  <div className="subgrid">
                    <label className="field-label">
                      Crafter
                      <select name="characterId" defaultValue={partySummaries[0]?.id}>
                        {partySummaries.map((character) => (
                          <option key={character.id} value={character.id}>
                            {character.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Notes
                      <input name="notes" placeholder="Pending materials from the next session." />
                    </label>
                  </div>
                  <div className="button-row">
                    <button className="button-secondary" type="submit">
                      Start job
                    </button>
                  </div>
                </form>

                <div className="list-card">
                  {recipe.jobs.map((job) => (
                    <div className="list-item" key={job.id}>
                      <div className="card-header">
                        <strong>{job.character?.name ?? "Unknown crafter"}</strong>
                        <span className="tag">{formatEnumLabel(job.status)}</span>
                      </div>
                      <p>{job.notes ?? "No notes yet."}</p>
                      <form action={completeCraftingJobAction} className="stack-form">
                        <input type="hidden" name="id" value={job.id} />
                        <input type="hidden" name="campaignSlug" value={campaign.slug} />
                        <div className="subgrid">
                          <label className="field-label">
                            Destination
                            <select defaultValue={HoldingScope.BANK} name="scope">
                              <option value={HoldingScope.BANK}>Bank</option>
                              <option value={HoldingScope.INVENTORY}>Inventory</option>
                            </select>
                          </label>
                          <label className="field-label">
                            Reward note
                            <input
                              defaultValue={`Crafted ${recipe.outputName}`}
                              name="note"
                              readOnly
                            />
                          </label>
                        </div>
                        <div className="button-row">
                          <button className="button-secondary" type="submit">
                            Complete job
                          </button>
                        </div>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <p className="footer-note">
        Phase-2 systems now have a baseline: quest board, storefronts, mail, crafting,
        compendium sync, advanced loot generation, casino, and pet care.
      </p>
    </main>
  );
}
