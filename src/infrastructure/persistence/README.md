# Persistance

## Propriétaires

- `codecs/` sérialise et valide snapshots locaux et réglages ;
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

Le writer et le lecteur emploient `app.pianola.stored-project.v1`. Le pipeline
de version vit sous `codecs/migrations/`, mais aucune migration historique
n'existe dans cette première baseline. Un échec complet conserve les
générations, enregistre une cause par révision et permet leur export avec un
rapport texte.

IndexedDB emploie le layout 1. `onupgradeneeded` crée les stores de la première
baseline ; `PianolaIndexedDb.layoutMigration` exposera un futur upgrade. Dans
ce reset initial, un layout local supérieur incompatible est supprimé puis la
baseline 1 est recréée. Les réglages
illisibles sont copiés dans le store de diagnostics avant restauration des
valeurs par défaut. Leur enveloppe propre est en version 2 ; la version 1 est
migrée explicitement avec le mode historique `pitch` pour les labels de notes.

Validation ciblée :

```bash
npm test -- src/infrastructure/persistence/__tests__
```
