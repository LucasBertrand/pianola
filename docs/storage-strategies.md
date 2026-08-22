# Stratégies de stockage

Ce guide explique les technologies de stockage envisageables pour Pianola. Il
complète [`persistence-strategy.md`](persistence-strategy.md), qui fixe la
répartition des données et l'architecture retenue. Ici, l'objectif est de
comprendre les compromis et de savoir quand choisir chaque solution.

Dernière revue : 22 août 2026.

## Recommandation actuelle

Pianola doit combiner plusieurs mécanismes au lieu de chercher un stockage
unique pour tous les usages :

```text
shell PWA hors ligne                       → Cache Storage / service worker
bibliothèque, autosave et préférences       → IndexedDB
gros payloads sérialisés                    → Blob IndexedDB produit en Worker
import/export appartenant à l'utilisateur   → fichier .pianola
installation Chrome ou future Google Play   → même PWA, même origin
synchronisation multi-appareils             → hors périmètre pour l'instant
```

Pianola reste une PWA sur bureau, Android et dans une future enveloppe Google
Play. `ProjectRepository` et `UserSettingsRepository` isolent IndexedDB du reste
du code, mais aucun second adaptateur natif n'est planifié.

## Critères de choix

Avant de choisir une technologie, évaluer :

- **propriété** : donnée privée de l'application ou document appartenant à
  l'utilisateur ;
- **durée de vie** : session, installation, après désinstallation ou plusieurs
  appareils ;
- **atomicité** : possibilité de publier plusieurs changements ensemble ou de
  revenir à la dernière génération valide ;
- **volume** : quelques options, projets JSON de plusieurs mégaoctets ou futurs
  médias binaires ;
- **accès** : lecture complète d'un projet ou requêtes sur un catalogue ;
- **thread principal** : API synchrone ou asynchrone ;
- **quota et éviction** : comportement sous pression de stockage ;
- **portabilité** : navigateurs, PWA installée et fichiers échangeables ;
- **migration** : capacité à lire durablement les anciennes versions ;
- **complexité opérationnelle** : permissions, comptes, conflits et support.

## Tableau comparatif

| Stratégie | Bon usage | Atouts | Limites | Décision Pianola |
| --- | --- | --- | --- | --- |
| mémoire seule | drafts, sélection, Undo/Redo, tests | très simple et rapide | tout disparaît à l'arrêt | uniquement pour l'éphémère |
| fichier `.pianola` manuel | import, export, partage, sauvegarde externe | portable et contrôlé par l'utilisateur | pas d'autosave ni de catalogue fiable | indispensable, mais pas stockage principal |
| `localStorage` | petit drapeau non critique | API triviale | synchrone, chaînes seulement, pas de transaction de projet | interdit pour projets et réglages structurés |
| Cache Storage | shell HTML/CSS/JS et ressources réseau hors ligne | intégré aux service workers | mauvais propriétaire des documents utilisateur | shell PWA uniquement |
| IndexedDB | bibliothèque, révisions, catalogue, réglages et `Blob` | asynchrone, transactionnel, indexable | lié à l'origine et aux politiques du navigateur | stockage principal de la PWA |
| OPFS | gros fichiers privés, accès binaire intensif, SQLite/Wasm futur | modèle fichier privé et accès efficace | catalogue et migrations à construire, non visible de l'utilisateur | différer tant que les projets restent JSON |
| fichier choisi par le navigateur | ouvrir ou réécrire un document utilisateur | document visible hors de l'application | autorisation et capacités variables selon l'environnement | amélioration optionnelle avec fallback import/download |
| stockage natif Android | fichiers privés, DataStore ou Room | intégration native profonde | deuxième architecture, incompatible avec la cible PWA pure | écarté |
| cloud distant | sauvegarde de compte et synchronisation | multi-appareils et restauration après perte | comptes, réseau, sécurité, coût et conflits | étape ultérieure séparée |

## Mémoire seule

La mémoire reste le bon propriétaire des données qui n'ont aucune valeur après
la session : sélection, presse-papier interne, geste en cours, dialogue ouvert,
voix audio et historique Undo/Redo.

Persister ces états crée généralement plus de problèmes qu'il n'en résout. Par
exemple, restaurer un Undo/Redo ancien après une migration de document imposerait
de maintenir toutes les anciennes commandes et leurs invariants.

## Fichiers `.pianola`

Un fichier est un document portable, pas une base locale. Il convient à :

- l'import et l'export ;
- l'archivage choisi par l'utilisateur ;
- le transfert entre bureau et tablette ;
- une sauvegarde qui doit rester disponible après désinstallation.

Une stratégie uniquement fondée sur des fichiers manuels est insuffisante sur
mobile : elle dépend d'une action explicite, ne protège pas les dernières
modifications et rend difficile une bibliothèque avec plusieurs révisions.

Le même payload sérialisé est réutilisé à l'intérieur du repository local.
IndexedDB peut stocker les octets, un `Blob` ou la chaîne validée du projet. Le
format métier reste ainsi indépendant du moteur de stockage.

## Cache Storage et service worker

