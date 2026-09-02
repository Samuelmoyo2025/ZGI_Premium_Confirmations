# Premium Confirmation Register

Replaces the manual "please confirm this premium was paid" back-and-forth between
Claims and Finance. Finance uploads each month's Minisure/Alertsure files once;
Claims searches by insured name or vehicle registration number and gets an
instant confirmation — amount paid, date paid, payment method, category, and
reinsurance status (100% Retained by default) — plus ready-to-paste reply text.

It's one self-contained web app (`index.html` + `app.js` + a logo image),
backed by a free Supabase project so Finance's uploads are visible to Claims
immediately, from any device — the same pattern as the Treasury dashboard.

## Files
- `index.html` / `app.js` — the tool itself
- `assets/zimnat-logo.png` — the Zimnat logo shown in the sidebar and on confirmations (must be deployed alongside the other files, in an `assets` subfolder)
- `setup.sql` — the database schema (same content is also shown/copyable inside the tool's Settings tab)

## One-time setup (5 minutes)

1. Create a free project at [supabase.com](https://supabase.com) — or reuse an
   existing Zimnat Supabase project if you already have one from the Treasury
   dashboard (recommended: keep this as its own project so a mistake in one
   tool never touches the other's data).
2. In the Supabase dashboard: **SQL Editor → New query**, paste in `setup.sql`,
   click **Run**. This creates two tables (`bord_uploads`, `bord_entries`) with
   open read/write access via the anon key — there's no login for this tool.
3. **Project Settings → API** — copy the **Project URL** and the **anon public** key.
4. Open the tool, go to **Settings**, paste both in, click **Save & connect**.
5. Deploy the whole folder (`index.html`, `app.js`, `assets/`) together
   (e.g. to Vercel, same as your other finance tools) and share the link with
   Claims and the rest of Finance. Each person who opens it needs to paste the
   same URL + anon key once — Settings shows you exactly what to give them.

## Using it

**Finance — Upload a file**
Three file types are supported, picked from a dropdown before you choose the file:

| File type | Typical filename | Currency | Default category |
|---|---|---|---|
| USD Bord (Comprehensive) | `June 2026 USD Bord.xlsx` | USD | Comprehensive |
| USD Sales Report (Third Party) | `June USD Sales Report.xlsx` | USD | Third Party |
| ZWG Final Sales Report | `June 2026 Final Sales Report.xlsx` | ZWG | Third Party |

For each, the tool guesses Month (and Year, where the filename has one) and
parses automatically:
- **USD Bord** — one sheet per month (e.g. "June 2026"); amount = GWP Banked
  or GWP withheld, date = Date Paid.
- **USD Sales Report** — one sheet per day of the month (named "1", "2", …
  "31"); amount = NWP + Stamp Duty + Gvt Levy added together; date = that
  sheet's day combined with the Month/Year you set. This filename has no year
  in it, so double-check the Year field before saving.
- **ZWG Final Sales Report** — one sheet per branch/agent; searches every
  sheet automatically, skipping summary/commission sheets. Amount = Premium
  Collected, date = Issue Date, insured = Customer Name + VRN combined.

Category and reinsurance status apply to the whole upload — check the preview
(it shows a sample of parsed rows and how many sheets were skipped as
non-policy data) before saving. Do this once per month, plus whenever you have
back-dated files to add (e.g. the Jan 2025 – May 2026 backlog) — same process,
one file at a time.

**Claims — Confirm a premium**
Type a registration number or the insured's name. Optionally narrow it down:
- **Month** — pick the file to search first. If there's no match there, the
  register automatically checks up to 2 months either side (next month, then
  2 months, then the same backwards) and tells you which month the match
  actually came from. Leave it on "Any month" to search everything at once.
- **Currency** and **Category** (Comprehensive / Third Party) — optional filters.

Click a result to see the full confirmation and copy a ready-to-send reply.

**Finance — Bord history**
Shows every upload with its row count. If one was uploaded twice or by
mistake, remove it from here — this removes its policies from search too.

## Already set this up before?
If you ran an earlier version of `setup.sql`, you just need the `category`
column added — run the two `alter table ... add column if not exists category text;`
lines at the bottom of the current `setup.sql` (also shown in the tool's
Settings tab) instead of the whole script.

## Notes
- Large files (the ZWG report can run to 10,000+ rows across ~140 sheets)
  take a few seconds to parse and save — a progress indicator shows rows
  saved as it goes.
- Sheets that don't match the expected column layout for that file type
  (subtotal tabs, commission tabs, empty tabs) are skipped automatically and
  counted in the preview, so you can sanity-check nothing real got left out.
- A handful of rows with no premium amount recorded is normal (incomplete
  transactions in the source file) — they'll just show "—" for amount.
