# Stratégie de persistance

Ce document est la référence avant toute modification liée à la sauvegarde,
aux préférences, à la récupération après incident ou aux raccourcis
personnalisables. Il décrit le système courant et les validations produit qui
restent à exécuter sur appareils réels.
Pour comparer les technologies concrètes et leurs compromis, consulter
[`storage-strategies.md`](storage-strategies.md).

Dernière décision : 22 août 2026.

## Décision

Pianola sépare cinq familles d'état. Elles n'ont ni le même propriétaire, ni
la même durée de vie, ni la même politique de sauvegarde.

| Famille | Exemples | Portée | Exportée dans `.pianola` | Stockage local durable |
| --- | --- | --- | --- | --- |
| document projet | titre, clips, notes, timelines, instruments, mixage | un projet, portable | oui | oui, dans la bibliothèque locale |
| workspace de projet | clip et instrument actifs, viewport, grille et snap par clip | un projet, adaptable à l'appareil | oui, dans une section distincte | oui, avec le document |
| préférences utilisateur | raccourcis, thème futur, mode de sélection, couleur des notes, préécoute du pitch, valeurs par défaut | un utilisateur + une installation | non | oui, dans un document de réglages distinct |
| récupération | dernière révision automatique, génération précédente, date et cause de fermeture | une installation | non | oui, remplaçable et borné |
| état éphémère | playhead unique, sélection, Undo/Redo, presse-papier, geste, dialogue ouvert, voix audio | une session | non | non |

Règle de décision : une donnée nécessaire pour reproduire le morceau appartient
au document. Une donnée qui décrit où reprendre l'édition appartient au
workspace du projet. Une donnée qui décrit comment une personne utilise
l'application, quel que soit le projet, appartient à ses préférences.

Document et workspace restent deux modèles logiques afin que seul le document
entre dans Undo/Redo, mais ils forment un unique agrégat persistant. Ils sont
écrits, chargés et exportés atomiquement. Il n'existe donc ni second repository
de workspace, ni risque de workspace orphelin.

Un fichier importé ne doit donc jamais remplacer les raccourcis ou les
préférences du destinataire.

## État actuel

Aujourd'hui :

- l'accueil liste un catalogue IndexedDB sans charger les payloads projet ;
- document et `ProjectWorkspaceState` forment un `StoredProject` atomique ;
- l'autosave regroupe les changements, force une écriture périodique et flush
  lors du passage en arrière-plan ou du retour à la bibliothèque ;
- `IndexedDbProjectRepository` conserve deux générations et vérifie
  `expectedRevision` dans la transaction de publication ;
- sérialisation et validation des projets locaux s'exécutent dans un Web
  Worker ;
- `UserSettings` possède les préférences globales et les raccourcis, dans un
  repository distinct qui conserve les valeurs invalides à titre diagnostique ;
- `Export project` produit le nouveau format portable document + workspace ;
  son import crée toujours un nouveau `documentId` et ne touche pas aux
  préférences ;
- le service worker ne met en cache que le shell et les ressources statiques ;
  les projets restent exclusivement dans IndexedDB.

Les lecteurs locaux et portables v2 acceptent les enveloppes v1. Ils valident
les anciens champs de position `anchorTick` et `playheadTick`, puis les
abandonnent lors de la construction du runtime. Une sauvegarde ou un export
suivant produit uniquement le schéma v2.

## Expérience produit cible

La bibliothèque locale devient la sauvegarde normale :

1. l'application ouvre un écran d'accueil qui liste la bibliothèque locale ;
2. créer ou importer un projet lui donne un `documentId` stable ;
3. ouvrir un projet crée l'unique session d'édition et l'unique `EditorRuntime`
   actif ;
4. chaque transaction musicale validée marque le projet comme à persister ;
5. un autosave asynchrone écrit une nouvelle révision locale ;
6. fermer ou mettre l'application en arrière-plan tente un flush, sans être le
   seul mécanisme de sécurité ;
7. revenir à l'accueil ferme cette session après publication ou signalement de
   l'échec de sauvegarde ;
8. `Export` crée une copie `.pianola` contenant document et workspace ;
9. `Import` valide un document externe puis crée une entrée locale distincte.

