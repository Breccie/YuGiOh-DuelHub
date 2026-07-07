# Worktree-Inventar

Stand: 2026-07-07

Ziel dieses Dokuments ist, den aktuellen uncommitted Arbeitsstand in sinnvolle Arbeits- und Commit-Gruppen zu sortieren. Bestehende Aenderungen werden nicht verworfen.

## Aktueller Umfang

- Geaenderte getrackte Dateien: 53
- Untracked Dateien/Pfade: 15
- Groesse laut `git diff --stat`: 1861 Einfuegungen, 454 Loeschungen
- Status der wichtigsten Checks: `typecheck`, `test`, `lint`, `test:e2e:smoke` und `test:e2e:online` bestanden

## Empfohlene Commit-/Arbeitsgruppen

| Reihenfolge | Gruppe | Dateien / Bereiche | Zweck | Risiko | Empfehlung |
| --- | --- | --- | --- | --- | --- |
| 1 | MVP-Doku und Abnahme | `MVP.md`, `WORKTREE_INVENTORY.md`, `ROADMAP.md` | Projektfokus, Abnahmestatus, Roadmap und Worktree-Ordnung festhalten | niedrig | Zuerst separat committen. |
| 2 | Smoke- und Safety-Infrastruktur | `scripts/e2e-smoke.ts`, `scripts/e2e-online-smoke.ts`, `apps/frontend/src/lib/api-route-security*`, `apps/frontend/src/lib/api-service-proxy.test.ts`, `apps/frontend/src/lib/api-error-response*`, `apps/api/src/lib/runtime-config.test.ts`, `apps/api/src/server.test.ts` | Reproduzierbare Desktop-/Online-Abnahme und API-Sicherheits-/Runtime-Tests | niedrig bis mittel | Zusammen mit passenden Script-Eintraegen aus `package.json` committen. |
| 3 | Runtime-/API-Service-Split | `apps/api/src/server.ts`, `apps/api/src/lib/runtime-config.ts`, `apps/api/src/routes/*`, `apps/api/prisma/schema.prisma`, `packages/contracts/src/index.ts` | Fastify-/Online-Dev-Pfad, CORS/Cookie/Routes, API-Vertraege | mittel | Nach Gruppe 2 pruefen und separat committen. |
| 4 | Run-Progression und Rewards | `apps/frontend/src/lib/progression-service.ts`, `apps/frontend/src/lib/pack-openings.ts`, `apps/frontend/src/app/api/v1/runs/[runId]/**`, `apps/frontend/src/app/api/run-progression/**`, `apps/frontend/src/app/api/run-promos/**`, `apps/frontend/src/lib/tournament-rewards.integration.test.ts`, `apps/frontend/src/lib/run-isolation.integration.test.ts` | Run-isolierte Progression, Rewards, Promo-Claims und Pack-Claims | hoch | Commit nur nach gezieltem Review der Datenfluesse. |
| 5 | Collection/Deck/Trade/Duel/Tournament Services | `apps/frontend/src/lib/collection-*`, `deck-*`, `trade-service.ts`, `duel-service.ts`, `tournament-service.ts`, `home-dashboard-data.ts`, `profile-service.ts`, `friend-service.ts` | Domain-nahe Frontend-Service-Anpassungen fuer Desktop- und Online-Flows | hoch | In kleinere Commits splitten, falls einzelne Feature-Flaechen trennbar sind. |
| 6 | Frontend-Seiten und UI-Politur | `apps/frontend/src/app/{decks,duels,settings,tournaments,trade}/**`, `apps/frontend/src/components/*`, `apps/frontend/src/app/layout.tsx` | SSR/UI-Anpassungen, Pack/Promo-Konsolen, LCP-Fixes fuer initiale Pack- und Binderbilder | mittel | Nach Service-Commits committen, damit UI-Aenderungen leichter reviewbar bleiben. |
| 7 | Daten-/Asset-Scripts | `scripts/audit-promo-pack-data.ts`, `scripts/repair-promo-source-cards.ts`, `scripts/backfill-promo-sources.ts`, `scripts/import-ygo-data.ts`, `.gitignore` | Promo-/Pack-Datenpflege, Import-Reparaturen, Ignore-Regeln | mittel | Separat committen und mit Daten-Audit-Ergebnis verknuepfen. |
| 8 | Dependencies | `package.json`, `package-lock.json` | Neue Scripts/Dependencies fuer Smokes oder Tooling | mittel | Mit der Gruppe committen, die die Dependency braucht; nicht als Sammelrest liegen lassen. |

