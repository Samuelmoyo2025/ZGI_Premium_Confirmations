# Premium Confirmation Register

Replaces the manual "please confirm this premium was paid" back-and-forth between
Claims and Finance. Finance uploads each month's Minisure/Alertsure files once;
Claims searches by insured name or vehicle registration number and gets an
instant confirmation — amount paid, date paid, payment method, category, and
reinsurance status (100% Retained by default) — plus ready-to-paste reply text,
signed off automatically.

It's one self-contained web app (`index.html` + `app.js` + `logo-data.js` + `login-bg.js`),
backed by a free Supabase project so Finance's uploads are visible to Claims
immediately, from any device — the same pattern as the Treasury dashboard.
**Sign-in is required** — only people you've added as a Supabase user can
access it, and every sign-in, upload, and removal is logged with their email.

## Files
- `index.html` / `app.js` / `logo-data.js` / `login-bg.js` — the tool itself (the logo and the sign-in page's decorative graphic are embedded as data directly in their own files, so there's no separate image file to lose track of when deploying)
- `setup.sql` — the database schema, including login security and the audit log (same content is also shown/copyable inside the tool's Settings tab)

## One-time setup (10 minutes)

1. Create a free project at [supabase.com](https://supabase.com) — or reuse an
   existing Zimnat Supabase project if you already have one from the Treasury
   dashboard (recommended: keep this as its own project so a mistake in one
   tool never touches the other's data).
2. In the Supabase dashboard: **SQL Editor → New query**, paste in `setup.sql`,
   click **Run**. This creates three tables (`bord_uploads`, `bord_entries`,
   `audit_log`) with access **restricted to signed-in users only** — there is
   no anonymous access.
3. **Project Settings → API** — copy the **Project URL** and the **anon public** key.
4. Open the tool, go to **Settings**, paste both in, click **Save & connect**.
5. Add each person who should have access: **Authentication → Users → Add
   user**, enter their email and a password, and tick **Auto Confirm User** so
   they can sign in immediately. This user list *is* your access control —
   add or remove people here whenever staff changes.
6. Deploy `index.html`, `app.js`, `logo-data.js`, and `login-bg.js` together (e.g. to Vercel,
   same as your other finance tools) and share the link with everyone you
   added in step 5, along with the same Project URL + anon key from step 3
   (Settings shows exactly what to give them — the URL/key just lets their
   browser reach the database; their own email + password from step 5 is
   what actually lets them in).

## Using it

**Signing in**
Everyone sees a sign-in screen first. They enter the email and password you
set for them in step 5 above. There's no self-signup — accounts only come
from Supabase's Authentication → Users page, so you always know exactly who
can get in.

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
back-dated files to add — same process, one file at a time. Every upload is
recorded against your email, visible in Bord History and Audit Trail.

**Claims — Confirm a premium**
Type a registration number or the insured's name. Two ways to narrow it down
— use one or the other, not both:
- **Cover start / end date** — enter the claim's cover start date and the
  register searches only payments dated from 2 months before it through to
  the cover start date itself (the expected window for a premium paid ahead
  of cover). If nothing turns up there, it automatically checks for a payment
  made *after* the cover start date instead of just saying "not found" — and
  if it finds one, the confirmation is replaced with an amber **"Please
  contact Finance for confirmation"** notice rather than an automatic
  confirmation, since a late payment needs a human look. Month/Year are
  ignored while a cover start date is set.
- **Month / Year** (only used when no cover date is entered) — pick the bord
  to search first; if there's no match, the register automatically checks up
  to 2 months either side and tells you which month the result actually came
  from.

**Currency** and **Category** (Comprehensive / Third Party) are optional
filters on top of either search mode.

Click a result to see the full confirmation and copy a ready-to-send reply —
it ends with a signature (name + title), set once per browser under
**Settings → Signature on confirmations** (defaults to "S. Moyo, Finance
Department", editable by whoever is using that browser). The certificate can
also be printed on its own via the **Print** button, without the rest of the
page.

**Finance — Bord history**
Shows every upload with its row count and who uploaded it. If one was
uploaded twice or by mistake, remove it from here — this removes its
policies from search too, with no undo.

**Audit trail**
Every sign-in, upload, and bord removal, most recent first — who did it and
when. This is the access log for the register, alongside the user list in
Supabase itself.

## Already set this up before (no login)?
Run the **MIGRATION** block at the bottom of the current `setup.sql` instead
of the whole script — it adds the `category` column if you don't have it yet,
creates the `audit_log` table, and swaps the old open-to-anyone data policies
for authenticated-only ones. That last part is what actually starts requiring
sign-in — do steps 5–6 above (add users, tell people the tool now requires
login) right after running it.

## Notes
- Large files (the ZWG report can run to 10,000+ rows across ~140 sheets)
  take a few seconds to parse and save — a progress indicator shows rows
  saved as it goes.
- Sheets that don't match the expected column layout for that file type
  (subtotal tabs, commission tabs, empty tabs) are skipped automatically and
  counted in the preview, so you can sanity-check nothing real got left out.
- A handful of rows with no premium amount recorded is normal (incomplete
  transactions in the source file) — they'll just show "—" for amount.
- The anon key in Settings is safe to share with everyone who has an account
  — on its own it can no longer read or write anything, since the database
  now requires a genuine sign-in as well.
