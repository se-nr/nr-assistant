<workflow name="agency:onboard">

<purpose>
Guided onboarding af ny klient. Output: udfyldt clients/[navn]/overview.md klar til brug i alle workflows.
</purpose>

<required_reading>
@~/agency-context/agency/process.md
@~/agency-context/clients/_template.md
</required_reading>

<philosophy>
Du er tænkepartner, ikke formular-udfylder. Stil åbne spørgsmål. Lad brugeren tale.
Formularen er en tjekliste i baggrunden – ikke en guide der styrer samtalen.
</philosophy>

<process>

## Trin 1: Åben start

Spørg åbent: Hvem er klienten og hvad er konteksten for onboardingen?

Lad dem dumpe deres viden. Tag noter mentalt. Stil opfølgende spørgsmål baseret på hvad de siger.

## Trin 2: Afklar brand og TOV

Mål: forstå hvad klienten ER og IKKE er.

Spørgsmål at udforske (følg tråden, brug ikke alle):
- "Hvad er det første du vil have folk til at tænke på, når de ser en annonce?"
- "Hvad er én ting konkurrenterne aldrig ville sige?"
- "Giv mig et eksempel på en annonce/besked der ramte rigtigt for dem"
- "Hvad skete der sidst en annonce mislykkedes – hvad var galt?"

## Trin 3: Afklar målgruppe

Mål: et konkret segment, ikke "alle der interesserer sig for mode".

Udfordr vage svar:
- "Kvinder 25-45" → "Hvad er det ved dem der gør dem anderledes fra kvinder 25-45 generelt?"
- "Interesseret i mode" → "Hvad er det de stræber efter? Hvilken version af sig selv køber de ind på?"

## Trin 3b: Research-status (valgfrit men anbefalet)

Spørg kort: Har vi en markedsundersøgelse eller VoC-data fra før?

Hvis ja → noter hvad der eksisterer og hvor det er gemt i `context/research-sources.md`.
Hvis nej → flag at strategi-output vil kræve research-fase efterfølgende.

Dette er ikke et blokeringspunkt ved onboarding – men det er et vigtigt hul at markere tydeligt.

## Trin 4: Marketing-setup

Hent praktiske detaljer. Disse kan du spørge direkte om:
- Account-ID, pixel, Facebook Page, Instagram
- Aktive flows i Klaviyo
- Aktuelle kampagner og navnekonvention

## Trin 5: Udkast og godkendelse

Opsummér det du har lært i den udfyldte template-struktur.

CHECKPOINT – vis opsummering og spørg:
"Er der noget vigtigt jeg mangler eller har misforstået?"

Juster baseret på feedback.

## Trin 6: Gem filen

Gem den udfyldte klient-profil som `~/agency-context/clients/[klient-navn]/overview.md`.

Opret også disse tomme placeholder-filer:

`clients/[klient-navn]/campaigns.md` – header + note om at udfylde med aktive kampagner og navnekonvention

`clients/[klient-navn]/context/approved-copy.md` – header + note: "Indsæt godkendt copy der fungerer som tone-reference"

`clients/[klient-navn]/context/research-sources.md` – header + note: "Links til NotebookLM notebooks, markedsanalyser og VoC-kilder"

`clients/[klient-navn]/history/monthly-status.md` – 2–3 linjer per måned, kronologisk
`clients/[klient-navn]/history/performance-log.md` – detaljerede metrics over tid
`clients/[klient-navn]/history/content-learnings.md` – hvad virker / virker ikke, per format og periode

Bekræft over for brugeren at filerne er gemt og klar til brug.

</process>

<output_format>
Primær fil: `clients/[klient-navn]/overview.md` (udfyldt _template.md, maks 150 linjer)
Sekundære filer oprettet tomme:
- `clients/[klient-navn]/campaigns.md`
- `clients/[klient-navn]/context/approved-copy.md`
- `clients/[klient-navn]/context/research-sources.md`
- `clients/[klient-navn]/history/monthly-status.md`
- `clients/[klient-navn]/history/performance-log.md`
- `clients/[klient-navn]/history/content-learnings.md`
</output_format>

</workflow>
