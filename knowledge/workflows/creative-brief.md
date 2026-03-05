<workflow name="agency:creative">

<purpose>
Guided creative brief til det kreative team. Output: actionabelt dokument der giver en copywriter
eller designer alt hvad de behøver for at producere annoncerne – uden at skulle spørge om noget.
</purpose>

<required_reading>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/templates/creative-brief.md
</required_reading>

<philosophy>
Et creative brief er ikke et strategi-dokument. Det er et produktionsdokument.
Det skal besvare: hvad skal laves, for hvem, med hvilken tone, i hvilket format, med hvilket budskab.
Intet mere, intet mindre.
</philosophy>

<process>

## Trin 1: Kontekst

Spørg:
1. Hvilken klient?
2. Er der et kampagne-brief for dette? Hvis ja, load det.
3. Skal dette gå direkte til kreativt team, eller er det til intern brug?

Hvis der er et kampagne-brief, load det og brug det som grundlag. Hop til trin 3.

## Trin 2: Hvis ingen kampagne-brief eksisterer

Afklar hurtigt:
- Hvad er målet med kreativerne?
- Hvad er det centrale budskab/tilbud?
- Hvilken målgruppe?

## Trin 3: Formater og antal

Specificér præcist hvad der skal produceres:
- Placements: Feed (1:1, 4:5), Stories/Reels (9:16), andre?
- Formater: statisk billede, video, carousel?
- Antal varianter per format?
- Anbefaling baseret på klient-historik (load `campaigns.md` hvis relevant)

## Trin 4: Hook og budskab

Det vigtigste element. Hjælp med at specificere:
- Hvad er de første 2 sekunder / første linje?
- Hvad er den centrale claim eller tilbud?
- Er der specifikke formuleringer klienten ønsker eller undgår?

## Trin 5: Tone og visuel retning

Baseret på klientens brand (fra overview.md):
- Tone of voice (brug eksempler fra TOV-beskrivelsen)
- Visuel stil: model, lifestyle, produkt, UGC?
- Farver og typografi-hensyn
- Hvad er dont's?

## Trin 6: Tekniske specs

Udfyld for hvert format:
- Dimensioner
- Max fil-størrelse
- Varighed (video)
- Antal tegn for tekst-overlays

## Trin 7: Godkendelse og afsendelse

CHECKPOINT – vis creative brief og spørg:
"Er der noget der mangler for at det kreative team kan gå i gang?"

Juster. Gem som `clients/[klient]/creative-brief-[dato]-[kampagne].md`

</process>

<output_format>
Fil: `clients/[klient]/creative-brief-[dato]-[kampagne].md`
Format: Udfyldt version af `agency/templates/creative-brief.md`
</output_format>

</workflow>
