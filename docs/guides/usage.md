# Utiliser Pianola

## Projet et historique

Le titre du projet se modifie dans l’en-tête. Undo et Redo portent uniquement
sur les transactions musicales ; changer de clip, ouvrir un panneau ou déplacer
le viewport ne consomme pas l’historique.

## Notes et sélection

- appui long dans la grille : dessiner une note ;
- glisser une note ou une sélection : déplacer ;
- glisser une extrémité : redimensionner ;
- glisser le vide : lasso ;
- double-clic ou double-tap direct : supprimer ;
- modes Replace/Add/Subtract : contrôler l’effet du prochain geste ;
- Copy/Cut/Paste : utiliser le presse-papier transitoire ;
- Slice : couper les notes sélectionnées au playhead ou aux deux ancres de la
  boucle, via la modale de choix.

Une opération qui crée des chevauchements ouvre un choix : Merge crée des notes
continues, Slice conserve les notes éditées et coupe les notes existantes aux
ancres. Le déplacement et le redimensionnement obéissent au système de
magnétisme actif. Lorsqu'une sélection franchit un marqueur de gamme, chaque
note est ajustée avec la gamme active à sa nouvelle position.

## Instruments

L’inspecteur projet ajoute, édite, réordonne et supprime les instruments
globaux. Gain, mute, solo et verrouillage s’appliquent selon leur propriétaire.
Les notes des instruments non réglés sur « solo » apparaissent grisées pour faciliter la lecture.
Une note appartient toujours à un instrument ; une sélection peut être
transférée vers un instrument déverrouillé.

Quand un instrument est édité pendant la lecture, les changements de synthèse
sont prévisualisés sans interrompre le transport. Les paramètres continus sont
lissés sur une note tenue ; les paramètres structurels s’appliquent dès la note
suivante. Cancel restaure les réglages précédents sans toucher à l’historique ;
Save changes crée une seule étape Undo/Redo avec le résultat final.

## Clips

Chaque clip possède ses notes, sa timeline, sa boucle et ses verrouillages par
instrument. Ajouter, dupliquer, renommer, réordonner ou supprimer un clip passe
par l’inspecteur. Changer de clip vide la sélection de notes sans arrêter la
lecture. Le bouton au cercle barré bypass le clip dans toute séquence démarrée
en amont. Le clip reste éditable et son bouton Play le lance immédiatement,
même lorsqu’il est bypassé ; il peut alors déclencher les clips suivants. Cliquer dans
la grille déplace l’unique playhead dans le clip affiché et repositionne aussi
la lecture en cours.

L’inspecteur permet de créer des groupes de clips imbriqués. Les boutons
Ajouter un clip et Ajouter un groupe ouvrent une fenêtre où choisir le nom et
le groupe parent ; un groupe possède également sa propre couleur. Le bouton de
réglages permet de modifier le nom et la couleur. Chaque groupe peut être
dupliqué avec tout son sous-arbre et ses clips. Son bouton de bypass rouge
ignore tous ses descendants dans une séquence sans modifier leur propre état ;
tant qu’il est actif, les boutons de bypass descendants sont désactivés.
L’action « Concatenate clips »
remplace le groupe à sa position actuelle par un clip portant le nom saisi dans
la modale et la couleur du groupe. Ses descendants non bypassés sont concaténés
dans leur ordre de lecture, y compris à travers les sous-groupes ; les clips
bypassés sont exclus du résultat. Supprimer un groupe ouvre une
confirmation permettant soit de conserver ses clips en les remontant dans le
parent, soit de supprimer tous ses clips et sous-groupes. Le bouton Play d’un
groupe lance son premier clip descendant jouable et reste actif pendant l’enchaînement
de tous ses descendants. La poignée déplace les clips
et groupes à la souris ou au toucher : une ligne haute ou basse indique une
insertion avant ou après, tandis que la carte surlignée indique une insertion
dans le groupe. Au clavier, Haut/Bas change la position, Droite entre dans le
groupe précédent et Gauche sort du groupe courant. Les groupes organisent le
document sans interrompre l’enchaînement : la lecture suit les clips dans
l’ordre visible, en profondeur. Lorsqu’un clip est lancé directement dans un
groupe bypassé, la suite reprend après ce groupe, au premier clip jouable de la
même racine hiérarchique.

La séparation entre l’éditeur et l’inspecteur peut être déplacée à la souris ou
au toucher. Elle redimensionne la largeur de l’inspecteur en paysage et sa
hauteur en portrait. Les flèches du clavier la déplacent lorsqu’elle est
sélectionnée ; Maj accélère le déplacement et un double-clic restaure la taille
par défaut. En portrait, l’inspecteur peut être étendu jusqu’à masquer
complètement le panneau d’édition.

## Transport, timeline et viewport

Lecture/Pause démarre ou suspend le transport du processeur audio. Stop libère
les voix actives avec une transition courte.
Le bouton de retour replace le playhead et le scroll horizontal au début.
L’enchaînement suit l’ordre des cartes en sautant les clips bypassés et tous les
clips ayant un groupe parent bypassé, sauf si la boucle ou le bouton global
« Stop playback at the end of every clip » est actif. L’auto-scroll est désactivé
pour toute la séquence : sa valeur ne change pas lors de la sélection d’un
autre clip. L’auto-scroll est désactivé par défaut ; lorsqu’il est actif, il sélectionne le clip joué et suit le
playhead. Lorsqu’il est désactivé, ni la sélection du clip ni le viewport ne
sont modifiés par la lecture : le playhead peut rester dans un autre clip ou
sortir de la zone visible.
Zooms, scrolls et snap tonal restent des états d’espace de travail, sans
Undo/Redo.
La timeline permet d'ajouter un nombre spécifique de mesures avant ou après la mesure courante, et d'éditer les marqueurs (tempo, métrique, gamme).

Changer une métrique ne déplace ni les notes ni les marqueurs de tempo ou de
gamme. Si un marqueur métrique ultérieur ne tombe plus sur une barre de mesure,
il avance automatiquement jusqu'à la prochaine barre valide. L'ajout ou la
suppression d'une mesure décale en revanche le contenu suivant, puisqu'il
ajoute ou retire réellement du temps.

## Sauvegarde et échange

L'accueil liste les projets conservés dans ce navigateur. L'édition active est
sauvegardée automatiquement ; l'en-tête indique `Saved locally`, une écriture
en cours, des changements non publiés ou un échec. Revenir à la bibliothèque
force la dernière écriture et refuse de fermer la session si elle échoue.

Export project télécharge une copie `.pianola` portable. Import `.pianola`
depuis la bibliothèque crée toujours une entrée distincte et ne remplace pas les
préférences locales. Import MIDI analyse le fichier avant de remplacer le
document du projet actif ; Export MIDI projette uniquement les données
musicales.
