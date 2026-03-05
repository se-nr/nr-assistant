# Google Ads — Platform Knowledge

Regler og best practices for Google Ads (Search, Shopping, PMax, Display, YouTube). Loades af skills og agents der arbejder med Google-data.

---

## Data-kilde

- Brug Google Ads MCP tools naar tilgaengelig
- Google Ads bruger micro-amounts: divider ALTID med 1.000.000 for faktisk valuta
- Attribution: Google default er last-click, men data-driven attribution anbefales

## Campaign Types

### Search
- Min. 3 RSA'er per ad group med 15 headlines + 4 descriptions
- Pin kun headlines naar brand-consistency kraever det
- Brug Broad Match + Smart Bidding (ikke Exact Match + Manual CPC)
- Negativ keyword-liste: opdater ugentligt

### Shopping / Standard Shopping
- Feed-kvalitet er ALT: titel, billede, pris, availability
- Titel-format: `[Brand] [Produkttype] [Vigtigste attribut] [Farve/Stoerrelse]`
- Custom labels til bid-segmentering (margin, bestseller, saesonvare)
- Separate kampagner for brand vs. non-brand traffic

### Performance Max (PMax)
- Krav: min. 20 billeder, 5 videoer, 5 headlines, 5 descriptions, 5 long headlines
- Asset groups: 1 per produkt-kategori eller audience-segment
- Search themes: tilfoej 10-25 relevante soegetermer per asset group
- OBS: PMax kannibaliserer Search — monitor overlap via Insights-tab
- Audience signals er vejledende, ikke begransende

### Display
- Primaert retargeting — bred prospecting giver sjaldent godt ROI
- Responsive Display Ads: upload alle formater (landskab, firkantet, portrat)
- Placement exclusions: fjern apps, games, parked domains

### YouTube
- Skippable in-stream: hook i foerste 5 sek er kritisk
- Video Action Campaigns: god til konverteringer med landing page
- Targeting: Custom Intent audiences baseret paa soegetermer

## Bidding Strategies

| Strategy | Brug naar | Krav |
|----------|----------|------|
| Maximize Conversions | Nyt setup, bygger data | 15+ conv/maaned |
| Target CPA | Stabil CPA-historik | 30+ conv/maaned |
| Target ROAS | E-commerce med revenue-tracking | 50+ conv/maaned |
| Maximize Clicks | Brand awareness, ny konto | Ingen minimum |

- Learning period: 7-14 dage — aendr IKKE bids i denne periode
- Budget: aldrig lavere end 10x target CPA per dag

## Quality Score

Tre faktorer (vaegtning):
1. **Expected CTR** (hoej vaegt) — forbedres med bedre annoncer og relevans
2. **Ad Relevance** (medium vaegt) — match mellem keyword og annoncetekst
3. **Landing Page Experience** (hoej vaegt) — hastighed, relevans, mobilvenlig

- QS under 5: pausér keyword eller omskriv annonce
- QS 7+: god — fokus paa andet
- Check Search Terms rapport for irrelevante soegninger

## Benchmarks

| Metric | Search | Shopping | PMax |
|--------|--------|---------|------|
| CTR | 3-8% | 0.5-2% | 1-3% |
| CPC | 3-15 DKK | 2-8 DKK | 3-10 DKK |
| Conv. Rate | 3-8% | 1-3% | 2-5% |
| ROAS | 4-8x | 5-12x | 3-8x |

## Do / Don't

**Do:**
- Brug conversion tracking med Enhanced Conversions
- Separate Brand og Non-Brand kampagner (altid)
- Optimer Shopping feed ugentligt (titler, billeder, custom labels)
- Brug Audience Segments som observation paa Search

**Don't:**
- Koer PMax uden mindst 30 dages konverteringsdata
- Ignorer Search Terms rapport (ugentlig gennemgang)
- Brug samme budget til brand og non-brand (brand steal non-brand budget)
- Aendr bidding strategy midt i en learning period
