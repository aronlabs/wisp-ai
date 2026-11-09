# Forever ability catalog

Wisp vendors the nine class `spellsByLevel` tables and `QuestSpells.lua` from
[fusionpit/WhatsTraining](https://github.com/fusionpit/WhatsTraining/tree/bf57434eafabf507beae49521cb5debb9ff69d01/Classes/Camelot),
revision `bf57434eafabf507beae49521cb5debb9ff69d01` (retrieved 2026-11-09).
Upstream calls the Forever data directory `Camelot`. These are not Classic/Era tables.
The MIT license is preserved in `addon/WispAI/TrainingData.LICENSE`.

`TrainingData.lua` wraps the original tables in a private namespace. `Training.lua`
queries those tables and resolves localized names through the client's C_Spell API.
No additional addon is required. Querying another class retains race/faction
requirements; current-class results filter those restrictions and report learned
flags. Prices are base copper amounts without reputation discounts. Requirements
are returned as data, not a claim that the character can currently train.

Coverage is class trainer ranks and quest spells. This is not an exhaustive list
of talent unlocks, profession recipes, weapon skills, hunter pet training or
warlock pet tomes. Missing names trigger client spell-data requests and are
reported explicitly. Retry or use a verified spell ID rather than treating an
empty name search as proof that an ability does not exist.

To update: review upstream changes, copy the nine class tables and QuestSpells
from Classes/Camelot into the existing private wrappers, update the revision in
Training.lua and this document, preserve the license, and run addon catalog tests.

## Live smoke check — 2026-11-09

Sent `¿Cuándo aprendo invisibilidad con el mago?` through a fresh in-game Wisp
conversation, using the running desktop engine and live addon.
The completed activity log recorded this sequence:

1. `wisp__load_tools` → `wow__query_training`.
2. Knowledge loading, TheWoWDB spell search and Everloot search.
3. `web__web_search` → `web_fetch` on the returned Wowhead Forever spell page.

All listed calls completed and the turn finished normally. The answer reported
that it could not confirm a normal learning level, rather than converting the
page's level-99 item-effect metadata or a tome reference into a verified trainer
unlock. This checks real catalog-to-web investigation; it does not establish the
ability's current acquisition method or level. Automatic tests separately check
name resolution, level/price requirements, pagination and unrestricted provider
requests.
