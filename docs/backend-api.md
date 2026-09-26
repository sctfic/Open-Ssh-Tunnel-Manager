# API backend v2

Cette API remplace l'ancienne version. Réponses JSON ; erreurs sous la forme
`{ "error": "message" }`, avec `details` pour les erreurs de validation.
Codes : 400 entrée invalide, 401 session absente/expirée, 403 droits insuffisants,
404 ressource absente, 409 conflit d'état, 429 limite de connexion atteinte.

## Authentification

`POST /api/v2/auth/login` reçoit `{ "username": "root", "password": "…" }` et
retourne `{ "token": "…", "expiresAt": "…" }`. Envoyer ensuite
`Authorization: Bearer <token>` sur chaque requête. Sessions de huit heures,
invalidées au redémarrage. Aucun token dans les URL ou cookies. Dix tentatives de
connexion par minute et IP ; derrière Nginx, le backend voit l'IP du proxy.
Les mots de passe sont hachés avec scrypt.

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
| 4 | manage | suppression, droits, création de tunnels/utilisateurs |

Un gestionnaire possédant `manage` sur au moins un tunnel peut créer un tunnel
et reçoit `manage` dessus. Un nouveau compte n'a aucun droit. Root a tous les
droits, sans pouvoir être supprimé, désactivé ou déclassé. La désactivation et la
suppression globale des autres comptes sont réservées à root. Les droits sont
relus à chaque requête et à chaque émission SSE.

| Route | Corps / résultat | Droit |
| --- | --- | --- |
| `GET /api/v2/users` | comptes, sans hashes ni droits hors du périmètre géré | manage |
| `POST /api/v2/users` | `{ "username": "tech", "password": "…" }` | manage |
| `PATCH /api/v2/users/:username` | `disabled` et/ou `password` | root |
| `DELETE /api/v2/users/:username` | supprimer un compte | root |
| `GET /api/v2/tunnels/:id/rights` | niveaux par compte, root immuable | manage |
| `PUT /api/v2/tunnels/:id/rights/:username` | `{ "level": 0 }` à `{ "level": 4 }` | manage |

## Tunnels

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
par défaut est `127.0.0.1`.

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
| `POST /api/v2/actions/start` | démarrer les tunnels autorisés | execute |
| `POST /api/v2/actions/stop` | arrêter les tunnels autorisés | execute |
| `POST /api/v2/actions/restart` | redémarrer les tunnels autorisés | execute |
| `POST /api/v2/tunnels/:id/check` | vérifier les endpoints d'un tunnel actif | read |

Les modifications de connexion et de channels exigent un tunnel arrêté (409
sinon). Les limites de débit sont modifiables à chaud. Les états sont `stopped`,
`starting`, `running`, `stopping`, `reconnecting`, `error`. L'erreur est exposée
dans `error`. Reconnexion avec délai progressif de 2 à 60 secondes tant que l'état
souhaité est `running`. Un démarrage échoué reste en reconnexion jusqu'à un arrêt
explicite. Après redémarrage du backend, seuls les tunnels souhaités actifs sont
relancés.

## Channels et clés

`POST /api/v2/tunnels/:id/channels` : `type` (`-L`, `-R` ou `-D`), `name`,
`listen_port`, `listen_host` optionnel et `endpoint_host`/`endpoint_port`
obligatoires pour `-L` et `-R`. Un channel est identifié par type et port.

`DELETE /api/v2/tunnels/:id/channels/:type/:port` supprime un channel.
Ces opérations nécessitent `write` et un tunnel arrêté.

`POST /api/v2/tunnels/:id/provision` avec `{ "password": "…" }` génère une clé
Ed25519 et ajoute la clé publique au `~/.ssh/authorized_keys` de l'utilisateur SSH
configuré. Le mot de passe n'est pas conservé. Le compte distant doit exister et
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
