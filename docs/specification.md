Voici un cahier des charges détaillé pour ton **Manager de Tunnels SSH**.  

---

# **Cahier des charges : Manager de Tunnels SSH**  

## **1. Objectif du projet**  
Développer une **API Node.js** permettant de gérer des tunnels SSH à l’aide de **autossh** et **trickle**.  
L’API doit offrir un contrôle complet des tunnels via des fichiers de configuration JSON, incluant :  
- Démarrage, arrêt et redémarrage des tunnels  
- Vérification des connexions SSH  
- Ajout et suppression de tunnels  
- Gestion des transferts de ports (-L, -R, -D)  

---

## **2. Technologies**  
- **Backend** : Node.js + Express  
- **Gestion des processus** : `child_process` ou `pm2`  
- **Tunnels SSH** : `autossh`  
- **Gestion de la bande passante** : `trickle`  
- **Base de données** : Fichiers JSON (un par tunnel)  
- **Sécurité** : Gestion des clés SSH, validation des entrées  

---

## **3. Structure d’un tunnel (fichier JSON)**  
Un tunnel est défini dans un fichier JSON stocké dans un dossier `/config/sites/id.json` :  

fichier id.json
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

## **4. Fonctionnalités de l’API**  

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/tunnels/start` | `POST` | Démarre tous les tunnels |
| `/tunnels/start/:id` | `POST` | Démarre un tunnel spécifique |
| `/tunnels/stop` | `POST` | Arrête tous les tunnels |
| `/tunnels/stop/:id` | `POST` | Arrête un tunnel spécifique |
| `/tunnels/restart` | `POST` | Redémarre tous les tunnels |
| `/tunnels/restart/:id` | `POST` | Redémarre un tunnel spécifique |
| `/tunnels/status` | `GET` | Renvoie l’état de tous les tunnels |
| `/tunnels/status/:id` | `GET` | Renvoie l’état d’un tunnel spécifique |
| `/tunnels/check` | `POST` | Teste tous les serveurs SSH |
| `/tunnels/check/:id` | `POST` | Vérifie la connexion et la config d’un tunnel |
| `/tunnels/pairing` | `POST` | Crée un fichier de config et génère une clé SSH |
| `/tunnels/unpairing/:id` | `DELETE` | Supprime un tunnel et la clé SSH distante |
| `/tunnels/add/:id` | `POST` | Ajoute un port forward (-L, -R ou -D) |
| `/tunnels/remove/:id` | `DELETE` | Supprime un port forward |

---

## **5. Fonctionnement**  

### **5.1 Gestion des tunnels**  
1. **Démarrage d’un tunnel**  
   - Lecture du fichier JSON  
   - Construction de la commande `autossh` avec `trickle`  
   - Exécution du processus  
   - Stockage du pid du processus  

2. **Arrêt d’un tunnel**  
   - Recherche du processus en cours  
   - Terminaison propre via `kill` ou `pm2`  

3. **Statut des tunnels**  
   - Vérification des processus en cours
   - Retour d’un état JSON détaillé

---

## **6. Sécurité**  
- Vérification des fichiers JSON pour éviter l’injection de commande  
- Validation des paramètres envoyés à l’API  
- Gestion des clés SSH via `ssh-keygen` et `ssh-copy-id`  

---

## **7. Exemples de commandes générées**  

### **Démarrage d’un tunnel mixte**  
```bash
trickle -u 1000 -d 5000 autossh -M 0 -N -o ServerAliveInterval=10 \
  -i /path/to/key -L 9101:HP:9100 -L 9102:xerox:9100 -R 5003:127.0.0.1:5000 tunnel_user@142.16.102.35 -p 22
```

### **Démarrage d’un reverse tunnel (-R)**  
```bash
trickle -u 1000 -d 5000 autossh -M 0 -N -o ServerAliveInterval=10 \
  -i /path/to/key -R 5003:127.0.0.1:5000 -R 1901:127.0.0.1:1900 tunnel_user@142.16.102.35 -p 22
```

---

## **8. Conclusion**  
Cette API destinée a gérer des **tunnels SSH dynamiques**, avec des options avancées pour le contrôle du débit et la gestion des ports. 🚀  
Besoin d’un **prototype de code** pour démarrer rapidement ? 😃