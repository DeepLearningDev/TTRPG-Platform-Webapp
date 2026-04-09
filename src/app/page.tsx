import Link from "next/link";
import { ScrollText, Shield, Swords, Vault } from "lucide-react";

export default function Home() {
  const routeCards = [
    {
      href: "/dm",
      title: "DM Workspace",
      description:
        "Layered NPC cards, compendium-backed encounters, manual loot awards, and bank oversight.",
      icon: <Swords size={20} />,
    },
    {
      href: "/bank",
      title: "Player Bank Portal",
      description:
        "Campaign-scoped bank lookup with character name and PIN, plus recent transaction history.",
      icon: <Vault size={20} />,
    },
  ];

  const roadmap = [
    "Core v1: campaigns, NPCs, encounters, manual loot, and bank access",
    "Phase 2: quest board, storefront, mail, crafting, and advanced loot systems",
    "Later: casino minigames, pet care, and richer campaign-hub loops",
  ];

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark">
          <span className="brand-glyph">CV</span>
          Campaign Vault
        </div>
        <div className="nav-links">
          <Link className="nav-link" href="/dm">
            Open DM tools
          </Link>
          <Link className="nav-link" href="/bank">
            Open player bank
          </Link>
        </div>
      </header>

      <section className="hero">
        <span className="section-kicker">
          <Shield size={14} />
          Campaign Operations
        </span>
        <h1>Run prep, loot, and banking from one campaign hub.</h1>
        <p>
          This foundation implements the first vertical slice of the plan:
          campaign-aware NPC management, encounter prep backed by a monster
          compendium, manual loot distribution, and a player-facing bank portal.
        </p>

        <div className="hero-grid">
          <div className="metric-card">
            <span className="metric-label">DM surface</span>
            <div className="metric-value">NPCs + encounters</div>
            <p className="helper-text">
              Focused on fast table recall, saved drafts, and bank-aware reward
              distribution.
            </p>
          </div>
          <div className="metric-card">
            <span className="metric-label">Player surface</span>
            <div className="metric-value">Bank-only access</div>
            <p className="helper-text">
              Campaign dropdown, character name, PIN, and a read-only holdings
              view.
            </p>
          </div>
          <div className="metric-card">
            <span className="metric-label">Data shape</span>
            <div className="metric-value">Shared ledger</div>
            <p className="helper-text">
              Loot, deposits, and item handoffs all reconcile through one
              append-only transaction layer.
            </p>
          </div>
        </div>
      </section>

      <section className="route-grid">
        {routeCards.map((card) => (
          <Link className="route-card" href={card.href} key={card.href}>
            <div className="card-header">
              <span className="section-kicker">{card.icon} Entry Point</span>
              <span className="tag">Ready now</span>
            </div>
            <h2>{card.title}</h2>
            <p>{card.description}</p>
          </Link>
        ))}
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                Current Build
              </span>
              <h2>Implemented in this slice</h2>
            </div>
          </div>
          <div className="stack">
            <div className="callout">
              The DM side includes editable NPC cards, encounter draft
              creation, monster search, and manual loot awards into inventory
              or bank storage.
            </div>
            <div className="callout">
              The player side includes signed session cookies, campaign-scoped
              character lookup, and bank inventory and gold summaries.
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">Roadmap spine</span>
              <h2>Next layers already shaped</h2>
            </div>
          </div>
          <div className="list-card">
            {roadmap.map((entry) => (
              <div className="list-item" key={entry}>
                {entry}
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
