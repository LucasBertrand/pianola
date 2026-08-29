# Persistance

## Propriétaires

- `codecs/` sérialise et valide snapshots locaux et réglages ;
- `indexed-db/` publie catalogues, générations et réglages atomiquement ;
- `worker/` déporte le codec de projet hors du thread principal ;
- `browser/` possède quota, demande de stockage persistant et scheduling ;
- `memory/` contient les adaptateurs de référence utilisés par les tests de
  contrat ;
- `__tests__/` exécute les mêmes contrats contre mémoire et IndexedDB et vérifie
  la politique de réinitialisation.

Les interfaces implémentées vivent sous `src/application/ports/`.
L'infrastructure ne possède aucune intention applicative.

## Baseline locale

Le snapshot local emploie `app.pianola.stored-project.v1`. IndexedDB emploie le
layout 2. Une base d'une autre version est recréée sans conversion ; la raison
est exposée par `PianolaIndexedDb.resetReason`. Les réglages illisibles sont
copiés dans le store de diagnostics avant restauration des valeurs par défaut.

Validation ciblée :

```bash
npm test -- src/infrastructure/persistence/__tests__
```
