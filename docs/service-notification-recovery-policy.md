# Återhämtningspolicy för serviceaviseringar

Revaltas serviceaviseringar använder flera separata skyddslager:

1. Varje e-postleverans gör högst tre direkta försök med timeout, exponentiell backoff och jitter.
2. Misslyckade mottagarleveranser materialiseras som tenant-avgränsade dead-letter-poster.
3. Dead-letter-kön bearbetas automatiskt en gång per dag på nuvarande Vercel-plan.
4. En köpost kan högst genomgå tre automatiska köförsök.
5. Permanenta fel och uttömda automatiska försök eskaleras för manuell hantering.
6. Manuella omsändningar och avslutningar kräver ägar- eller administratörsbehörighet och revisionsloggas.
7. Alla schemalagda endpoints kräver `CRON_SECRET` och returnerar svar utan cachelagring.

## Dagligt körschema

- 06:00 UTC: ordinarie serviceaviseringar
- 06:05 UTC: materialisering av dead-letter-poster
- 06:10 UTC: automatisk dead-letter-återhämtning

Schemat är utformat för Vercels Hobby-begränsning, där varje cron-definition får köras högst en gång per dag.