Cache Storage conserve les réponses réseau nécessaires au démarrage hors ligne :
HTML, JavaScript, CSS, polices et ressources statiques versionnées. Il ne doit
jamais contenir la bibliothèque ou les préférences, car son cycle de mise à jour
est celui du déploiement de l'application, pas celui des documents utilisateur.

La PWA suit donc deux pipelines indépendants :

```text
déploiement → service worker → Cache Storage → shell hors ligne
édition     → ProjectRepository → IndexedDB  → projets utilisateur
```

Le service worker ne possède pas l'autosave : il peut être arrêté par le
navigateur et ne connaît pas le snapshot canonique de l'éditeur.

## `localStorage`

`localStorage` paraît séduisant parce qu'il est simple, mais son API est
synchrone et ne fournit pas les transactions nécessaires à une publication
atomique de projet, catalogue et révision. Il impose aussi une représentation
textuelle et offre peu de contrôle sur les conflits.

Usages éventuellement acceptables :

- mémoriser qu'un message non critique a déjà été affiché ;
- conserver une préférence minuscule avant l'initialisation du repository ;
- faciliter un diagnostic temporaire.

Même les raccourcis personnalisés devraient aller dans
`UserSettingsRepository`, pas directement dans `localStorage`.

## IndexedDB

IndexedDB est une base locale d'objets, asynchrone et transactionnelle. Elle
permet de stocker des valeurs structurées ou binaires, de maintenir des index et
de modifier plusieurs enregistrements dans une même transaction. La
[spécification IndexedDB](https://www.w3.org/TR/IndexedDB/) décrit les
transactions comme des ensembles atomiques d'opérations de lecture et mutation.

Organisation initiale possible :

```text
pianola database
├── projects          résumé courant par documentId
├── projectRevisions  payloads, clé [documentId, revision]
├── settings          document UserSettings unique
└── metadata          version physique et coordination
```

Une sauvegarde écrit la nouvelle révision et met à jour le résumé dans la même
transaction. Après succès, les générations trop anciennes sont supprimées. Le
payload complet reste opaque pour IndexedDB : sa validation appartient au codec
Pianola.

Pour les projets de plusieurs mégaoctets :

- le thread principal capture un snapshot immuable puis rend la main ;
- un Web Worker sérialise et valide le snapshot ;
- le résultat est stocké comme `Blob` avec sa taille et sa version ;
- une seule écriture est active ; une modification survenue entre-temps prépare
  la révision suivante ;
- l'écran d'accueil lit `projects`, jamais tous les `projectRevisions` ;
- deux générations sont conservées, donc le budget de stockage doit prévoir au
  moins deux fois la taille du projet, plus le shell et les métadonnées.

Plusieurs mégaoctets ne justifient pas à eux seuls OPFS ou une base note par
note. Le temps de snapshot, sérialisation, transfert Worker et commit IndexedDB
doit d'abord être mesuré sur tablette réelle.

Le format v1 accepte actuellement jusqu'à 32 Mio. Deux générations d'un projet
à cette limite représentent déjà environ 64 Mio avant les copies temporaires et
le shell. Le repository doit donc consulter quota et usage avant la publication,
et éviter de maintenir simultanément plusieurs chaînes JSON complètes sur le
thread principal.

Points de vigilance :

- les données appartiennent à l'origine Web, pas à un fichier visible ;
- le quota et les politiques d'effacement dépendent de l'environnement ;
- la persistance renforcée peut être demandée via l'API Storage, sans remplacer
  l'export utilisateur ;
- deux onglets doivent vérifier `expectedRevision` avant d'écrire ;
- les migrations IndexedDB ne remplacent pas les migrations du format projet.

Le [Storage Standard](https://storage.spec.whatwg.org/) définit les quotas,
l'estimation d'usage et la demande de stockage persistant du navigateur.

## Écran d'accueil et session unique

Au démarrage, Pianola ouvre IndexedDB, applique ses migrations puis affiche les
résumés du store `projects`. Aucun payload musical complet n'est chargé à ce
stade.

```text
démarrage PWA
  → ouvrir/migrer IndexedDB
  → lire ProjectSummary[]
  → écran d'accueil
      ├── nouveau projet
      ├── importer .pianola
      ├── ouvrir un projet
      ├── exporter/dupliquer/supprimer
      └── afficher une récupération ou erreur de stockage
```

Ouvrir un projet charge sa dernière génération valide et crée un unique
`EditorRuntime`. Revenir à l'accueil demande au repository de publier la dernière
révision, libère le runtime, puis rafraîchit le résumé. Les autres projets ne
restent ni désérialisés ni montés dans React.

L'interface ne propose pas plusieurs projets simultanés ou des onglets internes.
Une protection de révision reste nécessaire parce qu'un utilisateur peut ouvrir
le même origin dans deux fenêtres du navigateur indépendamment de l'interface de
Pianola.

## OPFS

L'Origin Private File System fournit au site un système de fichiers privé et
invisible à l'utilisateur. Il devient intéressant si Pianola doit gérer :

- des enregistrements audio ou banques d'échantillons volumineuses ;
- de nombreux accès binaires partiels ;
- une base SQLite compilée en WebAssembly ;
- des payloads pour lesquels réécrire un objet IndexedDB complet est mesuré
  comme un problème réel.

Pour les projets JSON actuels, OPFS ajouterait une couche de catalogue,
d'atomicité et de migration sans bénéfice démontré. Il ne doit pas être adopté
par anticipation. Référence :
[Origin Private File System](https://fs.spec.whatwg.org/#origin-private-file-system).

## Fichiers choisis dans le navigateur

Lorsqu'une capacité de lecture/écriture directe de fichiers est disponible, un
adaptateur peut conserver un handle autorisé et proposer `Save` vers le fichier
choisi. Cette capacité reste une amélioration ergonomique :

- elle doit être détectée à l'exécution ;
- un navigateur peut redemander une autorisation ;
- l'import par `<input type="file">` et l'export par téléchargement restent les
  fallbacks communs ;
- la bibliothèque et l'autosave ne doivent pas dépendre d'un handle externe.

Ainsi, perdre une permission de fichier ne fait jamais perdre la copie locale.

## Solutions natives Android écartées

Fichiers privés, DataStore, Room et accès direct au Storage Access Framework
seraient pertinents pour une application Android native ou hybride. Pianola doit
rester une PWA : les introduire créerait une seconde source de vérité, deux
pipelines de migration et un comportement différent entre installation Chrome,
navigateur de bureau et version store.

Une future distribution Google Play doit donc ouvrir le même origin PWA, par
exemple avec une Trusted Web Activity. Cette enveloppe ne possède pas les
projets ; elle présente l'application Web, qui continue d'utiliser IndexedDB et
les APIs de fichiers du navigateur. Voir
[Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity).

## Cloud

Le cloud répond à un autre problème : retrouver ses projets sur plusieurs
appareils. Il exige au minimum :

- identité et authentification ;
- chiffrement en transit et contrôle d'accès ;
- modèle de révisions distantes ;
- résolution de conflits hors ligne ;
- suppression de compte et export des données ;
- supervision, coûts et politique de confidentialité.

Un stockage cloud ne doit pas être ajouté comme une variante transparente de
`save()`. Il s'agit d'une synchronisation entre repository local et service
distant. Le repository local reste nécessaire pour fonctionner hors connexion.

## Stratégies combinées possibles

### Option A — fichiers seulement

```text
mémoire → export manuel .pianola
```

Très simple, mais perte possible entre deux exports. C'est le comportement
actuel et non la cible.

### Option B — PWA locale avec IndexedDB

```text
navigateur ou PWA installée → IndexedDB → import/export .pianola
```

Architecture retenue. Elle garde le même origin, le même stockage et les mêmes
migrations sur bureau et Android. Elle exige une campagne de tests sur quota,
éviction, cycle de vie mobile et projets volumineux.

### Option C — PWA distribuée sur Google Play

```text
enveloppe TWA → origin HTTPS de Pianola → IndexedDB
```

La distribution change, pas l'architecture de données. Digital Asset Links lie
l'enveloppe au site. La stabilité de l'origin devient une contrainte produit.

### Option D — local-first avec synchronisation cloud

```text
repository local → journal de révisions → synchronisation distante
```

À envisager uniquement lorsqu'un compte et le multi-appareils deviennent une
fonction produit. Ne pas bloquer la première persistance locale sur cette étape.

## Arbre de décision

```text
La donnée doit-elle être accessible après désinstallation ou partageable ?
├── oui → fichier utilisateur ou cloud
└── non
    ├── ressource du shell PWA ? → Cache Storage
    ├── préférence, projet ou catalogue ? → IndexedDB
    └── gros média binaire mesuré ? → OPFS
```

## Signaux justifiant une révision du choix

Réévaluer IndexedDB ou le modèle par payload complet si :

- la taille médiane ou le temps de sérialisation dégrade l'autosave ;
- des médias binaires deviennent majoritaires ;
- le catalogue exige des requêtes que les résumés ne peuvent servir ;
- IndexedDB ne satisfait pas les mesures de latence ou mémoire sur les appareils
  ciblés ;
- la synchronisation multi-appareils devient une exigence produit.

Une technologie ne doit pas être introduite seulement parce qu'elle pourrait
devenir utile. Le changement doit répondre à une mesure, une limite reproduite
ou une exigence explicitement acceptée.

## Checklist d'évaluation

Pour proposer un nouvel adaptateur ou remplacer un stockage :

1. nommer le problème que le stockage actuel ne résout pas ;
2. fournir une mesure ou un scénario reproductible ;
3. conserver les ports et codecs indépendants de la plateforme ;
4. documenter durée de vie, quota, éviction, désinstallation et backup ;
5. tester atomicité, corruption, interruption et concurrence ;
6. prévoir la migration aller et, si possible, le repli ;
7. vérifier que l'import/export reste possible sans compte ;
8. mettre à jour ce guide et la
   [stratégie de persistance](persistence-strategy.md).