L'écran d'accueil ne monte pas plusieurs projets. Il lit uniquement des résumés
de catalogue (titre, date, taille, dernière révision) et ne désérialise le
payload complet qu'à l'ouverture du projet choisi. Pianola ne propose ni onglets
de projet ni sessions d'édition concurrentes dans son interface.

`Autosave` et `Export` ne sont pas synonymes. L'autosave protège le travail dans
le stockage privé de l'application. L'export produit un document appartenant à
l'utilisateur, partageable et conservé indépendamment de l'installation.

L'édition courante est sauvegardée automatiquement. L'import portable vit dans
la bibliothèque et crée un projet distinct ; `Export project` télécharge une
copie indépendante de la bibliothèque locale.

## Contrats et frontières

Le domaine et l'éditeur restent indépendants des APIs du navigateur. Les cas
d'usage reçoivent des ports asynchrones injectés à la composition :

```text
ProjectStore / UserSettingsStore
  → cas d'usage de persistance
  → ProjectRepository / UserSettingsRepository
  → adaptateur IndexedDB de la PWA
```

Responsabilités en place :

- `src/project-io/` conserve uniquement les formats portables et leur
  validation ;
- `src/persistence/` possède l'agrégat `StoredProject`, les réglages,
  migrations, ports et cas
  d'usage indépendants de la plateforme ;
- l'adaptateur `src/pwa/persistence/` possède IndexedDB, StorageManager et les capacités
  d'import/export de fichiers ;
- `src/app/` crée cet adaptateur et l'injecte ;
- React affichera l'état et les erreurs, mais n'effectuera aucune écriture
  directe dans IndexedDB ou `localStorage`.

Contrats conceptuels minimaux :

```ts
interface StoredProject {
  readonly documentId: string;
  readonly revision: number;
  readonly updatedAt: string;
  readonly document: ProjectDocument;
  readonly workspace: ProjectWorkspaceState;
}

interface ProjectRepository {
  list(): Promise<readonly ProjectSummary[]>;
  load(documentId: string): Promise<StoredProject | null>;
  save(snapshot: StoredProject, expectedRevision: number | null):
    Promise<StoredRevision>;
  remove(documentId: string): Promise<void>;
}

interface UserSettingsRepository {
  load(): Promise<UserSettings>;
  update(transform: (current: UserSettings) => UserSettings):
    Promise<UserSettings>;
}
```

`expectedRevision` interdit les écrasements silencieux si deux onglets ou deux
fenêtres du navigateur écrivent accidentellement le même projet, même si Pianola
n'expose aucun système d'onglets. L'adaptateur implémente ce contrat par une
transaction IndexedDB.
Les générations de récupération sont une politique interne de
`ProjectRepository`, pas un modèle visible de l'éditeur.

## Formats et versions

Trois versions indépendantes doivent rester explicites :

1. version du document portable `.pianola` ;
2. version des enveloppes locales (projet, récupération et réglages) ;
3. version du schéma physique du moteur de stockage, par exemple IndexedDB.

Une montée de version de l'une ne force pas celle des autres. Chaque enveloppe
possède au minimum `format`, `schemaVersion` et `updatedAt`. Un projet local
possède aussi `documentId`, `revision` et le payload validé.

Le pipeline de lecture est toujours :

```text
octets ou valeur inconnue
  → reconnaissance format/version
  → migrations stockées vN vers vN+1
  → validation bornée
  → construction du modèle runtime
```

Le parseur ne doit jamais interpréter directement une donnée stockée comme un
type TypeScript fiable. Les migrations sont pures, séquentielles et testées sur
des fixtures réellement sérialisées.

Politique d'erreur :

- document externe invalide : refus sans modifier le projet courant ;
- réglages invalides : conserver une copie diagnostique, repartir de valeurs
  sûres et signaler la récupération ;
- autosave invalide : charger la génération précédente ;
- version future inconnue : refuser proprement, sans tenter de réécrire.

## Atomicité et autosave

Une écriture ne devient visible qu'après validation complète. Le repository
conserve au moins la révision courante et la dernière génération valide :

```text
construire snapshot immuable
  → sérialiser
  → relire/valider
  → écrire nouvelle génération
  → publier le pointeur de révision
  → élaguer les anciennes générations
```

