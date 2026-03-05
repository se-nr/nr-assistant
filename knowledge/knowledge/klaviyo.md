# Klaviyo — Platform Knowledge

Regler og best practices for email/SMS marketing via Klaviyo. Loades af skills og agents der arbejder med Klaviyo-data.

---

## Data-kilde

- Brug Klaviyo MCP tools: `get_flows`, `get_flow_report`, `get_campaign_report`, `get_segments`, `get_lists`
- ALDRIG gaet paa Klaviyo-data — hent altid via API
- Conversion metric: brug "Placed Order" metric ID (hent via `get_metrics`)

## Flow Best Practices

### Essentielle flows (minimum setup)
| Flow | Trigger | Antal emails | Timing |
|------|---------|-------------|--------|
| Welcome | List subscribe | 3-5 | Dag 0, 1, 3, 5, 7 |
| Abandoned Cart | Checkout Started | 3 | 1t, 24t, 48t |
| Browse Abandonment | Viewed Product | 2 | 4t, 24t |
| Post-Purchase | Placed Order | 3 | Dag 1, 7, 14 |
| Winback | Last Order > 60d | 3 | Dag 60, 75, 90 |

### Flow-regler
- Smart Sending: ALTID on (undtag transaktionelle)
- Quiet Hours: 21:00-08:00 lokal tid
- Profilfiltre: ekskluder "placed order" fra cart abandonment (check 24t vindue)
- A/B test subject lines paa flows med 1000+ recipients/maaned

## Campaign Best Practices

### Sending
- Optimal sendetid: tirsdag-torsdag, 10:00-14:00 lokal tid
- Smart Send Time: brug Klaviyo's AI-feature for individuel optimering
- Sending cadence: max 3 kampagner/uge til samme segment
- Undgaa mandage (lav engagement) og fredage (weekend-noise)

### Segmentering
| Segment | Definition | Brug til |
|---------|-----------|----------|
| Engaged 30d | Opened/clicked i 30 dage | Kampagner, nye produkter |
| Engaged 90d | Opened/clicked i 90 dage | Bredere kampagner |
| VIP | 3+ orders ELLER top 10% revenue | Eksklusive tilbud, early access |
| At-risk | Engaged 90d men IKKE 30d | Re-engagement kampagne |
| Sunset | Ikke engaged 180d+ | Fjern fra liste (deliverability) |

### Subject Lines
- Max 50 tegn (mobilvenlig)
- Personalisering oejer open rate 15-20%: `{{ first_name|default:'Hey' }}`
- Emojis: max 1, i starten eller slutningen
- Test 3-5 variationer per kampagne

## Deliverability

- Hold bounce rate under 2%
- Hold spam complaint rate under 0.1%
- Sunset inaktive profiler efter 180 dage uden engagement
- Brug dobbelt opt-in for nye markeder
- Opvarm nye domainer: start med 500/dag, fordobl hver 3. dag

## Benchmarks (N+R klienter)

| Metric | God | Gennemsnit | Darlig |
|--------|-----|-----------|--------|
| Open Rate | >25% | 18-25% | <18% |
| Click Rate | >3.5% | 2-3.5% | <2% |
| Click-to-Open | >15% | 10-15% | <10% |
| Unsubscribe Rate | <0.2% | 0.2-0.5% | >0.5% |
| Revenue per Recipient | >2 DKK | 0.5-2 DKK | <0.5 DKK |

## Revenue Attribution

- Klaviyo bruger last-click attribution med 5-dages vindue (default)
- Sammenlign med Meta's attribution — overlap er normalt
- Email revenue som % af total: 20-35% er sundt for e-commerce
- Flow revenue vs. campaign revenue: maal 60/40 split (flows dominerer)

## Do / Don't

**Do:**
- Segmenter altid — send aldrig til "All Subscribers"
- A/B test subject lines paa alle kampagner med 5000+ modtagere
- Brug dynamisk content for personalisering (produktanbefalinger)
- Check flow performance maanedligt — optimer de med lavest click rate

**Don't:**
- Send mere end 4 emails/uge til samme profil
- Ignorer sunset-segmentet (oedelaegger deliverability)
- Brug ONLY_ALL_CAPS subject lines (spam-trigger)
- Koer kampagner til inaktive profiler uden re-engagement flow foerst
