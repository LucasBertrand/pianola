# Runbook pour agent

## Démarrage d'une session

1. Lire tous les fichiers indiqués par `README.md` dans l'ordre.
2. Lire les éventuelles instructions `AGENTS.md` du workspace.
3. Exécuter `git status --short` et préserver les changements préexistants.
4. Lire le lot actif dans `STATUS.md`.
5. Vérifier que ses prérequis et son périmètre sont explicites.
6. Relever les imports et tests des fichiers concernés avant de les modifier.
7. Enregistrer dans `STATUS.md` le SHA de `HEAD`, l'état du worktree et le point
   de rollback choisi avant toute modification du lot.

Si aucun lot n'est marqué `EN COURS`, sélectionner uniquement le premier lot
`À FAIRE`. Ne pas sauter de lot sans consigner la raison.

## Exécution d'un lot

1. Écrire dans `STATUS.md` : objectif, périmètre, baseline et fichiers prévus.
2. Faire les renommages/déplacements avec des opérations conservant l'historique.
3. Mettre à jour les imports sans ajouter de barrel global.
4. Mettre à jour les tests et documents directement affectés afin qu'ils
   décrivent le code courant à la fin de la sous-étape ; ne pas différer cette
   synchronisation au lot 8.
5. Exécuter la validation proportionnée après chaque sous-étape.
6. Rechercher les anciens noms et chemins avec `rg`.
7. Exécuter la validation complète avant de déclarer le lot terminé.
8. Mettre à jour `STATUS.md` avec résultats, écarts et prochain point de reprise.

## Rollback opérationnel

Un point de rollback est une unité vérifiable, pas seulement une intention :

- privilégier un commit dédié par sous-étape lorsque la création de commits est
  autorisée ; ce commit ne contient aucun changement préexistant de
  l'utilisateur ;
- sinon, conserver une liste exacte des fichiers du lot et un patch binaire de
  la seule sous-étape hors du worktree, puis ne commencer aucune autre
  sous-étape avant validation ;
- inscrire dans `STATUS.md` le SHA de départ, l'identifiant du commit ou du
  patch, les fichiers inclus et la commande de validation qui était verte ;
- pour revenir en arrière, préférer `git revert` sur un commit dédié. Pour une
  sous-étape non commitée, vérifier d'abord qu'aucun fichier concerné n'a reçu
  de changement utilisateur, puis appliquer l'inverse du patch ciblé ;
- ne jamais employer `git reset --hard`, restaurer tout le worktree ou inclure
  des fichiers hors périmètre pour simplifier un rollback.

Le lot 5 possède un point de rollback distinct après chacune de ses six
extractions. Un rollback ne doit jamais annuler un jalon déjà validé.

## Règles de sécurité

- considérer uniquement la nouvelle baseline comme format supporté et supprimer
  les anciens codecs et migrations au lot prévu ;
- ne pas modifier le schéma persistant dans un lot de déplacement ;
- ne pas modifier une règle métier pendant un découpage de fichier ;
- ne pas restaurer, écraser ou incorporer les changements préexistants de
  l'utilisateur ;
- ne pas utiliser un alias temporaire sans inscrire sa suppression dans le lot ;
- ne pas créer de nouveau dossier générique pour résoudre rapidement un import ;
- conserver `ScaleMarker` tel quel.

## Gestion d'une découverte

Une découverte ne change pas automatiquement la cible.

- fait technique local : l'ajouter aux notes du lot dans `STATUS.md` ;
- nouvelle dépendance à traiter : l'ajouter aux écarts et au lot approprié ;
- contradiction avec `DECISIONS.md` : arrêter le lot et demander arbitrage ;
- changement fonctionnel nécessaire : le sortir du lot architectural et le
  proposer séparément.

## Format de compte rendu

```text
Lot :
Statut : À FAIRE | EN COURS | BLOQUÉ | TERMINÉ
Objectif :
Fichiers touchés :
Déplacements/renommages :
Compatibilités temporaires :
Point de rollback (SHA + commit/patch + fichiers) :
Validations exécutées :
Résultats :
Écarts découverts :
Prochaine action exacte :
```