L'autosave est déclenché après une transaction métier, regroupé par debounce et
forcé périodiquement pendant une édition continue. Il capture un snapshot
immuable ; il ne bloque ni le geste, ni l'audio. Une nouvelle modification
pendant l'écriture programme la révision suivante au lieu de muter le payload en
cours.

Les projets ambitieux pouvant peser plusieurs mégaoctets, sérialisation,
validation coûteuse et calcul éventuel d'empreinte s'exécutent dans un Web
Worker. IndexedDB reçoit un `Blob` ou un payload sérialisé opaque, plus un résumé
léger pour l'écran d'accueil. Les écritures sont strictement séquentielles et
conservent deux générations. Une normalisation note par note dans la base n'est
pas justifiée tant que des mesures ne démontrent pas que le snapshot complet est
trop coûteux.

Ne jamais dépendre uniquement de `beforeunload` ou d'un événement de fermeture :
sur mobile, le processus peut être suspendu ou arrêté sans délai. Les erreurs de
quota, d'espace disque, de permission ou de sérialisation doivent être visibles
et ne doivent jamais faire croire que le projet est protégé.

## Préférences et raccourcis

Les raccourcis personnalisés appartiennent à `UserSettings`, pas au projet. Ils
sont indexés par identifiant d'action stable, jamais par fonction, composant ou
texte affiché :

```text
editor.undo       → Ctrl+Z
editor.redo       → Ctrl+Shift+Z
transport.toggle  → Space
```

Le modèle devra distinguer touche physique et caractère lorsque le produit
prendra en charge plusieurs dispositions de clavier. La validation détectera
les doublons, combinaisons réservées, actions inconnues et bindings
inaccessibles. Les valeurs par défaut restent versionnées dans le code ; le
stockage ne contient que le document de réglages validé, pas des callbacks.

Les réglages sont écrits en série par un propriétaire unique. Les changements
rapides sont regroupés, mais une mise à jour reste une opération atomique
lecture-modification-écriture.

## Une PWA, trois modes de lancement

Pianola reste une Progressive Web App dans tous les cas :

1. page ouverte dans un navigateur de bureau ;
2. PWA installée par Chrome sur bureau ou Android ;
3. future distribution Google Play ouvrant la même PWA, par exemple dans une
   Trusted Web Activity.

Ces modes utilisent le même origin HTTPS, le même schéma IndexedDB, les mêmes
codecs et le même repository. Une distribution Google Play ne justifie ni
DataStore, ni Room, ni un modèle de persistance Android parallèle. Une Trusted
Web Activity affiche le contenu Web via un navigateur compatible et vérifie le
lien entre application et site avec Digital Asset Links. Référence :
[Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity).

Le nom de domaine et l'origin de production deviennent donc une partie de
l'identité durable des données. Un changement d'origin nécessite un plan de
migration explicite ; une redirection HTTP ne déplace pas IndexedDB.

Répartition des APIs PWA :

- Cache Storage et service worker : fichiers du shell permettant le démarrage
  hors ligne, jamais les projets utilisateur ;
- IndexedDB : catalogue, générations de projets, réglages et métadonnées ;
- StorageManager : estimation quota/usage et demande de stockage persistant ;
- File System Access lorsqu'il est disponible : confort d'ouverture ou de
  réécriture d'un fichier choisi ;
- `<input type="file">` et téléchargement : fallback universel d'import/export.

