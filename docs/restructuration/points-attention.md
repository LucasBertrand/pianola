# Points d'attention, compromis et validation finale

## 1. Invariants non négociables

La restructuration peut casser temporairement le montage de l'application, pas
ses règles finales :

- une intention musicale confirmée produit au plus une transaction Undo/Redo ;
- pointer move, lasso, drafts et previews ne mutent pas le document publié ;
- Canvas reçoit des snapshots explicites et ne décide ni collision, ni snap, ni
  mutation ;
- les algorithmes musicaux et de geste purs ne dépendent pas de React ou du
  navigateur ;
- toute donnée JSON est traitée comme inconnue puis validée strictement ;
- une version future, un champ ou une migration inconnus sont refusés
  explicitement ;
- le worklet garde ses buffers préalloués, son versionnage de messages et son
  horloge à l'échantillon ;
- aucun cycle d'import produit n'est accepté à la fin.

Une proposition qui simplifie l'arborescence en violant l'un de ces invariants
n'est pas une simplification recevable.

## 2. Compromis assumés

### Cinq capacités plutôt que quatre couches

La cible ne reproduit pas une Clean Architecture canonique, mais chaque racine
correspond à une question concrète : assemblage, projet durable, éditeur,
lecture audio ou entrée/sortie. La frontière importante est la direction des
dépendances et la propriété des états, pas le nombre de dossiers.

### Pureté locale plutôt que couche `editor-core`

Les calculs de geste restent purs, tout en vivant à côté du piano roll qu'ils
servent. On renonce à une racine techniquement homogène en apparence pour gagner
une cohésion fonctionnelle, avec une règle d'import vérifiable fichier par
fichier.

### `audio` et `project-io` entièrement headless

Web Audio et le worklet partagent la capacité audio ; persistance, `.pianola`
et MIDI partagent le cycle de vie externe du projet. En revanche, contrôles,
dialogues, téléchargement DOM et CSS restent sous `editor`. Ce découplage vaut
plus que la complétude d'une tranche verticale dans ces deux capacités.

### Pas de racine `music-theory`

Le vocabulaire des motifs persistés appartient à la timeline du projet. Snap,
orthographe, labels et reconnaissance d'accords servent l'éditeur. Les réunir
dans une racine autonome recréerait une catégorie technique hybride.

### Fichiers cohésifs potentiellement longs

Le seuil de 500 lignes cesse d'être une consigne de découpage. Un parseur, un
catalogue, un composant avec sous-composants privés ou un algorithme de collision
peut rester long. La revue porte sur ses raisons de changer et son nombre de
protocoles, pas sur sa longueur.

### Compatibilité externe avant pureté du modèle sérialisé

Le runtime sépare document et réglages d'éditeur, mais les codecs peuvent garder
le wire model actuel et le traduire. Ce mapper explicite est un compromis moins
risqué qu'une migration de schéma sans besoin fonctionnel.

## 3. Pièges principaux

### Déplacer sans changer de propriétaire

Renommer `domain` en `project/model` et `application` en `project/use-cases`
sans rapprocher types, règles et flux ne réduit pas la charge cognitive. Chaque
lot doit supprimer au moins une frontière ou indirection identifiée, pas
seulement changer un préfixe d'import.

### Proxies et barrels temporaires qui deviennent permanents

Comme l'application peut être cassée entre les lots, aucun proxy de réexport
n'est nécessaire. Un ancien chemin conservé pour « faciliter la transition »
masque la complétude du déplacement et rend le journal moins fiable.

### Dépendances inversées depuis les moteurs vers l'éditeur

L'éditeur affiche transport et menu projet, mais `audio` et `project-io` ne
doivent jamais importer leurs composants, types de vue ou réglages runtime. Les
moteurs exposent des snapshots, actions et résultats typés ; `editor` les
consomme et `app` injecte les implémentations.

### Runtime monolithique renommé

Déplacer `EditorRuntime` vers `app-runtime.ts` sans le décomposer laisserait le
même sac de signaux sous un nouveau nom. La runtime racine agrège des
contrôleurs nommés ; chaque contrôleur possède son état et son cycle de vie.

### React remplacé par une classe fourre-tout

