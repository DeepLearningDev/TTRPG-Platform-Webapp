import { Coins, Package2, ScrollText, Store, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlayerAccountBySession } from "@/lib/campaign-vault";
import { formatCopperAsGold, formatEnumLabel } from "@/lib/format";
import { clearPlayerSession, getPlayerSession } from "@/lib/player-session";
import { logoutBankAction } from "../actions";

export default async function BankAccountPage() {
  const session = await getPlayerSession();

  if (!session) {
    redirect("/bank");
  }

  const account = await getPlayerAccountBySession(session);

  if (!account) {
    await clearPlayerSession();
    redirect("/bank");
  }

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
