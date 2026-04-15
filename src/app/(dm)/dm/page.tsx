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
  deriveCraftingHoldings,
  formatCraftingMaterials,
  parseCraftingMaterials,
  summarizeCraftingMaterials,
} from "@/lib/crafting-resolution";
import {
  formatCopperAsGold,
  formatDifficultyLabel,
  formatEnumLabel,
  formatHoldingScopeLabel,
  formatRelativeTime,
  splitTags,
} from "@/lib/format";
import { buildLootPoolDraft } from "@/lib/loot-generation";
import {
  parseLootClaimInterestNames,
  parseLootReservedCharacterName,
  prioritizeInterestedCharacters,
} from "@/lib/loot-progress";
import {
  formatLootAuditDate,
  formatLootAuditDetail,
  formatLootAuditHeadline,
  getLootAuditSource,
  getRecentLootAwardEntries,
} from "@/lib/loot-audit";
import {
  buildLootHistorySections,
  filterLootAwardsByDestination,
  filterLootAwardsByRecipient,
  filterLootAwardsBySource,
  filterLootReservationsByRecipient,
  getLootHistoryDestinationCounts,
  getLootHistorySourceCounts,
  parseLootHistoryDestinationFilter,
  parseLootHistoryRecipientFilter,
  parseLootHistorySourceFilter,
} from "@/lib/loot-history";
import {
  formatLootReservationDetail,
  formatLootReservationHeadline,
  getLootReservationFreshnessTag,
  getActiveLootReservations,
} from "@/lib/loot-reservation-audit";
import {
  filterLootReservationHistoryByOperator,
  filterLootReservationHistoryByRecipient,
  filterLootReservationHistoryBySource,
  formatLootReservationHistoryDetail,
  getLootReservationHistoryOperatorCounts,
  getLootReservationHistorySourceCounts,
  getRecentLootReservationEvents,
  mapLootReservationHistoryItem,
  parseLootReservationHistoryOperatorFilter,
  parseLootReservationHistorySourceFilter,
} from "@/lib/loot-reservation-history";
import {
  assignLootPoolItemAction,
  archiveNpcAction,
  archiveCampaignAction,
  awardLootAction,
  bankLootPoolItemAction,
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
  finalizeLootPoolAction,
  generateLootPoolAction,
  recordStorefrontSaleAction,
  logoutDmAction,
  nudgeStaleReservationAction,
  replyMailThreadAction,
  reserveLootPoolItemAction,
  rollLootPoolItemAction,
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
    error?: string;
    preview?: string;
    encounterId?: string;
    title?: string;
    sourceText?: string;
    partyLevel?: string;
    difficulty?: EncounterDifficulty;
    itemCount?: string;
    includeMonsterMaterials?: string;
    notes?: string;
    historyScope?: string;
    historyRecipient?: string;
    historySource?: string;
    reservationSource?: string;
    reservationOperator?: string;
    mail?: string;
  }>;
};

function readOptionalSearchText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readOptionalSearchNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readSearchBoolean(value?: string) {
  return value === "true" || value === "on" || value === "1";
}

function buildDmHistoryHref(input: {
  params: Awaited<DmPageProps["searchParams"]>;
  historyScope: string;
  historyRecipient?: string;
  historySource?: string;
  reservationSource?: string;
  reservationOperator?: string;
}) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(input.params)) {
    if (
      !value ||
      key === "historyScope" ||
      key === "historyRecipient" ||
      key === "historySource" ||
      key === "reservationSource" ||
      key === "reservationOperator"
    ) {
      continue;
    }

    next.set(key, value);
  }

  if (input.historyScope !== "all") {
    next.set("historyScope", input.historyScope);
  }

  if (input.historyRecipient && input.historyRecipient !== "all") {
    next.set("historyRecipient", input.historyRecipient);
  }

  if (input.historySource && input.historySource !== "all") {
    next.set("historySource", input.historySource);
  }

  if (input.reservationSource && input.reservationSource !== "all") {
    next.set("reservationSource", input.reservationSource);
  }

  if (input.reservationOperator && input.reservationOperator !== "all") {
    next.set("reservationOperator", input.reservationOperator);
  }

  const query = next.toString();

  return query ? `/dm?${query}` : "/dm";
}

const dmErrorMessages: Record<string, string> = {
  "invalid-campaign-state":
    "That campaign or record could not be used because it no longer matches the current DM workspace.",
  "invalid-character-state":
    "That character could not be saved because the submitted data was incomplete or mismatched.",
  "duplicate-character-name":
    "A character with that name already exists in this campaign.",
  "invalid-npc-state":
    "That NPC card could not be saved because the submitted data was incomplete or mismatched.",
  "duplicate-npc-name":
    "An NPC with that name already exists in this campaign.",
  "invalid-encounter-state":
    "That encounter could not be saved because the selected monster no longer belongs to this campaign.",
  "invalid-loot-state":
    "That loot award could not be completed because the selected character or item was invalid.",
  "invalid-loot-pool-state":
    "That loot pool action could not be completed because the source item, encounter, or recipient no longer matched this campaign.",
  "invalid-quest-state":
    "That quest could not be saved because the selected assignee or quest no longer matched this campaign.",
  "duplicate-quest-title":
    "A quest with that title already exists in this campaign.",
  "invalid-storefront-state":
    "That storefront change could not be saved because the selected shop or item was invalid.",
  "duplicate-storefront-name":
    "A storefront with that name already exists in this campaign.",
  "invalid-mail-state":
    "That mail reply could not be added because the thread no longer matched this campaign.",
  "invalid-crafting-state":
    "That crafting change could not be saved because the recipe, character, or job was invalid.",
  "duplicate-recipe-name":
    "A crafting recipe with that name already exists in this campaign.",
  "insufficient-crafting-materials":
    "That crafter does not currently hold all of the required materials for this recipe.",
  "invalid-campaign-name":
    "Please choose a different campaign name.",
  "duplicate-campaign-name":
    "A campaign with that name already exists.",
};