Sortir un workflow d'un hook n'implique pas de créer un immense service. Une
fonction d'intention pure suffit souvent. Un contrôleur stateful n'est justifié
que pour une session durable dans le temps : lecture, interaction ou autosave.

### État persistant déplacé physiquement sans mapper

Retirer `autoScrollEnabled` du document runtime ne doit ni l'abandonner au
chargement, ni modifier silencieusement le JSON écrit. Le wire model et le
modèle runtime doivent être nommés séparément et leur conversion testée en
validation finale.

### Changement de schéma opportuniste

Les champs spéculatifs d'instrument ne sont pas une autorisation à les supprimer.
Une telle décision affecte les fichiers utilisateurs et exige un chantier de
produit/versionnement autonome. Même règle pour IndexedDB et les versions de
réglages.

### Réécriture audio dissimulée

Le regroupement d'audio est un déplacement et une séparation de coordination.
Il ne faut pas modifier simultanément ordonnanceur, protocole, allocation de
voix, DSP ou précision temporelle. Les tableaux typés transférables restent
acceptables à la frontière du worklet.

### Cycle de vie React perdu

En déplaçant transport, autosave ou listeners navigateur dans des contrôleurs,
conserver explicitement création paresseuse, abonnement, annulation,
désabonnement et destruction. Une instance stable mal détruite est plus
dommageable qu'un hook long.

### Régression CSS silencieuse

La colocalisation des feuilles change facilement l'ordre de cascade. Déplacer
les fichiers sans modifier leur contenu d'abord, inscrire l'ordre d'import
global, puis seulement fusionner les règles réellement voisines.

### Génération d'identité sur-normalisée

Centraliser les UUID et l'horloge améliore la reproductibilité. Il ne faut pas
pour autant injecter un conteneur de services dans chaque fonction. Passer une
fonction `nextId` ou `now` au seul workflow concerné.

### Tests qui définissent artificiellement du code produit

Un module utilisé seulement par les tests n'est pas nécessairement un contrat
produit. Le déplacer sous support de test ou tester l'implémentation réelle
évite une API fantôme. À l'inverse, ne pas supprimer une primitive si elle
constitue volontairement une spécification indépendante encore utile.

### Modifications utilisateur préexistantes

Le chantier démarre potentiellement sur un worktree déjà modifié. Leur liste
est figée dans `MIGRATION_STATE.md`; un déplacement qui les croise conserve le
contenu et son attribution. Aucun agent ne restaure une version Git pour
« nettoyer » le lot.

## 4. Décisions différées

Ces sujets sont volontairement hors chantier, même s'ils peuvent sembler
connexes :

- retirer ou activer les descripteurs d'effets, règles génératives et
  interprétation ;
- remplacer Tonal par une abstraction interne ;
- changer `autoAdvanceEnabled` en préférence utilisateur ;
- modifier la résolution de collisions MIDI ou notes pour mutualiser davantage
  leurs algorithmes ;
- automatiser les tests navigateur de bout en bout ;
- changer le format `.pianola`, les versions de snapshot ou le layout IndexedDB ;
- réécrire le moteur audio ou le pipeline Canvas.

Une anomalie découverte sur ces sujets est consignée comme dette ou chantier
séparé, sauf si elle empêche directement la parité structurelle.

## 5. Risques et parades

| Risque | Signal | Parade |
| --- | --- | --- |
| double source de vérité | ancien et nouveau stores mutés en parallèle | interdire les adaptateurs bidirectionnels temporaires ; migrer l'autorité en une tâche |
| import circulaire | une capacité importe son composant d'intégration | remonter la composition dans `app`, garder des paramètres étroits |
| mutation pendant preview | transaction créée sur `pointermove` | conserver session de geste et commit séparés, chercher les dispatch dans handlers fréquents |
| divergence preview/commit | deux calculs de projection temporelle | une primitive pure commune, deux adaptateurs |
| perte de compatibilité | version inchangée mais champ oublié | wire DTO explicite, fixtures historiques et round-trip final |
| course audio | preview tardive appliquée à une autre source | préserver source ID, séquence timeline et versions monotones |
| fuite de ressources | listeners, Worker ou AudioContext non détruits | cycle `start/stop/dispose` documenté et exercé dans la recette |
| régression tactile/Canvas | tests unitaires verts mais gestes incorrects | recette réelle finale sur pointeur grossier et précis |
| dossier `editor/ui` fourre-tout | primitive utilisée par une seule surface | la remettre chez cette surface ; réserver `editor/ui` aux usages transversaux internes |
| journal obsolète | worktree différent de l'état annoncé | procédure `RECOVERY_REQUIRED`, aucune restauration automatique |

