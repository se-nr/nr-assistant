<workflow name="agency:review">

<purpose>
Månedlig status-review. Fra performance-data til komplet klient-rapport og næste måneds prioriteter.
</purpose>

<required_reading>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/benchmarks.md
@~/.claude/nr-assistant/knowledge/templates/monthly-report.md
</required_reading>

<process>

## Trin 1: Setup

Spørg:
1. Hvilken klient?
2. Hvilken måned/periode?
3. Hvilke kanaler er inkluderet? (Meta, Google, Klaviyo, alle?)

Load:
- `@~/.claude/nr-assistant/clients/[klient]/overview.md`
- Alle filer i `~/.claude/nr-assistant/clients/[klient]/phases/` der overlapper med perioden

## Trin 2: Kontekst-indsamling (OBLIGATORISK)

Vis aktive phases fra perioden (auto-loaded fra trin 1), og spørg:

"Inden vi kigger på data — var der særlige tiltag i [MÅNED]?"
1. Nye produkter/kollektioner? (lancering, restocking, udgået)
2. Rabatter/kampagner? (%-rabat, gratis fragt, bundle, flash sale)
3. Tekniske ændringer? (pixel, tracking, checkout, website-redesign)
4. Budget-ændringer? (op/ned, omfordeling mellem markeder/funnel)
5. Markedsforhold? (sæsonudsving, konkurrence, makro/økonomi)

Registrer svarene — de indgår i rapportens kontekst-sektion og forklarer performance-ændringer.

Hvis der er nye phases der ikke allerede er logget, opret dem nu i `clients/[klient]/phases/`.

## Trin 3: Saml data

Afklar hvad der er tilgængeligt:
- Meta Ads: kampagne-performance, creative performance, demografi
- Klaviyo: flow-performance, kampagne-performance, total revenue
- Andre kanaler?
- Sammenligning med forrige måned?

Modtag data fra brugeren (indsæt direkte i chatten eller henvis til filer).

## Trin 4: Analyser og identificér nøgle-narrativer

Inden du skriver rapporten, find de 3 vigtigste historier:
1. Hvad gik godt og hvorfor?
2. Hvad gik dårligt og hvad er forklaringen?
3. Hvad er den vigtigste beslutning for næste måned?

Brug kontekst fra trin 2 til at forklare performance-ændringer. Korrelér phases med data.

Præsenter disse 3 narrativer og spørg om de rammer det vigtigste.

## Trin 5: Skriv rapport

Brug `agency/templates/monthly-report.md` som struktur.

Rapport-indhold:
- **Kontekst-sektion** (phases + eksterne faktorer fra trin 2)
- Executive summary (3–5 bullets, Slack-venlig)
- Oversigtestabel (spend, ROAS 7d, ROAS 1d, leads/conversions)
- Kanal-specifik gennemgang
- Top 3 kreative (performance + screenshot-reference)
- Konklusion og anbefaling til næste måned
- Detaljerede tal i appendiks

## Trin 6: CHECKPOINT – Intern review

Vis rapport-udkast. Spørg:
"Er der noget der skal justeres inden den sendes til klienten?"

Juster baseret på feedback.

## Trin 7: Næste måneds prioriteter

Baseret på analysen, foreslå:
1. Top 3 optimeringsforslag (konkrete, handlingsrettede)
2. Kreative tests at sætte op
3. Eventuelle strukturelle ændringer (budgets, kampagne-setup)

## Trin 8: CHECKPOINT – Næste måneds plan

Vis forslag. Spørg:
"Er der ting der er højere prioritet, eller noget der ikke er relevant?"

Lås prioriteterne.

## Trin 9: Gem og opdater phases

1. Gem rapport som `clients/[klient]/reports/[YYYY-MM].md`
2. Opdater `clients/[klient]/history.md` med nøgle-læringsmomenter
3. Afslut relevante phases (tilføj resultat + læring i phase-filen)
4. Opret nye phases for næste måneds tiltag (fra trin 7)

</process>

<output_format>
Rapport: `clients/[klient]/reports/[YYYY-MM].md`
Format: Kontekst → Executive summary → tabel → kanal-gennemgang → anbefaling → appendiks
Phases: opdaterede phase-filer i `clients/[klient]/phases/`
</output_format>

</workflow>
