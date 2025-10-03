
aide moi a implementer le backend OSTM2, en nodeJS
**OSTM2** (Open SSH Tunnels Manager 2) se veut etre un outil puissant pour gérer des tunnels SSH, qu’il s’agisse de transferts de ports locaux (`-L`), distants (`-R`) ou dynamiques (`-D`).

---

## **API backEnd NodeJS**
- **Configuration flexible** : lecture ecriture des Configs des tunnels dans des fichiers JSON, emplacement `ostm2/config/sites/` (1 fichier json par tunnel ssh).
- **Transferts de ports** : Support des options de port forwarding `-L`, `-R` et `-D`
- **deployer un tunnels** : monte une connexion ssh, cette api aura besoin d'un user ssh et du mdp ou de la clef ssh (le mdp ne sera pas conserve, une clef ssh sera genere et utilisee a la place)
- **Gestion des tunnels** : les api pour Ajouter, Supprimer, Démarrer, Arrêter ou Redémarrer un tunnels SSH.
- **Gestion des channels** : les api pour ajouter, supprimer des channels (un seul portforward).
- **Contrôle de la bande passante** : limiter la bande passante par process ssh + api de modification de ces debit
- **Persistance des tunnels** : redemare les tunnels pour maintenir les connexions
- **Supervision en temps réel** : Vérifier l’état des tunnels (actifs, inactifs, orphelins) et suivie des debit Up/Down en temp reel.
- **autentification** : pour toute les api PUT POST DELETE, credential dans un JSON {"admin": [bcrypt.hash]}

---

## **requierement**
TypeScript + fastify + ssh2 + pm2 + socket.io + trickle + lowdb

## **Configuration**
Les tunnels sont configurés via des fichiers JSON dans le dossier `ostm2/config/sites/`. Chaque fichier est nommé `id.json` (par exemple, `paris.json`) et contient les détails du tunnel. Voici un exemple de configuration :

```json
{
    "ip": "remote_ssh_serveur",
    "ssh_port": 22,
    "user": "remote_ssh_user",
    "ssh_key": "ostm2/configs/sites/Paris_key",
    "options": {
        "compression": "yes",
        "ServerAliveInterval": 10,
        "ServerAliveCountMax": 3
    },
    "bandwidth": {
        "up": 100,
        "down": 500
    },
    "channels": {
        "-L": {
            "9101": {
                "name": "printer1",
                "listen_port": 9101,
                "endpoint_host": "HP",
                "endpoint_port": 9100
            },
            "9102": {
                "name": "printer2",
                "listen_port": 9102,
                "endpoint_host": "xerox",
                "endpoint_port": 9100
            }
        },
        "-R": {
            "1901": {
                "name": "scan1",
                "listen_port": 1901,
                "listen_host": "scan",
                "endpoint_host": "127.0.0.1",
                "endpoint_port": 1900
            },
            "5003": {
                "name": "cam1",
                "listen_port": 5003,
                "listen_host": "cam",
                "endpoint_host": "127.0.0.1",
                "endpoint_port": 5000
            }
        },
        "-D": {
            "4443": {
                "name": "remote_lan1",
                "listen_port": 4443
            }
        }
    }
}
```

dans un premier temps quels outils serai pertinant d'utiliser ?