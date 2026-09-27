# API backend v2

Cette API remplace l'ancienne version. Réponses JSON ; erreurs sous la forme
`{ "error": "message" }`, avec `details` pour les erreurs de validation.
Codes : 400 entrée invalide, 401 session absente/expirée, 403 droits insuffisants,
404 ressource absente, 409 conflit d'état, 429 limite de connexion atteinte.

## Authentification

`GET /api/v2/setup/status` retourne `{ "required": true }` tant que root n'est
pas défini. Dans ce seul état, `POST /api/v2/setup` avec un objet
`{ "password": "…" }` crée root. L'opération est atomique et tout nouvel appel
retourne 409. L'interface utilise ce mécanisme lors de la première connexion.

`POST /api/v2/auth/login` reçoit `{ "username": "root", "password": "…" }` et
retourne `{ "token": "…", "expiresAt": "…" }`. Envoyer ensuite
`Authorization: Bearer <token>` sur chaque requête. Sessions de 72 heures,
invalidées au redémarrage. Aucun token dans les URL ou cookies. Dix tentatives de
connexion par minute et IP ; derrière Nginx, le backend voit l'IP du proxy.
Les mots de passe sont hachés avec scrypt.
Le propriétaire choisit librement le mot de passe : une chaîne vide est valide.

- `POST /api/v2/auth/logout` : invalider la session.
- `GET /api/v2/auth/me` : compte et droits courants.
- `PUT /api/v2/auth/password` : `{ "currentPassword": "…", "password": "…" }` ;
  invalide toutes les sessions du compte.
- `GET /health` : sonde publique minimale.
- `GET /api/v2/system` : mode réseau, unités et capacités.

## Droits

| Niveau | Nom | Capacités cumulées |
| --- | --- | --- |
| 0 | aucun | aucun accès au tunnel |
| 1 | read | configuration, état, mesures et contrôle des endpoints |
| 2 | execute | start, stop, restart |
| 3 | write | configuration, channels, clés et limites |
| 4 | manage | suppression, droits et création de tunnels |

Un gestionnaire possédant `manage` sur au moins un tunnel peut créer un tunnel
et reçoit `manage` dessus. Seul root crée et supprime les utilisateurs. Un nouveau compte n'a aucun droit. Root a tous les
droits, sans pouvoir être supprimé, désactivé ou déclassé. La désactivation et la
suppression globale des autres comptes sont réservées à root. Les droits sont
relus à chaque requête et à chaque émission SSE.

| Route | Corps / résultat | Droit |
| --- | --- | --- |
| `GET /api/v2/users` | comptes, nombre de tunnels visibles, sans hashes ni droits hors du périmètre géré | manage |
| `POST /api/v2/users` | `{ "username": "tech", "password": "…" }` | root |
| `PATCH /api/v2/users/:username` | `disabled` et/ou `password` | root |
| `DELETE /api/v2/users/:username` | supprimer un compte | root |
| `GET /api/v2/tunnels/:id/rights` | niveaux par compte, root immuable | manage |
| `PUT /api/v2/tunnels/:id/rights/:username` | `{ "level": 0 }` à `{ "level": 4 }` | manage |

## Tunnels

