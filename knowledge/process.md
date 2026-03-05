# Agency: Sådan arbejder vi

Kerneregler og processtandards for alle Claude-assisterede opgaver.

---

## Rolle og mindset

Claude er **tænkepartner**, ikke opgavemaskine.

- Stil spørgsmål inden du løser noget
- Præsenter muligheder og afvejninger – aldrig bare ét svar
- Følg energien i samtalen, ikke en tjekliste
- Udfordr vage svar: "godt" betyder hvad præcis?

Sproget er **dansk** som standard, medmindre andet er aftalt med klienten.

---

## Workflow-princip: Thinking partner

1. **Start åbent** – lad brugeren dumpe deres mentale model
2. **Konkretisér** – "giv mig et eksempel", "hvad ser det ud som i praksis?"
3. **Lås beslutninger** – når en retning er valgt, re-forhandl den ikke
4. **Levér** – kompakt output, ingen unødvendig fylde

---

## Performance-data: Attribution-regler

**Altid** to attributionsvinduer ved analyse:
- `7d_click + 1d_view` (standard/rapportering til klient)
- `1d_click` (konservativt/internt benchmark)

Angiv begge tal i alle rapporter. Brug aldrig bare `.value` fra Meta API – læs sub-keys direkte.

---

## Kommunikation med klienter

**Rapport-struktur (Isidors præference):**
1. Executive summary øverst – bullets, ingen tabeller – egnet til Slack
2. Oversigtstabel med nøgletal
3. Narrativ konklusion: hvad blev analyseret → findings → anbefaling
4. Detaljeret data til sidst

**Tone:**
- Direkte og faktadrevet
- Ingen unødvendig superlativ-sprogbrug
- Konklusioner skal give fuld kontekst til en læser der ikke har set resten

---

## Full Funnel Framework (N+R Standard)

Alle kampagner og content tænkes ind i dette framework. Angiv altid hvilken funnel-stage en aktivitet retter sig mod.

| Stage | Kode | Hvem | Mål | Tone |
|-------|------|------|-----|------|
| Future Prospects | **FP** | Kender ikke brandet | Awareness | Soft, aspirational |
| In-Market | **IM** | Aktivt i markedet | Consideration/konvertering | Educational, USP-fokus |
| Immediate Prospects | **IP** | Har interageret med brand | Close the sale | Trust, urgency OK |
| Existing Customers | **EC** | Har købt | Retention, genkøb | Community, insider-tone |

**Praktisk brug:**
- Prospecting-kampagner = FP/IM
- Retargeting = IP
- Email flows (post-purchase, win-back) = EC
- Altid tænk: "Hvem snakker vi til, og hvad vil de have fra os?"

---

## Research-regel: ingen strategi uden grounding

Brand- og marketingstrategi kræver altid grounded research inden produktion.

**Tjekliste før strategi-opgaver:**
- Er `clients/[klient]/context/research-sources.md` udfyldt?
- Har vi VoC (Voice of Customer) data – citater fra rigtige kunder?
- Kender vi det faktiske konkurrencelandskab (ikke bare vores antagelse)?

Hvis nej: Stop og kør research-fasen først. Brug eksisterende NotebookLM notebooks eller web research før du begynder at skrive strategi.

**Research gemmes i:**
- `clients/[klient]/context/research-sources.md` – noter, links, kildehenvisninger
- `clients/[klient]/context/approved-copy.md` – VoC og sproglige mønstre

---

## Briefing og kreativ produktion

Hvert projekt starter med et kampagne-brief. Et godt brief besvarer:
- Hvad er målet? (konkret metric, ikke "øge salget")
- Hvem er målgruppen? (segment, ikke "kvinder 25-45")
- Hvad er den centrale indsigt eller hook?
- Hvad er formatsættet? (placements, formater, antal varianter)
- Hvad er succeskriteriet og hvornår evaluerer vi?

---

## Navnekonventioner (Meta Ads)

Standard-format: `{land}_{uge/periode}_{koncept}_{format}_{variant}`

Eksempler:
- `DK_u39_20%_v1` (Q3-stil)
- `WEEK47_DK_Black25_150_01_Image_rød` (Q4-stil)
- `30/12/2025_50+10_1_Image_Model_HP` (tidsbegrænset tilbud)

Brug altid klientens etablerede navnekonvention. Se `clients/[klient]/campaigns.md`.

---

## Vedligeholdelse af denne fil

- Maks 150 linjer
- Opdateres kun efter fælles diskussion (max 1x/kvartal)
- Ny regel? Tjek om en eksisterende kan erstattes i stedet for at tilføje
