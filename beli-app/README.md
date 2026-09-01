# Beli — Restaurant Rankings

A small clone of [Beli](https://www.beliapp.com/)'s core mechanic: instead of rating
restaurants with stars, you rank them against each other.

## How it works

1. **Add a restaurant** — either to your **Want to Try** list, or mark it as **Been**.
2. Marking something as "Been" first asks how it was: **Liked / Fine / Disliked**.
   That sets which tier (score band) it competes in:
   - Liked → 7.0–10.0
   - Fine → 4.0–6.9
   - Disliked → 1.0–3.9
3. You then answer a few **"which was better?"** head-to-head comparisons against
   restaurants already in that tier. A binary search narrows down the exact
   spot in O(log n) comparisons, and scores are re-spread evenly across the
   tier so the ranking stays consistent as you add more places.
4. The **Been** tab shows your full ranked list, best to worst. **Re-rank**
   lets you redo the comparison flow for a restaurant if your opinion changes.

## Running it

No build step — it's plain HTML/CSS/JS. Just open `index.html` in a browser,
or serve the folder statically:

```bash
cd beli-app
python3 -m http.server 8000
# visit http://localhost:8000
```

Data is stored in the browser's `localStorage`, per-device/per-browser —
there's no backend or account system.
