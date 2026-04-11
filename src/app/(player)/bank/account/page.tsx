import { Coins, Package2, ScrollText, Store, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlayerAccountBySession } from "@/lib/campaign-vault";
import { formatCraftingMaterials, parseCraftingMaterials } from "@/lib/crafting-resolution";
import { formatCopperAsGold, formatEnumLabel } from "@/lib/format";
import { clearPlayerSession, getPlayerSession } from "@/lib/player-session";
import {
  logoutBankAction,
  passOnLootPoolItemAction,
  rollOnLootPoolItemAction,
} from "../actions";

type BankAccountPageProps = {
  searchParams: Promise<{
    error?: string;
    loot?: string;
  }>;
};

const lootActionMessages: Record<string, string> = {
  rolled: "Your roll was recorded for that loot item.",
  passed: "You passed on that loot item.",
};

const lootErrorMessages: Record<string, string> = {
  "invalid-loot-pool-state":
    "That loot item is no longer open for your character.",
  "duplicate-loot-response":
    "You already responded to that loot item.",
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
  const errorMessage = params.error
    ? lootErrorMessages[params.error] ?? "Unable to save that loot response."
    : null;

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
              account.lootPools.map((pool) => (
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
                  <div className="card-stack">
                    {pool.items.map((item) => {
                      const myRoll = item.rollEntries.find(
                        (entry) => entry.characterId === account.id,
                      );
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
                            {item.awardedCharacter
                              ? `Assigned to ${item.awardedCharacter.name}`
                              : item.status === "BANKED"
                                ? "Held for later party distribution"
                                : "Still unresolved"}
                          </p>
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
              ))
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
                Recent transactions
              </span>
              <h2>What changed recently</h2>
            </div>
          </div>
          {account.ledgerEntries.length > 0 ? (
            <div className="list-card">
              {account.ledgerEntries.slice(0, 8).map((entry) => (
                <div className="list-item" key={entry.id}>
                  <div className="card-header">
                    <strong>{formatEnumLabel(entry.scope)}</strong>
                    <span className="tag">{formatEnumLabel(entry.entryType)}</span>
                  </div>
                  <div className="muted">
                    {entry.lootItem ? `${entry.lootItem.name} × ${entry.quantity}` : "Gold movement"} ·{" "}
                    {formatCopperAsGold(entry.goldDelta)}
                  </div>
                  <p>{entry.note}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="callout">No ledger activity has been recorded yet.</div>
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
                </div>
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
