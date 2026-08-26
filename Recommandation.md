Ce dossier est nettement au-dessus du niveau habituel d'un plan de migration — hiérarchie d'autorité explicite, séparation décision/diagnostic/état, discipline anti-big-bang, gestion des alias avec lot de suppression tracé, règle « jamais déplacement + renommage + changement fonctionnel en même temps ». Voici les points qui, à mon avis, méritent d'être resserrés avant de lancer le lot 0.

## 1. Ambiguïté dossier logique vs dossier physique avant le Lot 7

Les lots 1, 3, 4 et 6 donnent des destinations comme `application/ports`, `infrastructure/persistence`, `presentation/editor/piano-roll/rendering/` — alors que le Lot 7 est censé être le moment où `use-cases` devient `application`, `ui` devient `presentation`, etc. Rien n'indique explicitement que les nouveaux dossiers racines se créent *progressivement* au fil des lots pendant que les anciens rétrécissent, et que le Lot 7 n'est qu'un « balayage final » du reliquat. Sans cette précision, un agent exécutant le Lot 3 peut hésiter : crée-t-il `src/application/ports/` dès maintenant, ou stocke-t-il provisoirement ailleurs ? Je recommande une phrase explicite dans `ROADMAP.md` ou `TARGET.md` qui tranche ce point.

## 2. Deux entrées de `MAPPING.md` sans lot d'exécution

- `Track` → `InstrumentTrack` : ce renommage figure dans le tableau « renommages conceptuels » mais aucun lot du `ROADMAP.md` n'en parle (le Lot 1 ne couvre que le vocabulaire *workspace*).
- `src/music/` → `src/domain/harmony/` : idem, aucun lot ne le mentionne (ni le Lot 6 « horizontales », ni le Lot 7 qui liste explicitement audio/fichiers/persistance/navigateur mais pas `music`).

Ce sont des orphelins : soit on leur assigne un lot explicite, soit on les retire de `MAPPING.md` pour éviter qu'un agent les exécute « sauvagement » sans garde-fou de validation.

## 3. D-008 fige un niveau de détail technique inhabituel pour une « décision »

Les autres décisions (D-001 à D-007) sont des choix de haut niveau. D-008 va jusqu'à prescrire le pattern `useSyncExternalStore` avec stabilité de sélecteur, l'emplacement exact des signaux haute fréquence, etc. — sur le lot le plus risqué (Lot 5, découpage d'un composant de 1300+ lignes et 61 imports). Comme `DECISIONS.md` explique qu'on ne rouvre pas une décision sans demande explicite de l'utilisateur, ce niveau de détail technique verrouillé *avant* d'avoir touché le code réel peut coincer le Lot 5 si la pratique révèle un besoin non anticipé (ex. mémoïsation supplémentaire, cas de sélecteur composé). Je séparerais le vrai arbitrage produit (« pas de Zustand, pas de store UI global ») — ça, c'est une décision légitime — de la recette d'implémentation détaillée, qui gagnerait à rester dans `TARGET.md`/`ROADMAP.md` comme guideline révisable pendant le Lot 5 plutôt que verrouillée en amont.

## 4. Aucun critère de non-régression de performance pour le Lot 5

Toute l'architecture de réactivité cible (D-008/TARGET) existe justement pour éviter les rerenders inutiles sur `viewport`, `playhead`, survols et previews de geste. Or `VALIDATION.md` ne prévoit que typecheck/tests/build — rien qui détecte une régression de perf (rerender storm, frame drop sur le Canvas). Un découpage réussi *du point de vue des types* peut très bien introduire un rerender global régressif que rien dans la validation ne repère. Cela vaudrait un critère explicite pour le Lot 5 (test ciblé de non-notification sur sélection inchangée — d'ailleurs presque promis en fin de Lot 5 — plus, idéalement, un smoke test de perf manuel ou automatisé).

## 5. Couverture de tests inconnue sur les fichiers qu'on s'apprête à découper

`BASELINE.md` liste les points de concentration (`PianoRollWorkspace.tsx`, `time-map.ts`, `ClipInspector.tsx`, `clip-commands.ts`...) mais ne dit rien de leur couverture de tests actuelle. Avant un découpage aussi profond (Lot 5 en particulier), connaître le niveau de couverture de ces fichiers précis est une information de risque de premier ordre, distincte des « tests d'intégration flux audio/domaine/MIDI/interaction » mentionnés en général.

## 6. Rollback non opérationnalisé

Chaque lot est censé avoir « un point de rollback » (intro de `ROADMAP.md`), mais ni `RUNBOOK.md` ni `VALIDATION.md` ne précisent le mécanisme concret (tag/branche git avant chaque lot, commit atomique par sous-étape...). C'est le genre de détail qui, une fois manquant, se découvre au pire moment.

## 7. Le Lot 5 n'a qu'un critère de sortie global pour six sous-étapes

C'est le lot le plus lourd et le plus risqué du plan (le seul avec une « condition d'entrée » documentée d'ailleurs, signe qu'il est déjà perçu comme spécial). Pourtant les six extractions listées (préférences/presets, cycle de vie projet, menu radial, dialogues, layout/portals, transport/viewport) n'ont pas de critère de sortie individuel — seulement un critère pour l'ensemble du lot. Vu la taille du fichier de départ, un jalon de validation après chacune des six étapes réduirait le risque de devoir tout défaire d'un coup en cas de problème découvert à l'étape 5 ou 6.

## Deux détails mineurs
- Le Lot 3 parle d'extraire « les ports de repository et codec vers `application/ports` », alors que `MAPPING.md` précise que seuls les *ports* (contrats) vont côté application et que les codecs/enveloppes restent infrastructurels — la formulation du lot pourrait être lue comme contredisant cette nuance. Suggestion : écrire « ports de repository et de codec » pour lever l'ambiguïté.
- `BASELINE.md` nomme `clip-commands.ts` comme fichier de +700 lignes, `ROADMAP.md` (Lot 6) parle de découper `active-clip-command-helpers.ts` — à vérifier qu'il s'agit bien du même fichier, sinon la référence croisée va perdre l'agent exécutant.

Rien de tout ça ne remet en cause la structure d'ensemble, qui est solide — ce sont des trous précis à combler avant de lancer le Lot 0, plutôt qu'un problème de conception globale.