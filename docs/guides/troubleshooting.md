# Dépannage

## `npm ci` échoue avec `EPERM` sous Windows

Fermer Vite, les tests watch et les explorateurs ouverts sur `node_modules`,
puis relancer dans un terminal ayant accès au dossier. Éviter de mélanger les
installations de plusieurs versions de Node.

## Page blanche ou erreur React

Exécuter `npm run typecheck` puis `npm run build`. Vérifier que la version Node
est celle de `.nvmrc` et que `npm ci` a terminé sans avertissement bloquant.

## Aucun son

Le navigateur peut suspendre Web Audio avant un geste utilisateur. Cliquer sur
Lecture ou auditionner une touche, vérifier le mute master, le mute instrument
et le volume système. Les erreurs d’initialisation sont affichées dans le
dialogue applicatif.

## Le son saute après une édition

Lancer le témoin audio et le contrôle complet :

```bash
npm test -- src/audio/__tests__/playback-plan.test.ts
npm run verify
```

Rechercher ensuite dans `src/audio/lookahead-scheduler.ts` pour l’horloge et
dans `src/audio/web-audio-engine.ts` pour le graphe navigateur.

## Canvas flou, absent ou désaligné

Vérifier zoom navigateur, ratio de pixels et orientation. Le pipeline Canvas est
documenté dans
[`../../src/ui/piano-roll/rendering/README.md`](../../src/ui/piano-roll/rendering/README.md).

## Un fichier ne charge pas

Pour `.pianola`, vérifier la version, le JSON et les limites du schéma. Pour un
MIDI, vérifier le message d’analyse puis lancer le test MIDI ciblé du
[guide des fichiers](project-files.md).

## `check:docs` ou `check:structure` échoue

Le message donne le document ou chemin responsable. Mettre à jour le propriétaire
réel et [`../code-map.md`](../code-map.md), puis supprimer l’ancien chemin au
lieu de maintenir deux terminologies.
