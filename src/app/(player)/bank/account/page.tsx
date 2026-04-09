import { Coins, Package2, ScrollText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlayerAccountBySession } from "@/lib/campaign-vault";
import { formatCopperAsGold, formatEnumLabel } from "@/lib/format";
import { getPlayerSession } from "@/lib/player-session";
import { logoutBankAction } from "../actions";

export default async function BankAccountPage() {
  const session = await getPlayerSession();

  if (!session) {
    redirect("/bank");
  }

  const account = await getPlayerAccountBySession(session);

  if (!account) {
    redirect("/bank");
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark">
          <span className="brand-glyph">CV</span>
          {account.name} Bank Access
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
          <span className="metric-label">Inventory items</span>
          <div className="metric-value">{account.inventorySnapshot.items.length}</div>
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
    </main>
  );
}
