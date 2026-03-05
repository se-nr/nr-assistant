<workflow name="agency:analyze">

<purpose>
Performance-analyse workflow. Fra rå data til klar indsigt og anbefaling.
Output: rapport i Isidors standard-format.
</purpose>

<required_reading>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/benchmarks.md
</required_reading>

<philosophy>
Analysen er ikke et datadump. Den er et svar på: hvad skete der, hvorfor, og hvad gør vi nu?
Claude stiller spørgsmål der hjælper brugeren med at formulere det rigtige spørgsmål, inden analysen går i gang.
</philosophy>

<process>

## Trin 1: Kontekst

Spørg:
1. Hvilken klient?
2. Hvad er perioden / hvad analyserer vi? (kampagne, periode, kanal?)
3. Hvad er det spørgsmål analysen skal besvare?

Load klient-kontekst: `@~/.claude/nr-assistant/clients/[klient]/overview.md`
Tjek om der er klient-specifikke benchmarks i `history.md`.

## Trin 2: Data-input

Spørg hvilke data der er tilgængelige:
- Meta Ads Manager-udtræk (CSV, screenshot, API-data)?
- Klaviyo-data?
- Shopify/GA4-data?

Modtag data fra brugeren (indsæt, upload eller henvis til fil).

## Trin 3: Analyse

Udfør analysen baseret på tilgængelige data.

**Attribution-regel:** Angiv altid begge vinduer:
- ROAS 7d_click+1d_view (rapportering)
- ROAS 1d_click (konservativt)

**Sammenlign med:**
1. Klientens historiske baseline (hvis tilgængeligt i `history.md`)
2. Agency-benchmarks fra `benchmarks.md`

**Se efter mønstret:**
- Hvad performer over/under forventning?
- Er der en årsag (kreativ, målgruppe, budget, sæson)?
- Er der hurtige wins (noget der kan optimeres nu)?

## Trin 4: Rapport

Skriv rapport i standard-format:

```
## Executive Summary (til Slack)
- [Bullet 1 – vigtigste finding]
- [Bullet 2]
- [Bullet 3]
- Konklusion: [én sætning med kontekst + anbefaling]

## Oversigtstabel
[Tabel med nøgletal, begge attribution-vinduer]

## Analyse
[Narrativt, 3–5 afsnit]

## Anbefaling
[Hvad gør vi nu – specifik og handlingsrettet]

## Detaljerede data
[Tabeller, breakdown per land/ad/periode – kun det der er relevant]
```

## Trin 5: CHECKPOINT

Vis rapport-udkast. Spørg:
"Mangler der noget, eller er der dele der skal uddybes?"

Juster. Gem som `clients/[klient]/analysis-[dato]-[emne].md`

## Trin 6: Opdater history.md

Hvis analysen viser vigtige læringsmomenter, tilføj dem til `clients/[klient]/history.md`.

</process>

<output_format>
Rapport: `clients/[klient]/analysis-[dato]-[emne].md`
Format: Executive summary (bullets) → tabel → narrativ → anbefaling → detaljeret data
</output_format>

</workflow>
