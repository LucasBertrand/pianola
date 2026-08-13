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
ancres.

## Instruments

L’inspecteur projet ajoute, édite, réordonne et supprime les instruments
globaux. Gain, mute, solo et verrouillage s’appliquent selon leur propriétaire.
Une note appartient toujours à un instrument ; une sélection peut être
transférée vers un instrument déverrouillé.

## Clips

Chaque clip possède ses notes, sa timeline, sa boucle et ses verrouillages par
instrument. Ajouter, dupliquer, renommer, réordonner ou supprimer un clip passe
par l’inspecteur. Changer de clip arrête la lecture et vide la sélection de
notes.

## Transport et viewport

Lecture/Pause démarre ou suspend le scheduler. Stop annule les voix planifiées.
Le bouton de retour replace le playhead et le scroll horizontal au début.
Zooms, scrolls et snap tonal restent des états d’espace de travail, sans
Undo/Redo.

## Sauvegarde et échange

Save télécharge un fichier `.pianola`. Open remplace le projet courant après
confirmation. Import MIDI analyse le fichier avant remplacement ; Export MIDI
projette le document musical sans état d’interface.