## Untracked-Dateien

| Pfad | Bewertung | Gruppe |
| --- | --- | --- |
| `MVP.md` | Neue verbindliche Desktop-MVP-Arbeitsgrundlage | 1 |
| `ROADMAP.md` | Abschlussstatus und Priorisierung nach Desktop-MVP | 1 |
| `WORKTREE_INVENTORY.md` | Dieses Sortier-Dokument | 1 |
| `apps/api/src/lib/runtime-config.test.ts` | Test fuer API-Runtime-Konfiguration | 2 |
| `apps/frontend/src/app/api/v1/runs/[runId]/progression/[checkpointId]/apply/route.ts` | Neue v1-Progression-Apply-Route | 4 |
| `apps/frontend/src/app/api/v1/runs/[runId]/progression/generate/route.ts` | Neue v1-Progression-Generate-Route | 4 |
| `apps/frontend/src/app/api/v1/runs/[runId]/progression/route.ts` | Neue v1-Progression-Uebersichtsroute | 4 |
| `apps/frontend/src/lib/api-error-response.test.ts` | Fehlerantwort-Test | 2 |
| `apps/frontend/src/lib/api-route-security.ts` | API-Routen-Sicherheitshelper | 2 |
| `apps/frontend/src/lib/api-route-security.test.ts` | Test fuer Sicherheitshelper | 2 |
| `apps/frontend/src/lib/api-service-proxy.test.ts` | Proxy-Test | 2 |
| `apps/frontend/src/lib/promo-source-classification.test.ts` | Promo-Klassifizierungstest | 4/7 |
| `apps/frontend/src/lib/run-isolation.integration.test.ts` | Run-Isolations-Regressionstest | 4 |
| `scripts/audit-promo-pack-data.ts` | Promo-Daten-Audit | 7 |
| `scripts/e2e-online-smoke.ts` | Online-Smoke | 2 |
| `scripts/e2e-smoke.ts` | Desktop-Smoke | 2 |
| `scripts/repair-promo-source-cards.ts` | Promo-Reparaturscript | 7 |

## Meine Aenderungen in dieser Runde

- `MVP.md` angelegt und mehrfach mit Abnahmestatus aktualisiert.
- `ROADMAP.md` angelegt.
- `WORKTREE_INVENTORY.md` angelegt.
- `apps/frontend/src/components/binder-open-spread.tsx`: initial sichtbare Binder-Overlays auf eager loading gesetzt.
- `apps/frontend/src/components/interactive-booster-pack.tsx`: initial sichtbare Hero-Packbilder auf `loading="eager"` gesetzt.
- `apps/frontend/src/components/pack-selection-console.tsx`: nur das ausgewaehlte Timeline-Pack eager, andere Timeline-Packs lazy.

## Nicht anfassen ohne gezielten Auftrag

- Bestehende umfangreiche Service- und API-Aenderungen nicht pauschal revertieren.
- SQLite-Datenbanken und lokale Build-/Output-Artefakte nicht in Commits aufnehmen.
- Online-Dev nicht wieder zum primaeren MVP-Blocker machen; Desktop bleibt die fuehrende Abnahme.

## Empfohlener naechster Schritt

Als naechstes sollte Gruppe 1 commit-faehig gemacht werden. Danach Gruppe 2 separat reviewen und committen, weil die Smoke-/Test-Infrastruktur die Grundlage fuer alle weiteren Gruppen ist.
