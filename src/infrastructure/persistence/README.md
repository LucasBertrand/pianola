# Persistance

## Propriétaires

- `codecs/` sérialise, migre et valide snapshots locaux et réglages ;
- `indexed-db/` publie catalogues, générations et réglages atomiquement, et
  conserve la quarantaine exportable ;
- `worker/` déporte le codec de projet hors du thread principal ;
- `browser/` possède quota, demande de stockage persistant et scheduling ;
- `memory/` contient les adaptateurs de référence utilisés par les tests de
  contrat ;
- `__tests__/` exécute les mêmes contrats contre mémoire et IndexedDB et vérifie
  la politique de réinitialisation.

Les interfaces implémentées vivent sous `src/application/ports/`.
L'infrastructure ne possède aucune intention applicative.

## Compatibilité locale

Le writer emploie `app.pianola.stored-project.v2`. Le lecteur accepte aussi
`app.pianola.stored-project.v1` via sa migration pure vers le vocabulaire
`Synth`. Le routage
commun des enveloppes versionnées appartient à
`infrastructure/migration/`. Cette zone conserve uniquement les
migrations concrètes des projets locaux et des réglages. Un échec complet conserve les
générations, enregistre une cause par révision et permet leur export avec un
rapport texte.

Lorsqu'un snapshot local ou un réglage change, son routeur de migration reste à
la racine de `codecs/` et suit la procédure de
[`migration`](../migration/README.md) : version d'écriture augmentée,
étape pure `n -> n + 1`, parseur courant strict et preuve de transition. Le
repository ne contient pas de branche de compatibilité de format.

IndexedDB emploie le layout 1. `onupgradeneeded` crée les stores de la première
baseline ; `PianolaIndexedDb.layoutMigration` exposera un futur upgrade. Dans
ce reset initial, un layout local supérieur incompatible est supprimé puis la
baseline 1 est recréée. Les réglages
illisibles sont copiés dans le store de diagnostics avant restauration des
valeurs par défaut. L'enveloppe des réglages écrit
`app.pianola.user-settings.v2` et migre sa version 1, presets personnels inclus.

Validation ciblée :

```bash
npm test -- src/infrastructure/persistence/__tests__
```
