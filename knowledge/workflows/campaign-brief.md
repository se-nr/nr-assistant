<workflow name="agency:brief">

<purpose>
Guided kampagne-brief skabelse. Output: udfyldt campaign-brief template klar til at sende til klient eller videre til kreativt team.
</purpose>

<required_reading>
@~/agency-context/agency/process.md
@~/agency-context/agency/templates/campaign-brief.md
</required_reading>

<philosophy>
Et godt brief er ikke et spørgeskema der er udfyldt. Det er et dokument der giver alle involverede
en klar og fælles forståelse af hvad vi skal opnå og for hvem.
Claude hjælper med at afdække det der ikke er sagt endnu.
</philosophy>

<process>

## Trin 1: Kontekst

Spørg:
1. Hvilken klient?
2. Er der en overview.md for denne klient? Hvis ja, load den: `@~/agency-context/clients/[klient]/overview.md`
3. Hvad er anledningen til brieffet? (ny kampagne, promo, sæson, test?)

## Trin 2: Mål og succeskriterium

Udfordr vage svar:
- "Øge salget" → "Med hvad? Sammenlignet med hvad som baseline?"
- "Brand awareness" → "Hvad er den konkrete metric du vil se?"
- "Teste noget nyt" → "Hvad er hypotesen og hvad er en succesfuld test?"

Lås målet, inden du går videre.

## Trin 3: Målgruppe for denne kampagne

Klient-overview'et definerer den generelle målgruppe. Her handler det om:
- Er dette en bred kampagne eller retargeting?
- Er der et specifikt segment vi rammer?
- Hvad er den centrale indsigt eller trigger for disse folk?

## Trin 4: Budskab og kreativ retning

Spørgsmål:
- "Hvad er det ÉNE budskab kampagnen skal efterlade?"
- "Er der et konkret tilbud, eller er det brand-/inspirationsbaseret?"
- "Hvad bør vi undgå at sige eller vise?"

## Trin 5: Format og produktion

Afklar:
- Hvilke placements? (Feed, Stories, Reels, alle?)
- Video, statisk billede eller begge?
- Antal varianter til test?
- Er der eksisterende assets eller skal alt produceres?

## Trin 6: Budget og timing

- Hvad er det samlede budget?
- Hvornår starter og slutter kampagnen?
- Er der specifikke datoer der er kritiske (produktlancering, frist)?

## Trin 7: Udkast og godkendelse

Opsummér brieffet ud fra template-formatet.

CHECKPOINT – vis udkast til brief og spørg:
"Er der noget der mangler, eller som skal justeres?"

Juster baseret på feedback. Gentag indtil godkendt.

## Trin 8: Gem

Gem som `~/agency-context/clients/[klient]/brief-[YYYY-MM-DD]-[kort-navn].md`

</process>

<output_format>
Fil: `clients/[klient]/brief-[dato]-[navn].md`
Format: Udfyldt version af `agency/templates/campaign-brief.md`
</output_format>

</workflow>
