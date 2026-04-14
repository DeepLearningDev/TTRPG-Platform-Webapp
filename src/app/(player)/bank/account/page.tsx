import { Coins, Package2, ScrollText, Store, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlayerAccountBySession } from "@/lib/campaign-vault";
import { formatCraftingMaterials, parseCraftingMaterials } from "@/lib/crafting-resolution";
import { formatCopperAsGold, formatEnumLabel } from "@/lib/format";
import {
  formatLootAuditDate,
  formatLootAuditHeadline,
  getLootAuditSource,
  getRecentLootAwardEntries,
} from "@/lib/loot-audit";
import {
  formatLootReservationDetail,
  formatLootReservationHeadline,
  getActiveLootReservations,
} from "@/lib/loot-reservation-audit";
import {
  getPlayerLootItemProgress,
  summarizePlayerLootPool,
} from "@/lib/loot-progress";
import { clearPlayerSession, getPlayerSession } from "@/lib/player-session";
import {
  acceptQuestAction,
  logoutBankAction,
  markLootClaimInterestAction,
  passOnLootPoolItemAction,
  replyToMailThreadAction,
  rollOnLootPoolItemAction,
  withdrawLootClaimInterestAction,
} from "../actions";

type BankAccountPageProps = {
  searchParams: Promise<{
    error?: string;
    loot?: string;
    quest?: string;
    mail?: string;
  }>;
};

const lootActionMessages: Record<string, string> = {
  rolled: "Your roll was recorded for that loot item.",
  passed: "You passed on that loot item.",
  interested: "Your interest was recorded for that banked item.",
  withdrawn: "Your interest was removed from that banked item.",
};

const questActionMessages: Record<string, string> = {
  accepted: "You accepted that quest from the party board.",
  acknowledged: "You acknowledged your assigned quest and moved it into active work.",
};

const mailActionMessages: Record<string, string> = {
  sent: "Your reply was posted to that mail thread.",
};

const lootErrorMessages: Record<string, string> = {
  "invalid-loot-pool-state":
    "That loot item is no longer open for your character.",
  "duplicate-loot-response":
    "You already responded to that loot item.",
  "invalid-player-quest-state":
    "That quest is no longer available for your character to accept or acknowledge.",
  "invalid-player-mail-state":
    "That mail reply could not be posted because the thread is no longer available to your character.",
};

