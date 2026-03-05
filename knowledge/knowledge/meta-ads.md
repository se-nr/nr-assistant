# Meta Ads — Platform Knowledge

Regler og best practices for Meta (Facebook/Instagram) annoncering. Loades af skills og agents der arbejder med Meta-data.

---

## Attribution

- **Standard (klientrapportering):** 7d_click + 1d_view
- **Konservativt (internt):** 1d_click
- Vis altid begge tal i rapporter
- Meta API: laes sub-keys (`a['7d_click']`, `a['1d_view']`), ALDRIG `.value` (default-total)
- Dashboard API haandterer dette korrekt via `safeROAS()` — brug `get_performance` tool

## Campaign Structure

### Naming convention
`{land}_{uge/periode}_{koncept}_{format}_{variant}`
- Eksempel: `DK_u39_20%_v1`, `WEEK47_DK_Black25_Image_01`
- Brug altid klientens etablerede konvention (se `clients/[klient]/campaigns.md`)

### Funnel-mapping
| Funnel | Campaign-type | Objective | Targeting |
|--------|--------------|-----------|-----------|
| FP | Prospecting Broad | OUTCOME_AWARENESS / OUTCOME_TRAFFIC | Broad, LAL 5-10% |
| IM | Prospecting Interest | OUTCOME_TRAFFIC / OUTCOME_SALES | Interest-based, LAL 1-3% |
| IP | Retargeting | OUTCOME_SALES | Website visitors, engagers, ATC |
| EC | Retention | OUTCOME_SALES | Customer lists, purchasers |

### Budget allocation (udgangspunkt)
- Prospecting (FP+IM): 60-70%
- Retargeting (IP): 20-30%
- Retention (EC): 5-10%
- Juster baseret paa funnel-efficiency og klientens modenheds-stadie

## Bidding

- **Lowest Cost Without Cap** — standard for de fleste kampagner
- **Cost Cap** — brug naar CPA-target er vigtigt (leads, e-commerce med lav margin)
- **Minimum ROAS** — brug for ROAS-optimerede kampagner med `optimization_goal=VALUE`
  - `bid_constraints.roas_average_floor` = target ROAS * 10000 (2.0x = 20000)
- Undgaa Bid Cap medmindre du har stabil historisk CPA-data

## Advantage+ (ASC)

- Advantage+ Shopping: god til e-commerce med 50+ konverteringer/uge
- Advantage+ Audience: Meta styrer targeting — god naar bred targeting allerede virker
- Advantage+ Creative: lad Meta optimere assets — krav: min. 3 headlines, 3 bodies, 3 billeder
- OBS: ASC giver mindre kontrol — brug det IKKE naar du tester specifikke audiences

## Creative Specs

| Format | Aspect Ratio | Anbefalet stoerrelse |
|--------|-------------|---------------------|
| Feed Image | 1:1 | 1080x1080 |
| Feed Video | 1:1 eller 4:5 | 1080x1080 / 1080x1350 |
| Stories/Reels | 9:16 | 1080x1920 |
| Carousel | 1:1 per kort | 1080x1080 |

- Primary text: max 125 tegn (over foldes)
- Headline: max 40 tegn
- Description: max 25 tegn
- Video: foerste 3 sek er alt — hook SKAL vaere instant

## Audience Sizing

- Minimum: 500.000 (prospecting), 10.000 (retargeting)
- Sweet spot prospecting: 1M-10M
- LAL: start 1% i modne markeder, 3-5% i smaa markeder (DK, NO, FI)
- Undgaa audience overlap > 30% mellem ad sets

## Benchmarks (N+R klienter gennemsnit)

| Metric | E-commerce | Lead Gen |
|--------|-----------|----------|
| CTR | 1.0-2.0% | 0.8-1.5% |
| CPC | 3-8 DKK | 5-15 DKK |
| CPM | 40-80 DKK | 50-100 DKK |
| ROAS 7d | 3.0-6.0x | N/A |
| CPL | N/A | 50-150 DKK |

## Do / Don't

**Do:**
- Test 3-5 kreative koncepter per ad set
- Brug UTM-parametre paa alle links
- Lad Meta's learning phase koere 7 dage foer evaluering
- Brug `get_performance` og `get_top_ads` tools — aldrig beregn ROAS manuelt

**Don't:**
- Aendr budget med mere end 20% ad gangen (reset learning phase)
- Koer mere end 5 ad sets per campaign (budget-fragmentering)
- Brug manual placements medmindre der er en specifik grund
- Stol paa Meta's "estimated daily results" — brug faktisk data
