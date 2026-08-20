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
- Slice : couper les notes sélectionnées au playhead.

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
par l’inspecteur. Changer de clip arrête la lecture et vide la sélection de
notes.

## Transport, timeline et viewport

Lecture/Pause démarre ou suspend le transport du processeur audio. Stop libère
les voix actives avec une transition courte.
Le bouton de retour replace le playhead et le scroll horizontal au début.
Zooms, scrolls et snap tonal restent des états d’espace de travail, sans
Undo/Redo.
La timeline permet d'ajouter un nombre spécifique de mesures avant ou après la mesure courante, et d'éditer les marqueurs (tempo, métrique, gamme).

Changer une métrique ne déplace ni les notes ni les marqueurs de tempo ou de
gamme. Si un marqueur métrique ultérieur ne tombe plus sur une barre de mesure,
il avance automatiquement jusqu'à la prochaine barre valide. L'ajout ou la
suppression d'une mesure décale en revanche le contenu suivant, puisqu'il
ajoute ou retire réellement du temps.

## Sauvegarde et échange

Save télécharge un fichier `.pianola`. Open remplace le projet courant après
confirmation. Import MIDI analyse le fichier avant remplacement ; Export MIDI
projette le document musical sans état d’interface.