Le stockage d'un origin est initialement soumis à la politique du navigateur.
Pianola demande `navigator.storage.persist()` après une action utilisateur
significative, contrôle `navigator.storage.estimate()` avant une grosse écriture
et traite `QuotaExceededError`. Une autorisation de persistance réduit le risque
d'éviction, mais ne remplace jamais une sauvegarde exportée. Références :
[offline data for PWAs](https://web.dev/learn/pwa/offline-data) et
[Storage Standard](https://storage.spec.whatwg.org/).

### Workspace indépendant de la taille d'écran

Le workspace voyage avec le projet, mais ne stocke aucune dimension de fenêtre,
coordonnée de pointeur ou position brute en pixels CSS. Le format cible exprime
la navigation en coordonnées musicales : tick visible ou central, pitch visible
ou central, facteurs de zoom et identifiants actifs. Le playhead est exclu : il
repart au début du clip actif à chaque nouvelle session.

Au chargement, l'adaptateur d'éditeur projette ces valeurs dans le viewport
réel, puis les borne selon la taille disponible. Le même fichier peut ainsi être
ouvert sur une tablette étroite et un écran de bureau sans posséder deux
workspaces. Les préférences propres aux périphériques d'entrée restent dans
`UserSettings` : les raccourcis clavier sont actifs sur bureau et simplement
ignorés, mais conservés, sur un appareil tactile.

## Migrations `.pianola`

L’enveloppe portable utilise `schemaVersion: 3` sous l'identité
`app.pianola.project`, tandis que le document musical embarqué utilise
actuellement le schéma métier v9. Son lecteur convertit les anciens documents
vers la version courante et ignore les positions de playhead historiques. La
v3 remonte `autoAdvanceEnabled` des transports de clips vers le document projet,
la v4 introduit la hiérarchie de groupes, la v5 ajoute leur couleur, la v6 le
bypass des clips, la v7 le bypass des groupes et la v8 remplace `Note.enabled`
et le verrouillage par instrument par le statut unifié de chaque note. Lors de
la migration, les deux anciens booléens sont combinés en `active`, `muted`,
`locked` ou `disabled`. La v9 renomme ensuite l'ancien statut `frozen` en
`disabled`. Les anciens groupes reçoivent automatiquement un bypass
désactivé. Les trois
préférences auparavant mêlées à `editor` restent chargées uniquement depuis
`UserSettings`.

Le codec historique isolé sous `src/project-io/native/` applique la même
tolérance v1/v2/v3 pour ses fixtures et exports, même s’il n’est relié ni à la
bibliothèque, ni au menu d’import, ni à l’autosave.

## Tests obligatoires

Chaque repository partage une suite de contrat exécutable contre l'adaptateur
mémoire et l'adaptateur réel. Les scénarios minimaux couvrent :

- redémarrage après sauvegarde ;
- deux écritures concurrentes et révision attendue obsolète ;
- interruption entre nouvelle génération et publication ;
- quota ou espace insuffisant ;
- corruption de la révision courante avec repli sur la précédente ;
- round-trip de chaque version du nouveau format à partir de fixtures
  sérialisées ;
- refus d'une version future ;
- import invalide sans mutation du runtime ;
- réglages invalides remplacés par les défauts sans toucher aux projets ;
- autosave après Undo et après Redo ;
- mise en arrière-plan ou arrêt du processus pendant une écriture ;
- projet de plusieurs mégaoctets sérialisé sans bloquer le thread principal ;
- même bibliothèque depuis le navigateur et la PWA installée pour un origin
  donné ;
- lancement par la future enveloppe Google Play sur appareil réel.

## Feuille de route

1. [x] Extraire `ProjectWorkspaceState`, `UserSettings`, défauts et codecs.
2. [x] Introduire `UserSettingsRepository` et les raccourcis par action stable.
3. [x] Introduire `ProjectRepository`, IndexedDB, autosave et deux générations.
4. [x] Livrer bibliothèque, import/export et état de sauvegarde visible.
5. [x] Livrer le format portable et sa migration de lecture v1 vers v2.
6. [x] Ajouter le service worker de shell et les politiques StorageManager.
7. [ ] Valider hors ligne, installation Chrome, suspension, arrêt forcé,
   manque d'espace et sauvegarde/restauration sur bureau et Android réels.
8. [ ] Lorsque la distribution store devient prioritaire, produire et tester une
   enveloppe Trusted Web Activity reliée au même origin, sans déplacer la
   persistance hors du Web.

Le cloud, le compte utilisateur et la synchronisation multi-appareils restent
hors périmètre. Les identifiants et révisions prévus ici permettent de les
ajouter plus tard sans faire du stockage local une fausse synchronisation.

## Checklist de maintenance

Avant d'ajouter un état persistant :

1. le classer dans le tableau de décision ;
2. identifier son propriétaire canonique et sa portée ;
3. décider s'il est portable, lié à l'origin ou conservé par export ;
4. ajouter limite, valeur par défaut, validation et migration ;
5. tester corruption, version future et échec d'écriture ;
6. vérifier qu'aucun fichier importé ne modifie les préférences utilisateur ;
7. mettre à jour ce document et [`state-ownership.md`](state-ownership.md).