const dmMailMessages: Record<string, string> = {
  nudged: "A stale reservation nudge thread was created.",
};

export default async function DmPage({ searchParams }: DmPageProps) {
  const session = await requireDmSession();
  const params = await searchParams;
  const data = await getDashboardData({
    slug: params.campaign,
    monsterQuery: params.monster,
  });
  const errorMessage = params.error ? dmErrorMessages[params.error] ?? "Unable to save that change." : null;
  const mailMessage = params.mail ? dmMailMessages[params.mail] ?? null : null;

  if (!data) {
    return (
      <main className="app-shell">
        {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
        {mailMessage ? <p className="callout">{mailMessage}</p> : null}
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
    lootPools,
    quests,
    storefronts,
    mailThreads,
    craftingRecipes,
    craftingJobs,
  } = data;
  const previewEncounterId = readOptionalSearchText(params.encounterId);
  const previewEncounter =
    previewEncounterId
      ? campaign.encounters.find((encounter) => encounter.id === previewEncounterId) ?? null
      : null;
  const defaultLootDifficulty =
    params.preview === "loot" && params.difficulty
      ? params.difficulty
      : EncounterDifficulty.MEDIUM;
  const lootDraftPreview =
    params.preview === "loot" &&
    (!previewEncounterId || previewEncounter)
      ? buildLootPoolDraft({
          campaignId: campaign.id,
          campaignName: campaign.name,
          candidates: campaign.lootItems,
          characterLevels: campaign.characters.map((character) => character.level),
          encounter: previewEncounter,
          overrides: {
            title: readOptionalSearchText(params.title),
            sourceText: readOptionalSearchText(params.sourceText),
            partyLevel: readOptionalSearchNumber(params.partyLevel),
            difficulty: defaultLootDifficulty,
            itemCount: readOptionalSearchNumber(params.itemCount),
            includeMonsterMaterials: readSearchBoolean(params.includeMonsterMaterials),
            notes: readOptionalSearchText(params.notes),
          },
        })
      : null;
  const lootPreviewErrorMessage =
    params.preview === "loot" && previewEncounterId && !previewEncounter
      ? "That encounter preview no longer matches this campaign."
      : lootDraftPreview && lootDraftPreview.items.length === 0
        ? "No previewable loot items matched that draft."
        : null;
  const defaultPartyLevel = Math.max(
    1,
    Math.round(
      partySummaries.reduce((sum, character) => sum + character.level, 0) /
        Math.max(1, partySummaries.length),
    ),
  );
  const recentLootAwards = getRecentLootAwardEntries(campaign.ledgerEntries);
  const historyScope = parseLootHistoryDestinationFilter(params.historyScope);
  const historyRecipient = parseLootHistoryRecipientFilter(
    params.historyRecipient,
    partySummaries.map((character) => character.name),
  );
  const historySource = parseLootHistorySourceFilter(params.historySource);
  const historyCounts = getLootHistoryDestinationCounts(recentLootAwards);
  const historySourceCounts = getLootHistorySourceCounts(recentLootAwards);
  const filteredRecentLootAwards = filterLootAwardsByRecipient(
    filterLootAwardsBySource(
      filterLootAwardsByDestination(recentLootAwards, historyScope),
      historySource,
    ),
    historyRecipient,
  );
  const activeLootReservations = getActiveLootReservations(
    lootPools.flatMap((pool) =>
      pool.items.map((item) => ({
        ...item,
        lootPool: {
          title: pool.title,
          sourceText: pool.sourceText,
          encounter: pool.encounter,
        },
      })),
    ),
  );
  const filteredActiveLootReservations = filterLootReservationsByRecipient(
    activeLootReservations,
    historyRecipient,
  );
  const recentReservationEvents = getRecentLootReservationEvents(
    lootPools.flatMap((pool) =>
      pool.items.flatMap((item) =>
        item.reservationEvents.map((event) => ({
          ...event,
          lootPoolItem: {
            id: item.id,
            itemNameSnapshot: item.itemNameSnapshot,
            quantity: item.quantity,
            lootPool: {
              title: pool.title,
              sourceText: pool.sourceText,
              encounter: pool.encounter,
            },
          },
        })),
      ),
    ),
  );
  const reservationSourceCounts = getLootReservationHistorySourceCounts(recentReservationEvents);
  const reservationSource = parseLootReservationHistorySourceFilter(
    params.reservationSource,
    reservationSourceCounts.sources.map((entry) => entry.source),
  );
  const reservationOperatorCounts = getLootReservationHistoryOperatorCounts(recentReservationEvents);
  const reservationOperator = parseLootReservationHistoryOperatorFilter(
    params.reservationOperator,
    reservationOperatorCounts.operators.map((entry) => entry.operator),
  );
  const recentReservationHistory = filterLootReservationHistoryByOperator(
    filterLootReservationHistoryByRecipient(
      filterLootReservationHistoryBySource(recentReservationEvents, reservationSource),
      historyRecipient,
    ),
    reservationOperator,
  );
  const lootHistorySections = buildLootHistorySections({
    awards: filteredRecentLootAwards,
    reservations: filteredActiveLootReservations,
    reservationEvents: recentReservationHistory.map(mapLootReservationHistoryItem),
  });
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

      {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
      {mailMessage ? <p className="callout">{mailMessage}</p> : null}

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
                <Compass size={14} />
                Campaign registry
              </span>
              <h2>Create and rotate campaigns</h2>
            </div>
          </div>

          <form action={createCampaignAction} className="stack-form">
            <div className="subgrid">
              <label className="field-label">
                Campaign name
                <input name="name" placeholder="Shadows of Saltreach" required />
              </label>
              <label className="field-label">
                Session night
                <input name="sessionNight" placeholder="Wednesday" />
              </label>
            </div>
            <label className="field-label">
              Setting
              <input
                name="setting"
                placeholder="Coastal politics, haunted lighthouses, and reef routes"
                required
              />
            </label>
            <label className="field-label">
              Summary
              <textarea
                name="summary"
                placeholder="Short campaign spine for the DM and player surfaces."
                required
              />
            </label>
            <div className="button-row">
              <button className="button" type="submit">
                Create campaign
              </button>
            </div>
          </form>

          <div className="list-card">
            {campaigns.map((option) => (
              <div className="list-item" key={option.id}>
                <div className="card-header">
                  <div>
                    <strong>{option.name}</strong>
                    <div className="muted">{option.setting}</div>
                  </div>
                  <span className="tag">{option.sessionNight ?? "TBD"}</span>
                </div>
                <div className="button-row">
                  <Link className="button-secondary" href={`/dm?campaign=${option.slug}`}>
                    Open
                  </Link>
                  {option.id === campaign.id ? null : (
                    <form action={archiveCampaignAction}>
                      <input type="hidden" name="id" value={option.id} />
                      <button className="button-danger" type="submit">
                        Archive
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <Coins size={14} />
                Party registry
              </span>
              <h2>Manage characters and bank PINs</h2>
            </div>
          </div>

          <form action={createCharacterAction} className="stack-form">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Character name
                <input name="name" placeholder="Kael Thorn" required />
              </label>
              <label className="field-label">
                Player name
                <input name="playerName" placeholder="Rin" required />
              </label>
              <label className="field-label">
                Class / role
                <input name="classRole" placeholder="Wizard / Support" required />
              </label>
              <label className="field-label">
                Level
                <input defaultValue="1" max="20" min="1" name="level" type="number" />
              </label>
            </div>
            <div className="subgrid">
              <label className="field-label">
                Bank PIN
                <input
                  name="pin"
                  pattern="\d{4,8}"
                  placeholder="4821"
                  required
                  type="password"
                />
              </label>
              <label className="field-label">
                Notes
                <input name="notes" placeholder="Handles ritual supplies and scroll cases" />
              </label>
            </div>
            <div className="button-row">
              <button className="button" type="submit">
                Add character
              </button>
            </div>
          </form>

          <div className="card-stack">
            {campaign.characters.map((character) => (
              <div className="item-card" key={character.id}>
                <div className="card-header">
                  <div>
                    <div className="value-line">{character.name}</div>
                    <div className="muted">
                      {character.playerName} · L{character.level} {character.classRole}
                    </div>
                  </div>
                  <span className="tag">
                    {character.bankAccess ? "PIN active" : "No bank access"}
                  </span>
                </div>
                <form action={updateCharacterAction} className="stack-form">
                  <input type="hidden" name="id" value={character.id} />
                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                  <div className="subgrid">
                    <label className="field-label">
                      Name
                      <input defaultValue={character.name} name="name" required />
                    </label>
                    <label className="field-label">
                      Player
                      <input defaultValue={character.playerName} name="playerName" required />
                    </label>
                    <label className="field-label">
                      Class / role
                      <input defaultValue={character.classRole} name="classRole" required />
                    </label>
                    <label className="field-label">
                      Level
                      <input
                        defaultValue={character.level}
                        max="20"
                        min="1"
                        name="level"
                        type="number"
                      />
                    </label>
                  </div>
                  <div className="subgrid">
                    <label className="field-label">
                      Notes
                      <input defaultValue={character.notes ?? ""} name="notes" />
                    </label>
                    <label className="field-label">
                      Rotate bank PIN
                      <input
                        name="pin"
                        pattern="\d{4,8}"
                        placeholder="Leave blank to keep current"
                        type="password"
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button className="button-secondary" type="submit">
                      Update character
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

          <div className="panel-header">
            <div>
              <span className="section-kicker">Loot Generation</span>
              <h3>Build a text reward pool</h3>
            </div>
          </div>

          <form action={generateLootPoolAction} className="stack-form">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <input type="hidden" name="campaign" value={campaign.slug} />
            <input type="hidden" name="preview" value="loot" />
            <div className="subgrid">
              <label className="field-label">
                Encounter source
                <select name="encounterId" defaultValue={previewEncounterId ?? ""}>
                  <option value="">Manual reward event</option>
                  {campaign.encounters.map((encounter) => (
                    <option key={encounter.id} value={encounter.id}>
                      {encounter.title} · {formatDifficultyLabel(encounter.difficulty)} · level{" "}
                      {encounter.partyLevel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Reward title
                <input
                  defaultValue={params.preview === "loot" ? params.title ?? "" : ""}
                  name="title"
                  placeholder="Sunken shrine spoils"
                />
              </label>
              <label className="field-label">
                Party level
                <input
                  defaultValue={
                    params.preview === "loot" ? params.partyLevel ?? String(defaultPartyLevel) : defaultPartyLevel
                  }
                  max="20"
                  min="1"
                  name="partyLevel"
                  type="number"
                />
              </label>
              <label className="field-label">
                Difficulty
                <select name="difficulty" defaultValue={defaultLootDifficulty}>
                  {Object.values(EncounterDifficulty).map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {formatDifficultyLabel(difficulty)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="subgrid">
              <label className="field-label">
                Pool note
                <input
                  defaultValue={params.preview === "loot" ? params.sourceText ?? "" : ""}
                  name="sourceText"
                  placeholder="Reward chest from the flooded gallery."
                />
              </label>
              <label className="field-label">
                Item count
                <input
                  defaultValue={params.preview === "loot" ? params.itemCount ?? "2" : "2"}
                  max="4"
                  min="1"
                  name="itemCount"
                  type="number"
                />
              </label>
            </div>
            <label className="field-label">
              <span>Monster material drops</span>
              <input
                defaultChecked={
                  params.preview === "loot"
                    ? readSearchBoolean(params.includeMonsterMaterials)
                    : true
                }
                name="includeMonsterMaterials"
                type="checkbox"
                value="true"
              />
            </label>
            <label className="field-label">
              Notes
              <textarea
                defaultValue={params.preview === "loot" ? params.notes ?? "" : ""}
                name="notes"
                placeholder="Why this pool exists or any special handling."
              />
            </label>
            <div className="button-row">
              <button className="pill-button" formAction="/dm" formMethod="get" type="submit">
                Preview draft
              </button>
              <button className="button-secondary" type="submit">
                Generate loot pool
              </button>
              {params.preview === "loot" ? (
                <Link className="nav-link" href={`/dm?campaign=${campaign.slug}`}>
                  Clear preview
                </Link>
              ) : null}
            </div>
          </form>

          {lootPreviewErrorMessage ? <p className="error-banner">{lootPreviewErrorMessage}</p> : null}
          {lootDraftPreview && !lootPreviewErrorMessage ? (
            <div className="item-card">
              <div className="card-header">
                <div>
                  <span className="section-kicker">Preview Only</span>
                  <div className="value-line">{lootDraftPreview.title}</div>
                  <div className="muted">{lootDraftPreview.sourceText}</div>
                </div>
                <span className="tag">{lootDraftPreview.distributionMode === "ROLL" ? "Roll Draft" : "Assign Draft"}</span>
              </div>
              <p>
                Party level {lootDraftPreview.partyLevel} · {formatDifficultyLabel(lootDraftPreview.difficulty)} ·{" "}
                {lootDraftPreview.items.length} item{lootDraftPreview.items.length === 1 ? "" : "s"}
              </p>
              {lootDraftPreview.notes ? <p className="muted">{lootDraftPreview.notes}</p> : null}
              <div className="list-card">
                {lootDraftPreview.items.map((item, index) => (
                  <div className="list-item" key={`${item.itemNameSnapshot}-${index}`}>
                    <div className="card-header">
                      <strong>{item.itemNameSnapshot}</strong>
                      <span className="tag">× {item.quantity}</span>
                    </div>
                    <p className="muted">
                      {formatEnumLabel(item.raritySnapshot)} · {formatEnumLabel(item.kindSnapshot)}
                    </p>
                    {item.resolutionMetadata ? <p className="muted">{item.resolutionMetadata}</p> : null}
                  </div>
                ))}
              </div>
              <p className="callout">
                Preview only. Nothing is saved until you run Generate loot pool.
              </p>
            </div>
          ) : null}

          <div className="panel-header">
            <div>
              <span className="section-kicker">Loot Distribution</span>
              <h3>Assign, roll, or bank items</h3>
            </div>
          </div>

          <div className="card-stack">
            {lootPools.length > 0 ? (
              lootPools.map((pool) => (
                <div className="item-card" key={pool.id}>
                  <div className="card-header">
                    <div>
                      <div className="value-line">{pool.title}</div>
                      <div className="muted">
                        {pool.encounter
                          ? `${pool.encounter.title} · ${formatDifficultyLabel(pool.encounter.difficulty)}`
                          : pool.sourceText ?? "Manual reward pool"}
                      </div>
                    </div>
                    <span className="tag">{formatEnumLabel(pool.status)}</span>
                  </div>
                  <p>
                    Party level {pool.partyLevel}
                    {pool.difficulty ? ` · ${formatDifficultyLabel(pool.difficulty)}` : ""}
                  </p>
                  {pool.notes ? <p className="muted">{pool.notes}</p> : null}
                  <div className="list-card">
                    {pool.items.map((item) => (
                      <div className="list-item" key={item.id}>
                        {(() => {
                          const claimInterestNames = parseLootClaimInterestNames(item.resolutionMetadata);
                          const reservedCharacterName = parseLootReservedCharacterName(item.resolutionMetadata);
                          const reservedCharacter =
                            reservedCharacterName
                              ? partySummaries.find(
                                  (character) =>
                                    character.name.toLowerCase() === reservedCharacterName.toLowerCase(),
                                ) ?? null
                              : null;
                          const { interestedCharacters, orderedCharacters: assignmentOptions } =
                            prioritizeInterestedCharacters({
                              names: claimInterestNames,
                              characters: partySummaries,
                            });
                          const defaultAssigneeId =
                            reservedCharacter?.id ??
                            interestedCharacters[0]?.id ??
                            partySummaries[0]?.id;

                          return (
                            <>
                        <div className="card-header">
                          <div>
                            <strong>{item.itemNameSnapshot}</strong>
                            <div className="muted">
                              {formatEnumLabel(item.raritySnapshot)} · {formatEnumLabel(item.kindSnapshot)} · ×{" "}
                              {item.quantity}
                            </div>
                          </div>
                          <span className="tag">{formatEnumLabel(item.status)}</span>
                        </div>
                        {!item.lootItem ? (
                          <p className="muted">This pool item will become a loot record when it is assigned, rolled, or banked.</p>
                        ) : null}
                        {item.awardedCharacter ? (
                          <p className="muted">
                            Assigned to {item.awardedCharacter.name}
                            {item.resolutionScope ? ` · ${formatHoldingScopeLabel(item.resolutionScope)}` : ""}
                          </p>
                        ) : null}
                        {claimInterestNames.length > 0 ? (
                          <div className="tag-row">
                            {claimInterestNames.map((name) => (
                              <span className="tag" key={name}>
                                Interested: {name}
                              </span>
                            ))}
                            {reservedCharacterName ? (
                              <span className="tag">Reserved: {reservedCharacterName}</span>
                            ) : null}
                          </div>
                        ) : reservedCharacterName ? (
                          <div className="tag-row">
                            <span className="tag">Reserved: {reservedCharacterName}</span>
                          </div>
                        ) : null}
                        {item.status === "BANKED" &&
                        (assignmentOptions.length > 0 || reservedCharacterName) ? (
                          <div className="card-stack">
                              <div className="list-card">
                                <div className="card-header">
                                  <strong>
                                    {reservedCharacterName
                                      ? `Reserved for ${reservedCharacterName}`
                                      : "Reserve claim"}
                                  </strong>
                                  <span className="tag">
                                    {reservedCharacterName ? "Reservation active" : "Optional hold"}
                                  </span>
                                </div>
                                <form action={reserveLootPoolItemAction} className="stack-form">
                                  <input type="hidden" name="campaignId" value={campaign.id} />
                                  <input type="hidden" name="campaignSlug" value={campaign.slug} />
                                  <input type="hidden" name="lootPoolItemId" value={item.id} />
                                  <label className="field-label">
                                    Reserve for
                                    <select
                                      name="characterId"
                                      defaultValue={reservedCharacter?.id ?? defaultAssigneeId}
                                    >
                                      {assignmentOptions.map((character) => (
                                        <option key={character.id} value={character.id}>
                                          {character.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <div className="button-row">
                                    <button className="button-secondary" type="submit">
                                      Reserve item
                                    </button>
                                    {reservedCharacterName ? (
                                      <button className="pill-button" name="characterId" value="" type="submit">
                                        Clear reservation
                                      </button>
                                    ) : null}
                                  </div>
                                </form>
                                {reservedCharacter ? (
                                  <div className="button-row">
                                    <form action={assignLootPoolItemAction}>
                                      <input type="hidden" name="campaignId" value={campaign.id} />
                                      <input type="hidden" name="campaignSlug" value={campaign.slug} />
                                      <input type="hidden" name="lootPoolItemId" value={item.id} />
                                      <input type="hidden" name="characterId" value={reservedCharacter.id} />
                                      <input type="hidden" name="scope" value={HoldingScope.BANK} />
                                      <input
                                        type="hidden"
                                        name="note"
                                        value={`Approved ${reservedCharacter.name}'s claim and sent item to Bank.`}
                                      />
                                      <button className="button-secondary" type="submit">
                                        Approve to bank
                                      </button>
                                    </form>
                                    <form action={assignLootPoolItemAction}>
                                      <input type="hidden" name="campaignId" value={campaign.id} />
                                      <input type="hidden" name="campaignSlug" value={campaign.slug} />
                                      <input type="hidden" name="lootPoolItemId" value={item.id} />
                                      <input type="hidden" name="characterId" value={reservedCharacter.id} />
                                      <input type="hidden" name="scope" value={HoldingScope.INVENTORY} />
                                      <input
                                        type="hidden"
                                        name="note"
                                        value={`Approved ${reservedCharacter.name}'s claim and sent item to Inventory.`}
                                      />
                                      <button className="pill-button" type="submit">
                                        Approve to inventory
                                      </button>
                                    </form>
                                  </div>
                                ) : null}
                              </div>
                          </div>
                        ) : null}
                        {item.resolutionMetadata ? <p className="muted">{item.resolutionMetadata}</p> : null}
                        {item.rollEntries.length > 0 ? (
                          <div className="tag-row">
                            {item.rollEntries.map((entry) => (
                              <span className="tag" key={entry.id}>
                                {entry.character.name}
                                {entry.rollTotal ? ` ${entry.rollTotal}` : ""} · {formatEnumLabel(entry.status)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {item.status === "UNRESOLVED" || item.status === "BANKED" ? (
                          <div className="card-stack">
                            <form action={assignLootPoolItemAction} className="stack-form">
                              <input type="hidden" name="campaignId" value={campaign.id} />
                              <input type="hidden" name="campaignSlug" value={campaign.slug} />
                              <input type="hidden" name="lootPoolItemId" value={item.id} />
                              <div className="subgrid">
                                <label className="field-label">
                                  Assign to
                                  <select name="characterId" defaultValue={defaultAssigneeId}>
                                    {assignmentOptions.map((character) => (
                                      <option key={character.id} value={character.id}>
                                        {character.name}
                                        {claimInterestNames.some(
                                          (name) => name.toLowerCase() === character.name.toLowerCase(),
                                        )
                                          ? " · interested"
                                          : ""}
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
                              </div>
                              <label className="field-label">
                                Note
                                <input
                                  name="note"
                                  placeholder={
                                    interestedCharacters.length > 0
                                      ? "Approve an interested player or override."
                                      : "Direct award note"
                                  }
                                />
                              </label>
                              <div className="button-row">
                                <button className="button-secondary" type="submit">
                                  Assign item
                                </button>
                              </div>
                            </form>

                            <form action={rollLootPoolItemAction} className="stack-form">
                              <input type="hidden" name="campaignId" value={campaign.id} />
                              <input type="hidden" name="campaignSlug" value={campaign.slug} />
                              <input type="hidden" name="lootPoolItemId" value={item.id} />
                              <div className="subgrid">
                                <label className="field-label">
                                  Roll destination
                                  <select name="scope" defaultValue={HoldingScope.BANK}>
                                    <option value={HoldingScope.BANK}>Bank</option>
                                    <option value={HoldingScope.INVENTORY}>Inventory</option>
                                  </select>
                                </label>
                                <label className="field-label">
                                  Roll note
                                  <input name="note" placeholder="Party roll note" />
                                </label>
                              </div>
                              <div className="button-row">
                                <button className="button-secondary" type="submit">
                                  Run party roll
                                </button>
                              </div>
                            </form>

                            <form action={bankLootPoolItemAction} className="stack-form">
                              <input type="hidden" name="campaignId" value={campaign.id} />
                              <input type="hidden" name="campaignSlug" value={campaign.slug} />
                              <input type="hidden" name="lootPoolItemId" value={item.id} />
                              <label className="field-label">
                                Bank note
                                <input name="note" placeholder="Keep this for later." />
                              </label>
                              <div className="button-row">
                                <button className="button-secondary" type="submit">
                                  Bank for later
                                </button>
                              </div>
                            </form>
                          </div>
                        ) : null}
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                  {pool.items.every((item) => item.status !== "UNRESOLVED") ? (
                    <form action={finalizeLootPoolAction} className="stack-form">
                      <input type="hidden" name="campaignId" value={campaign.id} />
                      <input type="hidden" name="campaignSlug" value={campaign.slug} />
                      <input type="hidden" name="lootPoolId" value={pool.id} />
                      <div className="button-row">
                        <button className="button-secondary" type="submit">
                          Close pool
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="callout">No generated loot pools yet. Use the generator above or keep using manual awards.</div>
            )}
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

          <div className="tag-row">
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope: "all",
                historyRecipient,
                historySource,
              })}
            >
              All {historyCounts.all}
            </Link>
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope: "bank",
                historyRecipient,
                historySource,
              })}
            >
              Bank {historyCounts.bank}
            </Link>
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope: "inventory",
                historyRecipient,
                historySource,
              })}
            >
              Inventory {historyCounts.inventory}
            </Link>
          </div>
          <div className="tag-row">
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope,
                historyRecipient: "all",
                historySource,
              })}
            >
              Everyone
            </Link>
            {partySummaries.map((character) => (
              <Link
                className="tag"
                href={buildDmHistoryHref({
                  params,
                  historyScope,
                  historyRecipient: character.name,
                  historySource,
                })}
                key={character.id}
              >
                {character.name}
              </Link>
            ))}
          </div>
          <div className="tag-row">
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope,
                historyRecipient,
                historySource: "all",
              })}
            >
              All sources {historySourceCounts.all}
            </Link>
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope,
                historyRecipient,
                historySource: "Claim approved",
              })}
            >
              Claim approved {historySourceCounts.claimApproved}
            </Link>
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope,
                historyRecipient,
                historySource: "Party roll",
              })}
            >
              Party roll {historySourceCounts.partyRoll}
            </Link>
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope,
                historyRecipient,
                historySource: "Direct assignment",
              })}
            >
              Direct {historySourceCounts.directAssignment}
            </Link>
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope,
                historyRecipient,
                historySource: "Manual award",
              })}
            >
              Manual {historySourceCounts.manualAward}
            </Link>
          </div>
          <div className="list-card">
            {filteredRecentLootAwards.length > 0 ? (
              filteredRecentLootAwards.map((entry) => (
              <div className="list-item" key={entry.id}>
                {(() => {
                  const source = getLootAuditSource(entry);

                  return (
                    <>
                <div className="card-header">
                  <strong>{formatLootAuditHeadline(entry)}</strong>
                  <span className="tag">{formatLootAuditDate(entry.createdAt)}</span>
                </div>
                <div className="tag-row">
                  <span className="tag">{source.label}</span>
                  {source.detail ? <span className="tag">{source.detail}</span> : null}
                </div>
                <div className="muted">
                  {formatLootAuditDetail(entry)}
                  {entry.goldDelta ? ` · ${formatCopperAsGold(entry.goldDelta)}` : ""}
                </div>
                <p>{entry.note}</p>
                    </>
                  );
                })()}
              </div>
              ))
            ) : (
              <div className="callout">No loot deliveries match this destination and recipient filter.</div>
            )}
          </div>

          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                History lanes
              </span>
              <h3>Grouped loot history</h3>
            </div>
          </div>
          <div className="card-stack">
            {lootHistorySections.map((section) => (
              <div className="list-card" key={section.key}>
                <div className="card-header">
                  <strong>{section.title}</strong>
                  <span className="tag">{section.count}</span>
                </div>
                {section.items.length > 0 ? (
                  section.items.slice(0, 3).map((item) => (
                    <div className="list-item" key={item.id}>
                      <div className="card-header">
                        <strong>{item.headline}</strong>
                        <span className="tag">{formatLootAuditDate(item.happenedAt)}</span>
                      </div>
                      <div className="tag-row">
                        {item.tags.map((tag) => (
                          <span className="tag" key={`${item.id}-${tag}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="muted">{item.detail}</div>
                      <p>{item.note}</p>
                    </div>
                  ))
                ) : (
                  <div className="callout">No entries in this lane yet.</div>
                )}
              </div>
            ))}
          </div>

          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                Reservation watch
              </span>
              <h3>Active reservations</h3>
            </div>
          </div>
          {filteredActiveLootReservations.length > 0 ? (
            <div className="list-card">
              {filteredActiveLootReservations.slice(0, 8).map((reservation) => (
                (() => {
                  const freshnessTag = getLootReservationFreshnessTag(reservation.reservedAt);

                  return (
                    <div className="list-item" key={reservation.id}>
                      <div className="card-header">
                        <strong>{formatLootReservationHeadline(reservation)}</strong>
                        <span className="tag">{formatLootAuditDate(reservation.reservedAt)}</span>
                      </div>
                      <div className="tag-row">
                        <span className="tag">Reserved</span>
                        <span className="tag">{reservation.reservedForName}</span>
                        {freshnessTag ? <span className="tag">{freshnessTag}</span> : null}
                        <span className="tag">{formatRelativeTime(reservation.reservedAt)}</span>
                        {reservation.claimInterestNames.length > 0 ? (
                          <span className="tag">{reservation.claimInterestNames.length} interested</span>
                        ) : null}
                      </div>
                      <div className="muted">{formatLootReservationDetail(reservation)}</div>
                      <p>{reservation.detail}</p>
                      {freshnessTag ? (
                        <form action={nudgeStaleReservationAction} className="button-row">
                          <input type="hidden" name="campaignId" value={campaign.id} />
                          <input type="hidden" name="campaignSlug" value={campaign.slug} />
                          <input type="hidden" name="lootPoolItemId" value={reservation.id} />
                          <button className="button-secondary" type="submit">
                            {freshnessTag === "Overdue" ? "Nudge overdue reservation" : "Nudge stale reservation"}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  );
                })()
              ))}
            </div>
          ) : (
            <div className="callout">No banked loot reservations match this recipient filter.</div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                Reservation history
              </span>
              <h3>Recent reservation events</h3>
            </div>
          </div>
          <div className="tag-row">
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope,
                historyRecipient,
                historySource,
                reservationSource: "all",
                reservationOperator,
              })}
            >
              All sources {reservationSourceCounts.all}
            </Link>
            {reservationSourceCounts.sources.map((entry) => (
              <Link
                className="tag"
                href={buildDmHistoryHref({
                  params,
                  historyScope,
                  historyRecipient,
                  historySource,
                  reservationSource: entry.source,
                  reservationOperator,
                })}
                key={entry.source}
              >
                {entry.source} {entry.count}
              </Link>
            ))}
          </div>
          <div className="tag-row">
            <Link
              className="tag"
              href={buildDmHistoryHref({
                params,
                historyScope,
                historyRecipient,
                historySource,
                reservationSource,
                reservationOperator: "all",
              })}
            >
              All operators {reservationOperatorCounts.all}
            </Link>
            {reservationOperatorCounts.operators.map((entry) => (
              <Link
                className="tag"
                href={buildDmHistoryHref({
                  params,
                  historyScope,
                  historyRecipient,
                  historySource,
                  reservationSource,
                  reservationOperator: entry.operator,
                })}
                key={entry.operator}
              >
                {entry.operator} {entry.count}
              </Link>
            ))}
          </div>
          {recentReservationHistory.length > 0 ? (
            <div className="list-card">
              {recentReservationHistory.slice(0, 8).map((event) => {
                const item = mapLootReservationHistoryItem(event);
                const freshnessTag = getLootReservationFreshnessTag(item.createdAt);

                return (
                  <div className="list-item" key={item.id}>
                    <div className="card-header">
                      <strong>{item.headline}</strong>
                      <span className="tag">{formatLootAuditDate(item.createdAt)}</span>
                    </div>
                    <div className="tag-row">
                      {item.tags.map((tag) => (
                        <span className="tag" key={`${item.id}-${tag}`}>
                          {tag}
                        </span>
                      ))}
                      {freshnessTag ? <span className="tag">{freshnessTag}</span> : null}
                      <span className="tag">{formatRelativeTime(item.createdAt)}</span>
                      {reservationSource !== "all" ? <span className="tag">Source {reservationSource}</span> : null}
                      {reservationOperator !== "all" ? (
                        <span className="tag">Operator {reservationOperator}</span>
                      ) : null}
                      {item.actorName ? <span className="tag">Operator {item.actorName}</span> : null}
                    </div>
                    <div className="muted">{formatLootReservationHistoryDetail(event)}</div>
                    <p>{item.note}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="callout">No reservation events have been recorded yet.</div>
          )}
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

          {params.sync ? (
            <p className="callout">
              Synced {params.sync} from {params.source ?? "configured source"} with the
              bounded server-side importer.
            </p>
          ) : null}

          <form action={syncCompendiumAction} className="stack-form">
            <input type="hidden" name="campaignSlug" value={campaign.slug} />
            <div className="subgrid">
              <label className="field-label">
                Import kind
                <select defaultValue="monsters" name="kind">
                  <option value="monsters">Monsters</option>
                  <option value="magic-items">Magic items</option>
                </select>
              </label>
              <label className="field-label">
                Primary source
                <select defaultValue="OPEN5E" name="source">
                  <option value="OPEN5E">Open5e with fallback</option>
                  <option value="DND5E">D&D 5e SRD fallback only</option>
                </select>
              </label>
              <label className="field-label">
                Search filter
                <input name="search" placeholder="goblin, shield, dragon" />
              </label>
              <label className="field-label">
                Page size
                <input defaultValue="6" max="10" min="1" name="pageSize" type="number" />
              </label>
              <label className="field-label">
                Page limit
                <input defaultValue="1" max="2" min="1" name="pageLimit" type="number" />
              </label>
            </div>
            <div className="button-row">
              <button className="button-secondary" type="submit">
                Sync compendium slice
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
              Structured materials
              <textarea
                name="materialsText"
                placeholder="2x Leather, 1x Silver Thread, 1x Ward Chalk"
                required
              />
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
            {craftingRecipes.map((recipe) => {
              const recipeMaterials = parseCraftingMaterials(recipe.materialsText);

              return (
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
                  <p className="muted">
                    <strong>Materials:</strong> {formatCraftingMaterials(recipeMaterials)}
                  </p>
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
                    {recipe.jobs.map((job) => {
                      const crafter = partySummaries.find((character) => character.id === job.characterId);
                      const materialCheck = crafter
                        ? summarizeCraftingMaterials(
                            recipeMaterials,
                            deriveCraftingHoldings(crafter.ledgerEntries),
                          )
                        : null;

                      return (
                        <div className="list-item" key={job.id}>
                          <div className="card-header">
                            <strong>{job.character?.name ?? "Unknown crafter"}</strong>
                            <span className="tag">{formatEnumLabel(job.status)}</span>
                          </div>
                          <p>{job.notes ?? "No notes yet."}</p>
                          <p className="muted">
                            {materialCheck
                              ? materialCheck.isMet
                                ? "Materials ready from current holdings."
                                : `Missing: ${materialCheck.missing.join(", ")}`
                              : "Crafter holdings are unavailable."}
                          </p>
                          {job.resolutionText ? <p className="muted">{job.resolutionText}</p> : null}
                          {job.status === CraftingJobStatus.IN_PROGRESS ? (
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
                                <div className="field-label">
                                  Resolution
                                  <div className="callout">
                                    Rolls server-side and applies success, mixed, or failure text.
                                  </div>
                                </div>
                              </div>
                              <div className="button-row">
                                <button className="button-secondary" type="submit">
                                  Resolve craft
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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