Le formulaire de création utilise `POST /api/v2/tunnels/onboard` (manage), avec
`id`, `ip`, `user`, `ssh_port` (22 par défaut), et exactement un des champs
`password` (vide accepté) ou `privateKey` (contenu d'une clé privée non chiffrée).
Le backend établit la connexion initiale, mémorise l'empreinte présentée par le
serveur (confiance à la première utilisation), puis contrôle cette empreinte pour
les connexions suivantes. Avec un mot de passe, il génère une paire Ed25519 et
ajoute la clé publique à `authorized_keys` : `~/.ssh/authorized_keys` normalement,
ou `/etc/dropbear/authorized_keys` pour root sur OpenWrt avec Dropbear.
Avec une clé, celle-ci doit déjà être
autorisée à distance. Une connexion par clé est vérifiée avant création.
Seul le chemin de la clé privée locale est enregistré dans `ssh_key` ; le mot de
passe temporaire ne figure ni dans les fichiers, ni dans l'audit, ni dans la réponse.
Le tunnel est créé arrêté et sans channels ; ceux-ci peuvent être ajoutés ensuite.
En cas d'échec, la réponse précise l'étape (`password`, `private-key`, `install` ou
`verification`) et fournit un message utilisable par l'interface sans exposer le
détail technique renvoyé par le serveur distant.
Si la vérification finale échoue après installation distante, la clé publique peut
rester dans `authorized_keys` et doit être retirée manuellement si nécessaire.

`POST /api/v2/tunnels` reçoit un identifiant et une configuration :

```json
{
  "id": "paris",
  "config": {
    "ip": "ssh.example.net",
    "ssh_port": 22,
    "user": "tunnel",
    "ssh_key": "",
    "hostFingerprint": "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "options": {
      "compression": "yes",
      "ServerAliveInterval": 10,
      "ServerAliveCountMax": 3
    },
    "bandwidth": { "up": 100, "down": 500 },
    "tunnels": {
      "-L": {
        "9101": {
          "name": "printer",
          "listen_host": "127.0.0.1",
          "listen_port": 9101,
          "endpoint_host": "printer.internal",
          "endpoint_port": 9100
        }
      },
      "-R": {},
      "-D": {}
    }
  }
}
```

L'empreinte ci-dessus est factice : utiliser une empreinte obtenue auprès de
l'administrateur distant par un canal de confiance. Elle est vérifiée à chaque
connexion. Aucun serveur inconnu n'est accepté automatiquement.

`ssh_key` est rempli après provisionnement/import. Les chemins arbitraires sont
refusés. Les identifiants font 1 à 48 caractères alphanumériques, tirets ou
underscores et commencent par une lettre ou un chiffre. Les propriétés inconnues,
notamment `channels` à la place de `tunnels`, sont rejetées. L'adresse d'écoute
par défaut est `127.0.0.1`. Une valeur `listen_host` vide demande une écoute sur
toutes les interfaces ; l'interface l'affiche sous la forme `*`.

| Route | Fonction | Droit |
| --- | --- | --- |
| `GET /api/v2/tunnels` | seulement les tunnels visibles | read |
| `GET /api/v2/tunnels/:id` | config, niveau, état et mesures | read |
| `POST /api/v2/tunnels` | créer ; réponse 201 | manage |
| `PUT /api/v2/tunnels/:id` | remplacer la configuration d'un tunnel arrêté | write |
| `DELETE /api/v2/tunnels/:id` | arrêter, supprimer config, clé locale et droits | manage |
| `POST /api/v2/tunnels/:id/start` | démarrer, enregistrer l'intention persistante | execute |
| `POST /api/v2/tunnels/:id/stop` | arrêter et désactiver la reconnexion | execute |
| `POST /api/v2/tunnels/:id/restart` | arrêter puis démarrer | execute |
| `POST /api/v2/tunnels/start` | démarrer les tunnels listés dans `{ "ids": [...] }` | execute |
| `POST /api/v2/tunnels/stop` | arrêter les tunnels listés dans `{ "ids": [...] }` | execute |
| `POST /api/v2/tunnels/restart` | redémarrer les tunnels listés dans `{ "ids": [...] }` | execute |
| `POST /api/v2/tunnels/:id/check` | vérifier les endpoints d'un tunnel actif | read |

Les modifications de connexion et de channels exigent un tunnel arrêté (409
sinon). Les limites de débit sont modifiables à chaud. Les états sont `stopped`,
`starting`, `running`, `stopping`, `reconnecting`, `error`. L'erreur est exposée
dans `error`. Reconnexion avec délai progressif de 2 à 60 secondes tant que l'état
souhaité est `running`. Un démarrage échoué reste en reconnexion jusqu'à un arrêt
explicite. Après redémarrage du backend, seuls les tunnels souhaités actifs sont
relancés.

## Channels et clés

`POST /api/v2/tunnels/:id/diagnostics` (read) est appelé à chaque dépliage,
au chargement de la page pour tous les tunnels autorisés, même repliés ou masqués
par le filtre, puis toutes les 30 secondes
pour tous les tunnels dépliés. Une demande encore en cours n'est pas doublée.
La première série part en parallèle sans bloquer l'affichage de la page ; ses
résultats sont conservés pour être visibles dès le dépliage d'un tunnel.
La réponse `channels`, indexée par type et port, contient directement les délais
`tcp` et `icmp` en millisecondes. Une valeur null indique un échec ou un test
inapplicable ; `tcpError` et `icmpError` en donnent la cause.
TCP vérifie le port final de l'équipement : pour `-L`, la connexion est ouverte
depuis le serveur SSH avec `forwardOut` vers `endpoint_host:endpoint_port` ; pour
`-R`, le backend ouvre directement son endpoint local. Le succès mesure
l'établissement TCP, sans attendre de protocole applicatif. Timeout absolu :
600 ms, résolution DNS incluse, hors attente dans la file des sondes.
ICMP lance un ping direct vers `endpoint_host`, hors tunnel, limité à 600 ms.
Un ping filtré ou indisponible donne null. SOCKS n'a pas de destination fixe :
TCP et ICMP valent donc null.
Les channels sont sondés en parallèle, avec des plafonds globaux de 64 TCP et
32 pings. Les demandes simultanées d'un même tunnel et les pings simultanés vers
un même hôte sont mutualisés. Un cycle peut dépasser 30 secondes sous forte charge ;
son prochain déclenchement est alors ignoré tant que le tunnel est en cours.
L'interface utilise une coche bleue pour TCP, verte pour ICMP, grise sinon ;
les deux délais sont disponibles au survol des coches.

Le formulaire d'ajout correspond aux extrémités locales/distantes : pour -L,
l'écoute est locale ; pour -R, elle est distante. L'écoute utilise initialement
`*`, enregistré comme une chaîne vide. Un double-clic l'active avec `0.0.0.0`
pour permettre une saisie explicite. Les sliders de débit couvrent
1 à 10 000 Ko/s sur une échelle logarithmique ; leur dernier cran « Illimité »
conserve la valeur 0 de l'API.

`POST /api/v2/tunnels/:id/channels` : `type` (`-L`, `-R` ou `-D`), `name`,
`listen_port`, `listen_host` optionnel et `endpoint_host`/`endpoint_port`
obligatoires pour `-L` et `-R`. Un channel est identifié par type et port.

`PATCH /api/v2/tunnels/:id/channels/:type/:port` avec `{ "name": "…" }`
renomme un channel sans interruption. `DELETE` sur la même URL supprime le
channel. L'ajout et la suppression nécessitent `write` et redémarrent
automatiquement le tunnel lorsqu'il était actif ; ils ne demandent plus un arrêt
préalable. Un échec de redémarrage laisse la nouvelle configuration enregistrée
et le tunnel suit sa stratégie normale de reconnexion.

`POST /api/v2/tunnels/:id/provision` avec `{ "password": "…" }` génère une clé
Ed25519 et ajoute la clé publique au `~/.ssh/authorized_keys` de l'utilisateur SSH
configuré (ou `/etc/dropbear/authorized_keys` pour root sur OpenWrt avec Dropbear).
Le mot de passe n'est pas conservé. Le compte distant doit exister et
disposer d'un shell POSIX. Cette connexion temporaire n'est pas soumise aux
limites réseau du tunnel.

`PUT /api/v2/tunnels/:id/key` avec `{ "privateKey": "…" }` importe une clé privée
SSH non chiffrée, déjà autorisée à distance. Les deux opérations exigent `write`
et un tunnel arrêté. Une clé locale existante n'est pas écrasée. Supprimer le
tunnel supprime sa clé locale, mais ne révoque pas automatiquement la clé publique
distante. Après un échec d'installation distante, inspecter `authorized_keys`
avant de répéter le provisionnement.

## Débits et événements

`PUT /api/v2/tunnels/:id/bandwidth` reçoit `{ "up": 100, "down": 500 }` (`write`).
1 Ko = 1 000 octets ; 0 signifie illimité. La limite porte sur toute la connexion
SSH, donc tous ses channels. Linux utilise `tc` sur une paire veth réservée au
transport SSH après compression/chiffrement. Les compteurs incluent les en-têtes,
retransmissions et le trafic de contrôle de cette interface (dont ARP), pas
seulement les données utiles. Le débit Ethernet physique exact dépend aussi des
couches de l'interface de sortie.

Up est émis vers le serveur distant. Down est régulé à la réception locale, après
traversée du WAN. Les plafonds autorisent de courtes rafales inhérentes au token
bucket : une mesure d'une seconde peut dépasser momentanément la consigne.

`GET /api/v2/events` fournit un flux SSE authentifié : événement `tunnels` chaque
seconde. Utiliser `fetch` et son flux de lecture pour envoyer le header Bearer ;
EventSource natif ne permet pas ce header. Chaque événement remplace la vue
complète des tunnels visibles, avec droits relus à chaque émission. Cinq flux
maximum par utilisateur, cent au total.

Métriques : `upBytes`, `downBytes`, `upKoPerSecond`, `downKoPerSecond`,
`measuredAt`, `source`, `networkOverheadIncluded`.
Les compteurs repartent à zéro lorsqu'une nouvelle connexion est établie.

`GET /api/v2/system/orphans` et `DELETE /api/v2/system/orphans/:id` permettent à
root d'inspecter/nettoyer les ressources OSTM sans tunnel souhaité actif. Les
processus SSH extérieurs à OSTM ne sont pas manipulés.

Les actions sont journalisées dans `data/audit.jsonl`, sans mots de passe, clés
privées ou tokens. Prévoir une rotation en production.
