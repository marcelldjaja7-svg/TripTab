# TripTab — trip expense splitter

A local-first web app for splitting shared trip costs with friends. Multi-currency (settle in **IDR** by default), equal / amount / percent splits, settle-up suggestions, and no account required. Opens in **dark mode**, with an Apple-like iOS interface (grouped lists, system-blue controls, light mode available).

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

On your phone on the same Wi‑Fi, you can also use your computer’s LAN address if Vite prints a `Network:` URL. Friends **not** on your network need the deployed site below.

## Share with friends (other phones)

1. Deploy TripTab so it has a public URL. After this repo is on GitHub, turn on **Settings → Pages → GitHub Actions**, merge to `main`, and open:
   `https://marcelldjaja7-svg.github.io/TripTab/`
2. Create a trip, tap the **share** button (or **Trip → Invite Friends**).
3. Send that link (it looks like `https://marcelldjaja7-svg.github.io/TripTab/?t=…`). TripTab copies the **public** GitHub Pages URL even if you tapped share on localhost, so friends’ phones can open it. A compact snapshot is packed into the link when it fits, so the trip still opens if live sync is briefly down. When someone adds a bill, it shows up on everyone else’s phone right away. Anyone with the link can edit.

Same-Wi‑Fi testing can still use the LAN URL Vite prints; the share button prefers the public site so off-network friends are not sent `localhost`.

Live rooms use a public realtime channel so no account is required. Anyone with the link can edit. If a room expires, the same invite still opens the snapshot in the link — download JSON as a backup.

Production build:

```bash
npm run build
npm run preview
```

Tests:

```bash
npm test
```

No API keys are required to use TripTab. Optional extras:

- **Fetch live rates** uses the public [Frankfurter](https://www.frankfurter.app/) API.
- **Scan bill** uses [Google Gemini](https://aistudio.google.com/apikey) vision. Paste a free API key once under **Scan bills** (home or trip settings). It stays in this browser’s `localStorage` and is never written into trip backups or live invite links. Without a key, take/upload still works as a preview, and you enter the expense yourself.

## Scan a receipt on your phone

1. Add TripTab to your Home Screen (Share → Add to Home Screen on iOS, or Chrome’s install prompt on Android) so it feels like an app.
2. Optional: paste a Gemini API key under **Scan bills**.
3. Open a trip → **Add Expense** → **Take Photo** or **Library**.
4. Review amount, currency, note, date, and category. Edit anything. Tap **Add Expense** to save — scans never auto-save.

## How to use (with your group)

1. **Create a trip** — name it, pick a vibe emoji, optional dates, and a home/base currency. New trips default to **Indonesian Rupiah (IDR)**. You can still settle in USD, SGD, etc.
2. **Add friends** — everyone on the trip. You can rename or recolor them later.
3. **Log expenses** — amount, currency, who paid, who is on the bill, category, note, date. Or **Scan bill** from a photo and then confirm.
   - **Equal** — split evenly among people marked **In**.
   - **Amounts** — type each person’s share.
   - **%** — split by percentage (must add up to 100%).
   - Tap **Out** to exclude someone from that expense. **Everyone** / **Just payer** are shortcuts.
4. **Set conversion rates** — when an expense isn’t in IDR (or your chosen base), set e.g. “1 USD = 16200 IDR”. Edit rates anytime under **Trip**. Live fetch is a shortcut, not a requirement.
5. **Settle up** — open the settle tab for net balances and the fewest suggested payments. Copy a payment, or tap **Log payment** after someone actually pays.
6. **Share with friends** — tap share / **Invite Friends**. The link opens the trip immediately on their phone, and new bills show up for everyone in real time. Copy a text summary or download JSON as a backup.
7. **Filter** — on Expenses, tap **Filter** to show bills for selected friends and categories. Spent and logged counts update to match.

Use the sun/moon control to switch light and dark. There’s a **Bali demo trip** on the home screen if you want to click around before creating your own.

## Stack

React + Vite + TypeScript + Tailwind CSS v4. Everything runs in the browser.
