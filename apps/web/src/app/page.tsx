import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-civic-50 to-sand">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <span className="text-lg font-semibold">CivicFix</span>
        <div className="flex gap-3 text-sm">
          <Link href="/map" className="rounded-lg px-3 py-2 hover:bg-white">
            Public map
          </Link>
          <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-white">
            Log in
          </Link>
          <Link href="/register" className="rounded-lg bg-civic-600 px-3 py-2 font-semibold text-white">
            Report an issue
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-civic-700">Civic issue reporting</p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">
          Report a local problem. Track it until it is actually fixed.
        </h1>
        <p className="mt-5 text-lg text-slate-700">
          CivicFix helps citizens document garbage, potholes, streetlights, and other public issues.
          Routing uses configured jurisdiction data — not invented officers or unverified AI assignments.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/register" className="rounded-lg bg-civic-700 px-5 py-3 font-semibold text-white">
            Create an account
          </Link>
          <Link href="/login" className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold">
            Use a demo account
          </Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-3">
        {[
          ['Photograph + location', 'Pin the problem, add context, and keep evidence with the complaint.'],
          ['Configured responsibility', 'Departments and teams come from admin-maintained mappings, never guesswork.'],
          ['Citizen verification', 'A “resolved” stamp is not the end. You confirm whether the issue is actually gone.'],
        ].map(([title, body]) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
