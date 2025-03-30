# **OSTM : Open SSH Tunnels Manager**

**OSTM** est une API Node.js conçue pour gérer des tunnels SSH dynamiques à l’aide d’**autossh** et **trickle**. Elle offre un contrôle complet des tunnels via des fichiers de configuration JSON et une interface web intuitive pour simplifier leur gestion.

## **Table des matières**
1. [Introduction](#introduction)
2. [Fonctionnalités](#fonctionnalités)
3. [Technologies](#technologies)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Utilisation de l'API](#utilisation-de-lapi)
7. [Interface Web](#interface-web)
8. [Sécurité](#sécurité)
9. [Exemples de commandes](#exemples-de-commandes)
10. [Contribution](#contribution)
11. [Licence](#licence)

---

## **Introduction**
**OSTM** (Open SSH Tunnels Manager) permet de créer, gérer et superviser des tunnels SSH avec facilité. Que ce soit pour des transferts de ports locaux (`-L`), distants (`-R`) ou dynamiques (`-D`), l’outil offre une solution robuste avec une interface web pour une gestion sans effort.

---

## **Fonctionnalités**
- **Gestion des tunnels** : Démarrage, arrêt et redémarrage des tunnels SSH
- **Supervision** : Vérification de l’état et des connexions SSH
- **Configuration flexible** : Ajout et suppression de tunnels via JSON
- **Transferts de ports** : Support des options `-L`, `-R` et `-D`
- **Contrôle de la bande passante** : Limitation avec **trickle**
- **Interface web** : Gestion simplifiée sans ligne de commande
- **Sécurité** : Gestion des clés SSH et validation des entrées

---

## **Technologies**
- **Backend** : Node.js + Express
- **Gestion des processus** : `child_process` ou `pm2`
- **Tunnels SSH** : `autossh`
- **Contrôle de la bande passante** : `trickle`
- **Stockage** : Fichiers JSON (un par tunnel, dans `/config/sites/`)
- **Interface web** : [À définir, ex. React, Vue.js, ou autre framework frontend]

---

## **Installation**
Suivez ces étapes pour installer et lancer **OSTM** :

1. **Clonez le dépôt** :
   ```bash
   git clone https://github.com/votre-utilisateur/ostm.git
   cd ostm
   ```

2. **Installez les dépendances** :
   ```bash
   npm install
   ```

3. **Configurez les variables d’environnement** (optionnel) :
   Créez un fichier `.env` si nécessaire (ex. port de l’API, chemin des clés).

4. **Démarrez l’application** :
   ```bash
   npm start
   ```

---

## **Configuration**
Les tunnels sont définis dans des fichiers JSON situés dans le dossier `/config/sites/`. Chaque fichier, nommé `id.json`, contient les informations du tunnel. Exemple :

```json
{
    "user": "tunnel_user",
    "ip": "142.16.102.35",
    "ssh_port": 22,
    "ssh_key": "/path/to/key",
    "options": {"keepalive_interval": 10},
    "bandwidth": {"up": 1000, "down": 5000},
    "tunnels": {
        "-L": {
            "9101": {"name": "printer1", "listen_port": 9101, "endpoint_host": "HP", "endpoint_port": 9100},
            "9102": {"name": "printer2", "listen_port": 9102, "endpoint_host": "xerox", "endpoint_port": 9100}
        },
        "-R": {
            "5003": {"name": "cam1", "listen_port": 5003, "listen_host": "cam", "endpoint_host": "127.0.0.1", "endpoint_port": 5000},
            "1901": {"name": "scan1", "listen_port": 1901, "listen_host": "scan", "endpoint_host": "127.0.0.1", "endpoint_port": 1900}
        },
        "-D": {
            "4443": {"name": "remote_lan1", "listen_port": 4443}
        }
    }
}
```

---

## **Utilisation de l'API**
L’API fournit des endpoints pour gérer les tunnels. Voici la liste complète :

| Endpoint                 | Méthode | Description                                   |
|--------------------------|---------|-----------------------------------------------|
| `/tunnels/start`         | `POST`  | Démarre tous les tunnels                     |
| `/tunnels/start/:id`     | `POST`  | Démarre un tunnel spécifique                 |
| `/tunnels/stop`          | `POST`  | Arrête tous les tunnels                      |
| `/tunnels/stop/:id`      | `POST`  | Arrête un tunnel spécifique                  |
| `/tunnels/restart`       | `POST`  | Redémarre tous les tunnels                   |
| `/tunnels/restart/:id`   | `POST`  | Redémarre un tunnel spécifique               |
| `/tunnels/status`        | `GET`   | Renvoie l’état de tous les tunnels           |
| `/tunnels/status/:id`    | `GET`   | Renvoie l’état d’un tunnel spécifique        |
| `/tunnels/check`         | `POST`  | Teste la connexion de tous les serveurs SSH  |
| `/tunnels/check/:id`     | `POST`  | Vérifie la connexion d’un tunnel spécifique  |
| `/tunnels/pairing`       | `POST`  | Crée une config et génère une clé SSH        |
| `/tunnels/unpairing/:id` | `DELETE`| Supprime un tunnel et sa clé SSH distante    |
| `/tunnels/add/:id`       | `POST`  | Ajoute un port forward (`-L`, `-R`, `-D`)    |
| `/tunnels/remove/:id`    | `DELETE`| Supprime un port forward                     |
| `/tunnels/bandwidth/:id` | `POST`  | Modifie la bande passante d’un tunnel        |

---

## **Interface Web**
L’interface web offre une alternative conviviale à l’API. Accessible à `http://localhost:3000` (ou le port configuré), elle inclut :
- Liste des tunnels avec leur état (actif, arrêté, en erreur)
- Boutons pour démarrer, arrêter ou redémarrer chaque tunnel
- Formulaire pour ajouter/supprimer des tunnels ou ports
- Vérification de la connexion SSH
- Gestion des paramètres de bande passante

---

## **Sécurité**
- **Validation des entrées** : Les fichiers JSON et paramètres API sont vérifiés pour éviter les injections de commandes.
- **Gestion des clés SSH** : Utilisation de `ssh-keygen` pour la génération et `ssh-copy-id` pour la distribution sécurisée.
- **Contrôle d’accès** : Prévoir une authentification pour l’API et l’interface web (à implémenter).

---

## **Exemples de commandes générées**

### **Tunnel mixte (`-L` et `-R`)** :
```bash
trickle -u 1000 -d 5000 autossh -M 0 -N -o ServerAliveInterval=10 \
  -i /path/to/key -L 9101:HP:9100 -L 9102:xerox:9100 -R 5003:127.0.0.1:5000 tunnel_user@142.16.102.35 -p 22
```

### **Reverse tunnel (`-R`)** :
```bash
trickle -u 1000 -d 5000 autossh -M 0 -N -o ServerAliveInterval=10 \
  -i /path/to/key -R 5003:127.0.0.1:5000 -R 1901:127.0.0.1:1900 tunnel_user@142.16.102.35 -p 22
```

---

## **Contribution**
Vous souhaitez contribuer ? Voici comment procéder :
1. Forkez le projet.
2. Créez une branche pour votre fonctionnalité :
   ```bash
   git checkout -b feature/nouvelle-fonction
   ```
3. Committez vos modifications :
   ```bash
   git commit -am 'Ajout de nouvelle fonctionnalité'
   ```
4. Poussez votre branche :
   ```bash
   git push origin feature/nouvelle-fonction
   ```
5. Ouvrez une Pull Request sur GitHub.

---

## **Licence**
Ce projet est distribué sous la licence [MIT](LICENSE). Vous êtes libre de l’utiliser, le modifier et le redistribuer selon ses termes.

---

Ce `README.md` est prêt à être intégré à votre projet **OSTM**. Il est conçu pour être à la fois accessible aux débutants et suffisamment détaillé pour les utilisateurs avancés. Si vous souhaitez des ajustements ou des sections supplémentaires, faites-le-moi savoir !