export default async function BankAccountPage({ searchParams }: BankAccountPageProps) {
  const session = await getPlayerSession();

  if (!session) {
    redirect("/bank");
  }

  const [account, params] = await Promise.all([
    getPlayerAccountBySession(session),
    searchParams,
  ]);

  if (!account) {
    await clearPlayerSession();
    redirect("/bank");
  }

  const successMessage = params.loot ? lootActionMessages[params.loot] ?? null : null;
  const questMessage = params.quest ? questActionMessages[params.quest] ?? null : null;
  const mailMessage = params.mail ? mailActionMessages[params.mail] ?? null : null;
  const errorMessage = params.error
    ? lootErrorMessages[params.error] ?? "Unable to save that loot response."
    : null;
  const overallLootProgress = account.lootPools.reduce(
    (summary, pool) => {
      const poolSummary = summarizePlayerLootPool({
        accountId: account.id,
        actorName: account.name,
        items: pool.items,
      });

      summary.actionNeeded += poolSummary.actionNeeded;
      summary.awaitingResolution += poolSummary.awaitingResolution;
      summary.reservedForYou += poolSummary.reservedForYou;
      summary.assignedToYou += poolSummary.assignedToYou;
      summary.banked += poolSummary.banked;

      return summary;
    },
    {
      actionNeeded: 0,
      awaitingResolution: 0,
      reservedForYou: 0,
      assignedToYou: 0,
      banked: 0,
    },
  );
  const recentLootAwards = getRecentLootAwardEntries(account.ledgerEntries);
  const activeLootReservations = getActiveLootReservations(
    account.lootPools.flatMap((pool) =>
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
  const myActiveReservations = activeLootReservations.filter(
    (reservation) => reservation.reservedForName.toLowerCase() === account.name.toLowerCase(),
  );

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark">
          <span className="brand-glyph">CV</span>
          {account.name} Player Hub
        </div>
        <div className="nav-links">
          <Link className="nav-link" href="/">
            Overview
          </Link>
          <form action={logoutBankAction}>
            <button className="pill-button" type="submit">
              Log out
            </button>
          </form>
        </div>
      </header>

      {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
      {successMessage ? <p className="callout">{successMessage}</p> : null}
      {questMessage ? <p className="callout">{questMessage}</p> : null}
      {mailMessage ? <p className="callout">{mailMessage}</p> : null}

      <section className="hero">
        <span className="section-kicker">
          <Coins size={14} />
          {account.campaign.name}
        </span>
        <h1>{account.name}</h1>
        <p>
          {account.classRole} · level {account.level} · player {account.playerName}
        </p>
      </section>

      <section className="stats-grid">
        <article className="metric-card">
          <span className="metric-label">Banked gold</span>
          <div className="metric-value">{formatCopperAsGold(account.bankSnapshot.gold)}</div>
        </article>
        <article className="metric-card">
          <span className="metric-label">Stored items</span>
          <div className="metric-value">{account.bankSnapshot.items.length}</div>
        </article>
        <article className="metric-card">
          <span className="metric-label">Open quests</span>
          <div className="metric-value">{account.campaign.quests.length}</div>
        </article>
        <article className="metric-card">
          <span className="metric-label">Crafting jobs</span>
          <div className="metric-value">{account.campaign.craftingJobs.length}</div>
        </article>
        <article className="metric-card">
          <span className="metric-label">Loot actions</span>
          <div className="metric-value">{overallLootProgress.actionNeeded}</div>
        </article>
        <article className="metric-card">
          <span className="metric-label">Reserved for you</span>
          <div className="metric-value">{overallLootProgress.reservedForYou}</div>
        </article>
        <article className="metric-card">
          <span className="metric-label">Assigned to you</span>
          <div className="metric-value">{overallLootProgress.assignedToYou}</div>
        </article>
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <Package2 size={14} />
                Loot pools
              </span>
              <h2>Pending and recent distribution</h2>
            </div>
          </div>
          <div className="card-stack">
            {account.lootPools.length > 0 ? (
              account.lootPools.map((pool) => {
                const poolSummary = summarizePlayerLootPool({
                  accountId: account.id,
                  actorName: account.name,
                  items: pool.items,
                });

                return (
                  <div className="item-card" key={pool.id}>
                  <div className="card-header">
                    <div>
                      <div className="value-line">{pool.title}</div>
                      <div className="muted">
                        {pool.encounter
                          ? `${pool.encounter.title} · level ${pool.encounter.partyLevel}`
                          : pool.sourceText ?? "Manual reward pool"}
                      </div>
                    </div>
                    <span className="tag">{formatEnumLabel(pool.status)}</span>
                  </div>
                  <div className="tag-row">
                    {poolSummary.actionNeeded > 0 ? (
                      <span className="tag danger-tag">
                        {poolSummary.actionNeeded} action needed
                      </span>
                    ) : null}
                    {poolSummary.awaitingResolution > 0 ? (
                      <span className="tag">
                        {poolSummary.awaitingResolution} awaiting resolution
                      </span>
                    ) : null}
                    {poolSummary.reservedForYou > 0 ? (
                      <span className="tag">
                        {poolSummary.reservedForYou} reserved for you
                      </span>
                    ) : null}
                    {poolSummary.assignedToYou > 0 ? (
                      <span className="tag">
                        {poolSummary.assignedToYou} assigned to you
                      </span>
                    ) : null}
                    {poolSummary.banked > 0 ? (
                      <span className="tag">
                        {poolSummary.banked} banked for later
                      </span>
                    ) : null}
                    {poolSummary.claimInterest > 0 ? (
                      <span className="tag">
                        {poolSummary.claimInterest} marked by you
                      </span>
                    ) : null}
                    {poolSummary.actionNeeded === 0 &&
                    poolSummary.awaitingResolution === 0 &&
                    poolSummary.reservedForYou === 0 &&
                    poolSummary.assignedToYou === 0 &&
                    poolSummary.banked === 0 &&
                    poolSummary.claimInterest === 0 ? (
                      <span className="tag">No open actions in this pool</span>
                    ) : null}
                  </div>
                  <div className="card-stack">
                    {pool.items.map((item) => {
                      const progress = getPlayerLootItemProgress({
                        accountId: account.id,
                        actorName: account.name,
                        item,
                      });
                      const myRoll = progress.myRoll;
                      const canRespond =
                        item.status === "UNRESOLVED" &&
                        item.distributionMode === "ROLL" &&
                        !myRoll;

                      return (
                        <div className="list-item" key={item.id}>
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
                          <p className="muted">
                            {progress.headline}
                          </p>
                          <p className="muted">{progress.detail}</p>
                          {myRoll ? (
                            <p className="muted">
                              Your roll: {myRoll.rollTotal ?? "not rolled"} · {formatEnumLabel(myRoll.status)}
                            </p>
                          ) : null}
                          {item.status === "UNRESOLVED" && item.rollEntries.length > 0 ? (
                            <p className="muted">
                              {item.rollEntries.length} party response(s) recorded so far.
                            </p>
                          ) : null}
                          {item.resolutionMetadata ? <p className="muted">{item.resolutionMetadata}</p> : null}
                          {progress.key === "banked" && !progress.reservedForName ? (
                            <div className="button-row">
                              {progress.hasClaimInterest ? (
                                <form action={withdrawLootClaimInterestAction}>
                                  <input type="hidden" name="lootPoolItemId" value={item.id} />
                                  <button className="pill-button" type="submit">
                                    Withdraw interest
                                  </button>
                                </form>
                              ) : (
                                <form action={markLootClaimInterestAction}>
                                  <input type="hidden" name="lootPoolItemId" value={item.id} />
                                  <button className="button-secondary" type="submit">
                                    Mark interest
                                  </button>
                                </form>
                              )}
                            </div>
                          ) : null}
                          {canRespond ? (
                            <div className="button-row">
                              <form action={rollOnLootPoolItemAction}>
                                <input type="hidden" name="lootPoolItemId" value={item.id} />
                                <button className="button-secondary" type="submit">
                                  Roll
                                </button>
                              </form>
                              <form action={passOnLootPoolItemAction}>
                                <input type="hidden" name="lootPoolItemId" value={item.id} />
                                <button className="pill-button" type="submit">
                                  Pass
                                </button>
                              </form>
                            </div>
                          ) : null}
                          {myRoll && item.status === "UNRESOLVED" ? (
                            <p className="muted">
                              Your response is locked in while the party finishes this item.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  </div>
                );
              })
            ) : (
              <div className="callout">No shared loot pools are active right now.</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <Package2 size={14} />
                Bank contents
              </span>
              <h2>Stored gear</h2>
            </div>
          </div>
          <div className="card-stack">
            {account.bankSnapshot.items.length > 0 ? (
              account.bankSnapshot.items.map((item) => (
                <div className="item-card" key={item.id}>
                  <div className="card-header">
                    <div className="value-line">{item.name}</div>
                    <span className="tag">× {item.quantity}</span>
                  </div>
                  <div className="muted">
                    {formatEnumLabel(item.rarity)} · {formatEnumLabel(item.kind)}
                  </div>
                </div>
              ))
            ) : (
              <div className="callout">No items are currently stored in the bank.</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                Recent loot
              </span>
              <h2>Recent deliveries</h2>
            </div>
          </div>
          {recentLootAwards.length > 0 ? (
            <div className="list-card">
              {recentLootAwards.slice(0, 8).map((entry) => (
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
                    {entry.scope === "BANK" ? "Bank" : "Inventory"}
                    {entry.goldDelta ? ` · ${formatCopperAsGold(entry.goldDelta)}` : ""}
                  </div>
                  <p>{entry.note}</p>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <div className="callout">No loot deliveries have been recorded yet.</div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                Reservation watch
              </span>
              <h2>Your reserved items</h2>
            </div>
          </div>
          {myActiveReservations.length > 0 ? (
            <div className="list-card">
              {myActiveReservations.slice(0, 8).map((reservation) => (
                <div className="list-item" key={reservation.id}>
                  <div className="card-header">
                    <strong>{formatLootReservationHeadline(reservation)}</strong>
                    <span className="tag">{formatLootAuditDate(reservation.reservedAt)}</span>
                  </div>
                  <div className="tag-row">
                    <span className="tag">Reserved for you</span>
                    {reservation.claimInterestNames.length > 0 ? (
                      <span className="tag">{reservation.claimInterestNames.length} interested</span>
                    ) : null}
                  </div>
                  <div className="muted">{formatLootReservationDetail(reservation)}</div>
                  <p>{reservation.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="callout">No banked loot is currently reserved for you.</div>
          )}
        </article>
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                Quest board
              </span>
              <h2>Current jobs</h2>
            </div>
          </div>
          <div className="card-stack">
            {account.campaign.quests.length > 0 ? (
              account.campaign.quests.map((quest) => (
                (() => {
                  const canAccept = quest.status === "OPEN" && !quest.assignee;
                  const canAcknowledge =
                    quest.status === "OPEN" && quest.assignee?.id === account.id;

                  return (
                    <div className="item-card" key={quest.id}>
                      <div className="card-header">
                        <div>
                          <div className="value-line">{quest.title}</div>
                          <div className="muted">
                            {quest.assignee ? `Assigned to ${quest.assignee.name}` : "Open to the party"}
                          </div>
                        </div>
                        <span className="tag">{formatEnumLabel(quest.status)}</span>
                      </div>
                      <p>{quest.objective}</p>
                      <div className="muted">
                        Reward: {formatCopperAsGold(quest.rewardGold)}
                        {quest.rewardText ? ` · ${quest.rewardText}` : ""}
                      </div>
                      {canAccept || canAcknowledge ? (
                        <form action={acceptQuestAction} className="button-row">
                          <input type="hidden" name="questId" value={quest.id} />
                          <button className="button-secondary" type="submit">
                            {canAccept ? "Accept quest" : "Acknowledge quest"}
                          </button>
                        </form>
                      ) : quest.assignee?.id === account.id ? (
                        <p className="muted">You are the current quest assignee.</p>
                      ) : null}
                    </div>
                  );
                })()
              ))
            ) : (
              <div className="callout">No active quests are posted right now.</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <Store size={14} />
                Storefronts
              </span>
              <h2>Shop offers</h2>
            </div>
          </div>
          <div className="card-stack">
            {account.campaign.storefronts.length > 0 ? (
              account.campaign.storefronts.map((storefront) => (
                <div className="item-card" key={storefront.id}>
                  <div className="card-header">
                    <div>
                      <div className="value-line">{storefront.name}</div>
                      <div className="muted">{storefront.keeperName ?? "DM-run shop"}</div>
                    </div>
                    <span className="tag">{storefront.offers.length} offer(s)</span>
                  </div>
                  <p>{storefront.description}</p>
                  <div className="tag-row">
                    {storefront.offers.slice(0, 4).map((offer) => (
                      <span className="tag" key={offer.id}>
                        {offer.itemName} · {formatCopperAsGold(offer.priceGold * 100)}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="callout">No active storefronts are open in this campaign.</div>
            )}
          </div>
        </article>
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                Mail
              </span>
              <h2>Visible threads</h2>
            </div>
          </div>
          <div className="card-stack">
            {account.visibleMailThreads.length > 0 ? (
              account.visibleMailThreads.map((thread) => (
                <div className="item-card" key={thread.id}>
                  <div className="card-header">
                    <div>
                      <div className="value-line">{thread.subject}</div>
                      <div className="muted">
                        {thread.senderName} → {thread.recipientName}
                      </div>
                    </div>
                    <span className="tag">{thread.messages.length} message(s)</span>
                  </div>
                  <div className="list-card">
                    {thread.messages.slice(-2).map((message) => (
                      <div className="list-item" key={message.id}>
                        <strong>{message.fromName}</strong>
                        <p>{message.body}</p>
                      </div>
                    ))}
                  </div>
                  <form action={replyToMailThreadAction} className="stack-form">
                    <input type="hidden" name="threadId" value={thread.id} />
                    <label className="field-label">
                      Reply
                      <textarea
                        name="body"
                        placeholder="Send a short in-world response."
                        required
                      />
                    </label>
                    <div className="button-row">
                      <button className="button-secondary" type="submit">
                        Send reply
                      </button>
                    </div>
                  </form>
                </div>
              ))
            ) : (
              <div className="callout">No visible mail threads yet.</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <Wrench size={14} />
                Crafting
              </span>
              <h2>Workshop status</h2>
            </div>
          </div>
          <div className="card-stack">
            {account.campaign.craftingJobs.length > 0 ? (
              account.campaign.craftingJobs.map((job) => (
                <div className="item-card" key={job.id}>
                  <div className="card-header">
                    <div>
                      <div className="value-line">
                        {job.recipe?.name ?? job.lootItem?.name ?? "Custom crafting task"}
                      </div>
                      <div className="muted">
                        {job.recipe?.outputName ?? job.lootItem?.name ?? "Pending output"}
                      </div>
                    </div>
                    <span className="tag">{formatEnumLabel(job.status)}</span>
                  </div>
                  <p>{job.notes ?? "DM-managed crafting progress."}</p>
                  <p className="muted">
                    <strong>Materials:</strong>{" "}
                    {formatCraftingMaterials(parseCraftingMaterials(job.recipe?.materialsText ?? ""))}
                  </p>
                  {job.resolutionOutcome ? (
                    <p className="muted">
                      <strong>{formatEnumLabel(job.resolutionOutcome)}:</strong> {job.resolutionText}
                    </p>
                  ) : (
                    <p className="muted">Waiting on the DM to resolve the current crafting check.</p>
                  )}
                </div>
              ))
            ) : (
              <div className="callout">No crafting jobs are active for this campaign.</div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
