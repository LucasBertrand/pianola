# Données versionnées

Cette zone possède le moteur générique qui route une enveloppe persistée selon
son format et sa version, applique sans saut ses migrations `n -> n + 1`, puis
produit un rapport agrégé.

Cette zone contient aussi les transformations pures partagées par plusieurs
enveloppes, comme la transition du document projet de la version 1 à la version
2. Les routeurs propres aux snapshots locaux et aux réglages restent
à la racine de `infrastructure/persistence/codecs/`; celui des fichiers
portables reste à la racine de `infrastructure/project-files/pianola/`.

Le moteur réutilise les lecteurs JSON stricts et les erreurs de persistance
existants. Il ne dépend ni du navigateur, ni d'IndexedDB, ni d'un codec concret.

## Ajouter une version persistée

Toute évolution qui modifie la structure, le sens ou le vocabulaire d'une
enveloppe persistée suit cette séquence, dans le même changement :

1. augmenter la version écrite et déclarer le format attendu pour cette version ;
2. ajouter, près du format concerné, une étape pure et fermée `n -> n + 1` ;
3. transformer explicitement chaque donnée ancienne, sans valeur implicite ni
   abandon de champ ;
4. conserver les parseurs dédiés à la validation stricte du modèle courant :
   aucune branche de rétrocompatibilité ne leur est ajoutée ;
5. tester la migration, sa chaîne complète depuis la plus ancienne version
   encore supportée, l'absence d'étape et le refus d'une version future.

Une étape produit une enveloppe qui porte déjà son nouveau `format` et sa
nouvelle `schemaVersion`. Le pipeline le vérifie avant de poursuivre. Les
writers n'émettent que la version courante ; une version future ou une migration
manquante est refusée et le payload d'origine reste intact.

Test ciblé :

```bash
npm test -- src/infrastructure/migration/__tests__/versioned-migration-pipeline.test.ts
```
