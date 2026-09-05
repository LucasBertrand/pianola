# Suivi de l'audit architectural

Ce dossier conserve le contexte nécessaire pour reprendre l'audit sans perdre
les constats, décisions et priorités établis lors des sessions précédentes.

## Rituel de démarrage

1. Lire ce fichier.
2. Lire `roadmap-evolution.md`.
3. Lire le dernier rapport sous `sessions/`.
4. Vérifier `git status --short`.
5. Comparer la documentation architecturale au code réel avant de conclure.

## Rituel de clôture

1. Mettre à jour l'état et les prochaines étapes de la feuille de route.
2. Créer un rapport de session factuel.
3. Consigner les arbitrages de nommage et leurs conséquences.
4. Indiquer les validations exécutées et les limites restantes.
5. Distinguer les changements de la session des changements préexistants.

## États utilisés

- `à explorer`
- `en cours`
- `confirmé`
- `planifié`
- `corrigé`
- `vérifié`
- `écarté`

Tout constat architectural doit citer des fichiers ou flux précis. Une
hypothèse ne devient pas un défaut confirmé sans preuve dans le code.
