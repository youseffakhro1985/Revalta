# Revalta – Komponentregister

Komponentregistret bygger vidare på fastighetens befintliga tekniska installationer (`PropertyTechnicalAsset`) och skapar ett komplett livscykelperspektiv utan att duplicera anläggningsdata.

## Mål

Varje komponent ska kunna följas från installation till utbyte med:

- komponentklass och systemtyp
- installationsår och driftsättningsdatum
- teknisk och ekonomisk livslängd
- beräknat utbytesår
- garanti och leverantör
- service-, besiktnings- och skadehistorik
- kopplade arbetsordrar och projekt
- dokument och bilder
- kostnadshistorik
- status, skick, risk och kritikalitet

## Livscykelhändelser

- installation
- driftsättning
- service
- reparation
- besiktning
- garantiärende
- skada
- komponentbyte
- avställning
- återstart

## Kostnadshistorik

Kostnader lagras separat för att kunna analysera:

- servicekostnad
- reparationskostnad
- reservdelar
- besiktning
- entreprenör
- investering och komponentbyte
- kostnad per år och komponent
- total livscykelkostnad

## Leveransordning

1. Additiv databasmodell för klassning, livscykelhändelser och kostnader.
2. Tenant-säkert API för komponentöversikt.
3. Premiumvy i fastighetskortet.
4. Registrering och redigering.
5. Dokument, arbetsorder och projektkopplingar.
6. Livslängdsprognos och automatiska underhållsförslag.
