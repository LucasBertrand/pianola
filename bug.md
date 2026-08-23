Fix du bug de disparition de notes pendant la lecture (ignorer pour le moment)
Contexte
Bug subtil : pendant la lecture, cliquer sur une note pour la sélectionner la fait disparaître. Le long-press pour créer une note fait également disparaître la note au relâchement. Le bug persiste après la pause et ne se résout qu'à l'arrêt complet (stop/return to start).

Analyse approfondie :

PointerDown → le converter de la session est synchronisé, le geste commence
Entre pointerDown et pointerUp → le viewport change via followPlayhead() → showSelection() est appelé → le converter de la session est re-synchronisé au nouveau viewport
PointerUp → le geste se termine, mais le converter a changé
Le problème spécifique : quand showSelection() est appelé pendant un geste DRAGGING actif, il reconstruit la selection layer ET met à jour le converter. Cela ne devrait pas être problématique en soi.

Hypothèse la plus probable : Annulation du geste par re-render React
IMPORTANT

Après analyse exhaustive des dépendances des useEffect, toutes les callbacks et refs semblent stables pendant la lecture simple. Il ne devrait pas y avoir de re-run des effects pendant la lecture.

CEPENDANT, il est possible qu'un changement indirect (par exemple projectState via setProject()) cause un re-render de PianoRollWorkspace qui modifie une prop dérivée comme totalTicks. Si totalTicks change, les effects de usePianoRollEvents ET useInteractionManager sont re-run, ce qui annule le geste en cours.**

Hypothèse alternative : handleDirectNoteTap déclenché par erreur
Pour les appareils tactiles (touch/pen), quand on fait un tap sur une note en mode DRAGGING, le flow est :

handlePointerUp → mode DRAGGING, pointerWasTap = true
commitMove → return car deltaTicks === 0
endDrag() + showSelection()
handleDirectNoteTap() est appelé → vérifie si c'est un double-tap → si oui, SUPPRIME la note
Si le tapState contient un état résiduel de la lecture, un faux double-tap pourrait être détecté. Mais c'est peu probable avec la vérification de distance et de timing.

Plan d'investigation
WARNING

Ce bug est difficile à reproduire et son mécanisme exact n'est pas certain à partir de l'analyse statique seule. Je propose deux approches complémentaires :

Approche 1 : Ajout de logs de diagnostic temporaires
Ajouter des console.warn aux points critiques pour capturer le flux exact quand le bug se produit :

[MODIFY] 
piano-roll-gesture-strategy.ts
Ajouter un log dans cancelGesture indiquant le draft.mode au moment de l'annulation et la stack trace
Ajouter un log dans handlePointerDown quand draft.mode !== "IDLE"
Ajouter un log dans handlePointerUp quand completion === null
[MODIFY] 
usePianoRollEvents.ts
Ajouter un log dans le cleanup de l'effect principal (quand strategy.cancel() est appelé)
[MODIFY] 
useInteractionManager.ts
Ajouter un log dans le cleanup de l'effect
Approche 2 : Protection du geste actif contre les re-renders
Indépendamment de l'investigation, on peut ajouter une protection qui empêche showSelection() de reconstruire la selection layer pendant un geste actif (DRAGGING, RESIZING, DRAWING). Cela résoudrait potentiellement la race condition.

[MODIFY] 
piano-roll-selection-controller.ts
Dans showSelection(), vérifier si un geste est actif avant de reconstruire la selection layer
IMPORTANT

Mais cela ne résout pas le cas où l'effect est re-run (ce qui cancel le geste et recrée la strategy).

Open Questions
Le bug se produit-il avec une souris ou un écran tactile (ou les deux) ? La gestion diffère significativement entre les deux (double-tap tactile → suppression).

Est-ce que le "stop" qui résout le bug est stopPlayback() (touche stop) ou uniquement returnToStart() ? Cela pourrait indiquer si c'est la réinitialisation du playhead à 0 ou le changement de status qui résout le problème.

Avez-vous des instruments verrouillés (locked) dans le projet quand le bug se produit ? Un changement de lock state pendant la lecture pourrait causer le problème.

Le viewport scroll-t-il horizontalement pendant la lecture (suivi du playhead) quand le bug se manifeste, ou est-ce que le playhead est déjà au-delà de la vue ?

Proposition
Je recommande de commencer par l'Approche 1 (logs de diagnostic) pour confirmer le mécanisme exact du bug, puis d'implémenter le fix approprié. Souhaitez-vous que je procède ?

Verification Plan
Manual Verification
Lancer la lecture, puis tenter de sélectionner des notes pendant que le viewport suit le playhead
Tenter de créer des notes via long-press pendant la lecture
Vérifier les logs de la console pour identifier la séquence exacte d'événements