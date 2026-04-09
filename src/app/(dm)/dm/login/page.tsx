import { LockKeyhole, ScrollText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDmLoginHint, getDmSession } from "@/lib/dm-session";
import { loginDmAction } from "../actions";

type DmLoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function DmLoginPage({ searchParams }: DmLoginPageProps) {
  const session = await getDmSession();

  if (session) {
    redirect("/dm");
  }

  const [params, loginHint] = await Promise.all([searchParams, Promise.resolve(getDmLoginHint())]);

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="brand-mark">
          <span className="brand-glyph">CV</span>
          DM Login
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
          <LockKeyhole size={14} />
          DM access gate
        </span>
        <h1>Sign in before using the workspace.</h1>
        <p>
          This baseline hardening keeps `/dm` and all DM mutations behind a signed
          cookie session instead of relying on open local access.
        </p>
      </section>

      <section className="two-column-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">Login</span>
              <h2>DM credential check</h2>
            </div>
          </div>

          <form action={loginDmAction} className="stack-form">
            <label className="field-label">
              Username
              <input defaultValue={loginHint.username} name="username" required />
            </label>
            <label className="field-label">
              Access code
              <input name="accessCode" required type="password" />
            </label>
            <div className="button-row">
              <button className="button" type="submit">
                Open DM workspace
              </button>
            </div>
          </form>

          {params.error === "invalid" ? (
            <p className="error-banner">That DM username or access code is invalid.</p>
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="section-kicker">
                <ScrollText size={14} />
                Local-first note
              </span>
              <h2>How the proof-of-concept is configured</h2>
            </div>
          </div>

          <div className="list-card">
            <div className="list-item">
              Username defaults to <strong>{loginHint.username}</strong> unless
              `DM_USERNAME` is set.
            </div>
            <div className="list-item">
              Access code should come from `DM_ACCESS_CODE`.
            </div>
            <div className="list-item">
              {loginHint.usingFallbackCode
                ? "A fallback code is active right now because DM_ACCESS_CODE is not set yet."
                : "A custom DM access code is configured in the environment."}
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
