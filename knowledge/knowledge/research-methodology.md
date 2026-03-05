# Research Methodology — N+R Standard

Metoder og frameworks til klient-research. Loades af skills og agents der laver markedsresearch og klientanalyse.

---

## Research-princip

Ingen strategi uden grounded research. Al copy og positionering skal vaere forankret i:
1. Rigtige kunders sprog (VoC)
2. Faktisk konkurrencelandskab (ikke antagelser)
3. Verificerbare datapunkter

## Datakilder (prioriteret raekkefoelge)

1. **NotebookLM** — primaer kilde hvis notebook eksisterer. Source-grounded, citationsbaseret.
2. **Supabase/Dashboard** — performance-data via MCP tools
3. **Trustpilot** — VoC, kundetilfredshed, indvendinger
4. **Reddit/forums** — ufiltreret kundesprog, aerlige meninger
5. **Konkurrenters websites** — positionering, priser, claims
6. **Brancherapporter** — markedstrends, stoerrelse, vaekst
7. **WebSearch** — supplement og verificering

## Voice of Customer (VoC) Indsamling

### Trustpilot
1. WebSearch: `[brand] site:trustpilot.com/review`
2. WebFetch Trustpilot-siden
3. Udtraek 10-20 anmeldelser (mix af positive og negative)
4. Kategoriser:
   - Positive temaer (hvad elsker de?)
   - Negative temaer (hvad klager de over?)
   - Gennemgaaende sprog (hvilke ord bruger de?)

### Reddit/Forums
1. WebSearch: `[brand] OR [produktkategori] site:reddit.com`
2. WebFetch 3-5 relevante traade
3. Fokus paa:
   - Ufiltrerede meninger (ikke markedsfoering)
   - Sprog kunderne bruger naturligt
   - Indvendinger og barrierer
   - Hvad de sammenligner med

### Minimum VoC output
- 5 positive citater med kilde
- 5 negative citater med kilde
- 3-5 gennemgaaende sproeglige moenstre
- Top 3 indvendinger/barrierer

## Konkurrentanalyse

### Process
1. Identificer 3-5 primaere konkurrenter
2. For hver: WebFetch forside + "om os"
3. Dokumenter:
   - Positionering (en saetning)
   - Prisklasse (lav/medium/hoej)
   - USP'er (hvad de lover)
   - Tone of voice
   - Styrker og svagheder

### Output-format
| Konkurrent | Positionering | Pris | USP | Svaghed |
|-----------|--------------|------|-----|---------|
| Brand A | "Premium for..." | Hoej | X | Y |
| Brand B | "Everyday..." | Medium | X | Y |

### White Space
Baseret paa analyse: hvad er der IKKE nogen der goer godt?
- Uopfyldte kundebehov (fra VoC)
- Positionerings-gaps (alle er premium? -> mulighed for value)
- Kanal-gaps (ingen paa TikTok? -> first-mover)

## 5H Framework (maalgruppe-definition)

Bruges til at definere primaer og sekundaer persona:

| Dimension | Spoergsmaal | Eksempel |
|-----------|-----------|---------|
| **WHO** | Demografi, livsstil, adfaerd | Kvinder 28-45, urban, sundhedsbevidst |
| **WHAT** | Hvad soeger de? Problem? | Hudpleje der virker uden kemikalier |
| **WHY (emotionel)** | Foelelsesmaessigt behov | Foele sig tryg ved ingredienserne |
| **WHY (funktionel)** | Praktisk fordel | Spar tid, eet produkt i stedet for fem |
| **WHY NOT** | Barrierer for koeb | Pris, usikkerhed om det virker, vane |

## Discovery Research (hurtig)

Til quick-scan af potentielle klienter (15-20 min):

1. WebFetch brandets hjemmeside → hvad saelger de, prisklasse, TOV
2. WebSearch `[brand] trustpilot` → kundetilfredshed
3. WebSearch `[brand] + [kategori]` → markedsposition
4. Vurdering:
   - Kategori og markedsstoerrelse
   - Nuvaerende digital tilstedevaerelse
   - Opportunity for N+R (hvad kan vi tilfoeje?)
   - Fit-score (1-5)

## Dybde-Research (komplet)

Til fuld brand- og marketingstrategi (45-60 min):

1. NotebookLM queries (5 standard-queries, se agency-research skill)
2. VoC fra Trustpilot + Reddit (minimum 10 citater)
3. Konkurrentanalyse (3-5 konkurrenter)
4. Brandets egen kommunikation (website + socials)
5. Kategori-trends (2-3 artikler)
6. Performance-data fra MCP (hvis eksisterende klient)

## Kvalitetstjek

Foer research-output godkendes:
- [ ] Minimum 10 VoC-citater med kilde-URL?
- [ ] 3+ konkurrenter analyseret?
- [ ] Klar forskel paa fakta og fortolkning?
- [ ] Sprog-moenstre identificeret (kundernes egne ord)?
- [ ] White space / muligheder dokumenteret?

## Do / Don't

**Do:**
- Citér altid kilden (URL eller notebook-reference)
- Brug kundernes eget sprog — ikke omskriv til "marketingsprog"
- Angiv naar data er begrsenset ("kun 8 anmeldelser fundet")
- Krydsreferencér NotebookLM med web-research

**Don't:**
- Antag du kender markedet uden research
- Brug foraeeldede data (over 12 maaneder) som primaer kilde
- Generalisér fra 2-3 datapunkter
- Bland fakta og antagelser i samme afsnit