## 6. Recette automatisée finale

La validation globale a lieu dans `P10`, après suppression des anciennes
racines et tolérances temporaires.

Commande canonique :

```powershell
npm run verify
```

Elle doit couvrir documentation, structure, frontières et cycles, TypeScript,
build Vite, chargement/rendu du worklet produit et suite Vitest. En cas d'échec,
les corrections restent dans `P10`; la commande est répétée jusqu'à un résultat
entièrement vert. La commande, l'environnement, la date et le résultat final
sont inscrits dans `MIGRATION_STATE.md`.

Contrôles structurels complémentaires à inclure dans les scripts finaux :

- anciennes racines et anciens préfixes absents ;
- graphe fermé aux modules cibles et sans cycle ;
- aucun import produit vers un test ;
- aucun `EditorSessionState`, `PROJECT_CONSTANTS` ou `EDITOR_CONSTANTS` ;
- aucune racine `music-theory` ni arborescence `editor/piano-roll` ;
- aucun React, JSX, DOM ou CSS sous `audio` et `project-io` ;
- aucun réexport d'agrégation dans `project/timeline/time-map.ts` ;
- aucune exception nominative pour l'ancien hook audio ou un ancien chemin ;
- aucune façade de compatibilité temporaire.

## 7. Recette manuelle finale

### Démarrage et cycle projet

- ouvrir la bibliothèque locale, créer, renommer, fermer et rouvrir un projet ;
- vérifier autosave, deux générations, récupération et quarantaine ;
- importer/exporter chaque version `.pianola` supportée et comparer le contenu
  sémantique après round-trip ;
- importer un MIDI avec avertissements/collisions, puis exporter un MIDI ;
- vérifier que les préférences utilisateur ne sont pas remplacées par un import.

### Édition et historique

- dessiner, déplacer, redimensionner, copier/couper/coller et supprimer des
  notes ;
- tester lasso additif/soustractif, notes verrouillées/muettes et collisions
  merge/slice ;
- modifier tempo, métrique, gamme, section et boucle, puis annuler en cours de
  geste et valider ;
- vérifier qu'une preview ne change pas l'historique et qu'un commit crée au
  plus une étape ;
- exécuter Undo/Redo autour d'une sélection, d'un split, d'une concaténation,
  d'une duplication et d'un réordonnancement de groupe ;
- changer de clip et retrouver grille, snap et choix persistés sans modifier
  l'historique musical.

### Canvas, pointeurs et responsive

- tester souris, tactile et stylet : appui long, double-tap, pinch, resize,
  bouton stylet, capture et annulation de pointeur ;
- vérifier ruler, grille, notes, labels, playhead, lasso et ghosts à plusieurs
  zooms et DPR ;
- tester les breakpoints téléphone/tablette/desktop, l'inspecteur redimensionné,
  toolbar, dialogs et menu radial ;
- surveiller absence de saut du slider, focus clavier et contrôles accessibles.

### Audio

- initialiser l'audio par geste utilisateur, lire/pause/stop/seek et auditionner
  le clavier ;
- vérifier boucle, tempo projeté, changement de clip, auto-enchaînement et fin
  naturelle ;
- modifier un instrument en preview, annuler puis confirmer ; vérifier mute,
  solo, gain, pan, tuning et master ;
- créer une charge Canvas/React pendant la lecture et confirmer que l'audio ne
  décroche pas ;
- fermer/remonter l'écran et confirmer l'absence de voix, listener, Worker ou
  contexte orphelin.

### Clôture

Chaque scénario reçoit `PASS`, `FAIL` ou `NOT_APPLICABLE` avec environnement et
observation. Aucun `FAIL` n'est accepté pour clôturer. Un écart déjà présent
dans la baseline peut être accepté seulement s'il est documenté comme identique
et explicitement hors périmètre.
