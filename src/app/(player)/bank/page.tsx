import { LockKeyhole, ScrollText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCampaignOptions } from "@/lib/campaign-vault";
import { getPlayerSession } from "@/lib/player-session";
import { loginBankAction } from "./actions";

type BankPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const demoAccounts = [
  "Ashes of Highcrest · Miri Vale · PIN 2413",
  "Ashes of Highcrest · Toren Ash · PIN 4821",
  "The Sunken Crown · Sella Drift · PIN 9134",
];

export default async function BankPage({ searchParams }: BankPageProps) {
  const session = await getPlayerSession();

  if (session) {
    redirect("/bank/account");
  }

  const [campaigns, params] = await Promise.all([getCampaignOptions(), searchParams]);

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark">
          <span className="brand-glyph">CV</span>
          Player Bank
        </div>
        <div className="nav-links">
          <Link className="nav-link" href="/">
            Overview
          </Link>
          <Link className="nav-link" href="/dm">
            DM workspace
          </Link>
        </div>
      </header>

      <section className="hero">
        <span className="section-kicker">
          <LockKeyhole size={14} />
          Campaign-scoped access
        </span>
        <h1>Check stored gold and gear without exposing the DM tools.</h1>
        <p>
          Players choose their campaign, enter the character name, and unlock a
          read-only bank view with a PIN. This is intentionally lightweight and
          campaign-scoped.
        </p>
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">Login</span>
              <h2>Vault lookup</h2>
            </div>
          </div>
          <form action={loginBankAction} className="stack-form">
            <label className="field-label">
              Campaign
              <select name="campaignId" defaultValue={campaigns[0]?.id}>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Character name
              <input name="characterName" placeholder="Miri Vale" required />
            </label>
            <label className="field-label">
              PIN
              <input name="pin" placeholder="2413" required type="password" />
            </label>
            <div className="button-row">
              <button className="button" type="submit">
                Open bank
              </button>
            </div>
          </form>

          {params.error === "invalid" ? (
            <p className="error-banner">
              No matching campaign, character, and PIN combination was found.
            </p>
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                Demo credentials
              </span>
              <h2>Seeded local accounts</h2>
            </div>
          </div>
          <div className="list-card">
            {demoAccounts.map((entry) => (
              <div className="list-item mono" key={entry}>
                {entry}
              </div>
            ))}
          </div>
          <p className="helper-text">
            These are local demo records from the seed script so you can test the
            flow immediately after the database is initialized.
          </p>
        </article>
      </section>
    </main>
  );
}
