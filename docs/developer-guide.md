# Guide développeur

Ce guide donne le chemin le plus court pour comprendre le backend et commencer à
contribuer. Les commentaires du code expliquent les invariants locaux ; ce document
montre comment les modules travaillent ensemble.

## Parcours conseillé

1. Lire `src/schema.js` pour connaître la forme exacte des entrées.
2. Lire `src/app.js` pour voir les routes, l'authentification et les niveaux requis.
3. Lire `src/manager.js` pour comprendre les états et la reconnexion.
4. Lire `src/ssh.js` pour les channels `-L`, `-R` et `-D`.
5. Lire `src/network/transport.js`, puis `src/network/helper.js`, pour la mesure et
   la limitation après chiffrement SSH.
6. Lire les tests portant le nom de la fonctionnalité avant de la modifier.

## Vue d'ensemble

```text
Client HTTP/SSE
      |
  Fastify (app.js) ---- Auth (auth.js)
      |                      |
      +---- Store (JSON atomiques dans data/)
      |
  Manager (état souhaité et reconnexion)
      |
  SshSession (listeners et channels)
      |
  LinuxTransport ---- sudo ---- helper root
      |                            |
      |                         netns/veth/tc
      +---- flux SSH chiffré -------+
```

Le frontend ne parle jamais directement au Manager ou au helper. Toute opération
passe par l'API, qui relit la session et les droits. Les modifications passent
ensuite par la file `Store.exclusive` pour éviter deux lectures-modifications-
écritures concurrentes.

## Droits

Un niveau numérique par tunnel simplifie le contrôle : `read=1`, `execute=2`,
`write=3`, `manage=4`. Tester `niveau >= minimum` applique automatiquement
l'héritage. Root retourne toujours 4. Une nouvelle route doit utiliser `access`
avec le minimum correct et une mutation doit être enveloppée dans `mutate`.

## Cycle d'un tunnel

`start` enregistre d'abord l'état souhaité `running`, crée le transport, puis la
session SSH. Une panne ferme les ressources et programme une reconnexion avec
backoff. `stop` retire d'abord l'état souhaité afin que les événements `close` ne
déclenchent pas de reconnexion. Les changements de connexion et de channels sont
autorisés uniquement à l'arrêt ; les qdisc de débit sont modifiables à chaud.

## Direction des débits

Dans le namespace, `transport0` émet vers le serveur : son egress est le Up. Sur
l'hôte, le veth émet vers le namespace : son egress est le Down. Les compteurs vus
sur le veth hôte ont donc RX=Up et TX=Down. Les octets sont déjà compressés et
chiffrés par SSH et incluent la surcharge réseau de l'interface virtuelle.

## Ajouter une fonctionnalité

- Ajouter ou modifier le schéma strict dans `schema.js`.
- Ajouter la logique au module propriétaire, puis une route fine dans `app.js`.
- Ne jamais construire une commande shell avec une donnée utilisateur.
- Ne jamais retourner hashes, tokens, mots de passe ou clés privées.
- Ajouter un test de comportement, pas une copie de l'implémentation.
- Exécuter `npm test` et `git diff --check`.
- Pour `tc`/netns, exécuter aussi le test Linux privilégié sur une machine dédiée.

## Tests

- `api.test.js` : contrat HTTP, sessions, ACL et SSE.
- `manager.test.js` : états, persistance et reconnexion.
- `ssh.test.js` : vrai protocole SSH local et les trois types de channel.
- `network-linux.test.js` : netns/veth/tc réels, activé explicitement sous root.
- `deploy/smoke-rpi3.mjs` : test complet HTTPS → API → OpenSSH → limitation.

Les fixtures créent leurs propres ports et répertoires temporaires. Toujours placer
leur nettoyage dans `t.after` ou `finally`, sinon un échec peut gêner le test suivant.
