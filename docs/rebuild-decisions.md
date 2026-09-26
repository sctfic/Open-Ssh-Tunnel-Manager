# Décisions de réécriture

Ce document complète le cahier des charges historique. Il définit les règles
validées pour la nouvelle application ; les routes et comportements de l'ancienne
version ne sont pas à conserver.

## Portée

- Le projet repart d'une implémentation neuve, sans compatibilité avec les
  anciennes API ou réponses.
- Node.js, PM2 et Nginx sont conservés.
- Le serveur distant reste un serveur SSH standard, sans agent ni règle réseau
  supplémentaire installée à distance.
- Un fichier dans `configs/tunnels/<id>.json` représente un tunnel. Le champ
  `tunnels` contient ses channels, rangés sous `-L`, `-R` et `-D`.

## Autorisations

Les autorisations sont un niveau par utilisateur et par tunnel :

| Niveau | Droit | Autorisations cumulées |
| --- | --- | --- |
| 0 | aucun | aucune |
| 1 | `read` | consulter le tunnel, les channels, son état et les mesures |
| 2 | `execute` | `read` et démarrer, arrêter ou redémarrer le tunnel |
| 3 | `write` | `execute` et modifier le tunnel, les channels et ses limites |
| 4 | `manage` | `write`, supprimer le tunnel, attribuer les droits et créer des utilisateurs |

Le droit `manage` d'un tunnel permet de gérer les droits de ce tunnel seulement.
Un utilisateur qui possède `manage` sur au moins un tunnel peut créer un tunnel
et reçoit automatiquement `manage` sur celui qu'il crée. Le compte `root` possède
le niveau 4 partout : il ne peut être supprimé, désactivé, ni voir ses droits
réduits.

Toutes les commandes et toutes les API de modification requièrent une session
authentifiée et le niveau requis, y compris start, stop et restart.

## Bande passante

L'unité affichée et configurée est le Ko/s, avec 1 Ko = 1 000 octets.

Les mesures portent sur le flux réseau SSH après compression et chiffrement. Pour
obtenir des compteurs fiables par tunnel, chaque tunnel devra être exécuté dans
son propre espace réseau Linux et le trafic sera mesuré par le noyau sur son
interface virtuelle. `tc` appliquera les plafonds sortants au même endroit.

Avec un serveur SSH distant standard, le flux entrant peut être mesuré puis
ralenti localement, mais il a déjà traversé le réseau avant d'arriver. Un plafond
strict du trafic entrant avant traversée nécessiterait une règle sur le serveur
distant, ce qui est hors périmètre. L'interface devra présenter cette limite de
façon explicite pour le débit Down.

Les débits instantanés et les compteurs seront diffusés au frontend en temps réel.
