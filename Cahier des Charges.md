**Cahier des Charges - Gestionnaire de Tunnels SSH Avancé**
**Version :** 1.0 (JSON)
**Date :** [03-2025]
**Auteur :** Alban Lopez

---

### **1. Introduction**
**Contexte** :
Ce projet vise à fournir une solution robuste pour la gestion automatisée de tunnels SSH persistants avec contrôle de bande passante, destinée aux administrateurs système et DevOps sous la forme d'un service system.

**Objectifs Principaux** :
- Maintenir des tunnels SSH persistant et résilients
- Limiter la bande passante par tunnel
- Simplifier le déploiement grâce à une configuration centralisée
- Garantir une haute disponibilité des connexions

---

### **2. Spécifications Techniques**
**Environnement Cible** :
- **OS** : Ubuntu 22.04 LTS / Debian 12 (et dérivés)
- **Dépendances** :
  - `jq` (traitement JSON)
  - `trickle` (limitation de bande passante)
  - `inotify-tools` (surveillance de fichiers)
  - `autossh` (SSH persistant)
  - `sshpass` (automatisation SSH)
  - `netcat` (pour les tests de connectivité TCP)
  - `curl` (pour les tests HTTP via tunnels)
  - `ping` (actif par défaut sur les systèmes Linux)

**Architecture** :
- **Fichiers de Configuration** : JSON structurés (`/etc/sshtunnel/conf.d/*.json`)
- **Journalisation** : Fichiers dédiés par tunnel (`/var/log/sshtunnel/`)
- **Gestion des Processus** : PID stockés (`/var/run/sshtunnel/`)

---

### **3. Fonctionnalités Clés**

#### **3.1 Gestion des Tunnels**
| Fonctionnalité | Détails |
|----------------|---------|
| **Multi-Tunnels** | Exécution parallèle de tunnels indépendants |
| **Persistance** | Reconnexion automatique en cas de déconnexion |
| **Bandwidth Shaping** | Limitation upload/download via `trickle` |
| **Rechargement Dynamique** | Mise à jour à chaud des configurations |

#### **3.2 Configuration JSON**
le fichier sera nomer selon le nom du site geographique
Structure type : 
```json
{
    "user": "tunnel_user",
    "ip": "142.16.102.35",
    "ssh_port": 22,
    "ssh_key": "/path/to/key",
    "options": {"keepalive_interval": 10},
    "bandwidth": {"up": 1000, "down": 5000},
    "tunnels": [
        {"type":"-L", "name": "printer1", "listen_port": 9101, "endpoint_host": "JectDirect", "endpoint_port": 9100},
        {"type":"-R", "name": "cam1", "listen_host": "cam", "listen_port": 5003, "endpoint_host": "127.0.0.1", "endpoint_port": 5000},
        {"type":"-D", "name": "remote_lan1", "listen_port": 4443}
    ]
}
```

#### **3.3 Interface de Gestion (CLI)**
  | Commande | Action |
  |----------|--------|
  | `sshtunnel-manager start [config]` | Démarre un/des tunnel(s) |
  | `sshtunnel-manager stop [config]` | Arrête un/des tunnel(s) |
  | `sshtunnel-manager restart [config]` | Redémarre un/des tunnel(s) |
  | `sshtunnel-manager status [config]` | Teste les ports et IP un/des tunnel(s) |
  | `sshtunnel-manager pairing ` | ajout d'un nouveau site (sans tunnels) |

#### **3.4 Outil de Configuration Automatisée**
- **Fonctions** :
  - Génération de clés SSH (Ed25519)
  - Création d’utilisateur dédié sur le serveur distant et deployement de la clés
  - Génération du fichier de config JSON
- **Modes** :
  - Interactif (questions/réponses)
  - Non-interactif (paramètres en ligne de commande)

---

### **4. Sécurité**
**Mesures Implémentées** :
- 🔐 Clés SSH sans passphrase stockées dans `/root/.ssh/`
- 👤 Utilisateur distant dédié avec shell `/bin/false`
- 🔒 Permissions strictes sur les fichiers :
  - Configurations : `640 root:root`
  - Clés SSH : `600`
- 🔄 Chiffrement recommandé : `aes256-gcm@openssh.com`

---

### **5. Installation et Déploiement**
**Procédure** :
1. Télécharger le package :
   ```bash
   wget https://example.com/sshtunnel-v2.tar.gz
   tar xzvf sshtunnel.tar.gz && sudo ./INSTALL.sh
   ```
2. Configurer un tunnel :
   automatisera le pairing et la creation du fichier de config (tunnels vides)
   ```bash
   sudo sshtunnel-manager -pairing -i 192.168.1.100 -u admin -p 'MonPassComplexe' -c mon_serveur -b "500/2000"
   ```

---

### **6. Monitoring et Maintenance**
#### **Fonctionnalité : Commande `check`**

Fournir une vision temps réel de l’état des tunnels avec métriques réseau détaillées.

#### **Spécifications Techniques**
  pourra etre appelée en test des toutes les configs sans les tunnels ou pour une config specifique avec un test complet de chacun des tunnels
  il faudra prevoir une solution performante de test parallelisé pour anticiper de tres nombreux tunnels
  **Commande** :
  ```bash
  sudo sshtunnel-manager check [config]
  ```

  **Métriques Collectées** :
  | Élément | Mesure | condition |
  |---------|--------|-----------|
  | ssh_port | etat (True/False) + latence | toujours |
  | ip | Latence ICMP | si ssh_port False, sinon prendre comme valeur la latence du ssh_port |
  | listen_port | État d’écoute | toujours (netstat -tln) |
  | listen_host | Latence ICMP | si type -R et listen_port False, sinon prendre comme valeur la latence du listen_port |
  | endpoint_port | etat (True/False) + latence | si type -R ou -L |
  | endpoint_host | Latence ICMP | si endpoint_port False, sinon prendre comme valeur la latence du endpoint_port |


- **Sortie au Format JSON** :
check simplifié de tous les sites geographiques
  ```bash
  sudo sshtunnel-manager check
  ```
  ```json
  {
    "servers": [
      {
        "name": "site geographique",
        "ip": "192.168.1.100",
        "ping_ms": 23,
        "port": {"status": True, "latency_ms": 25}
      }
    ]
  }
  ```

  check complet d'un site geographique
  ```bash
  sudo sshtunnel-manager check [config]
  ```
  ```json
  {
    "servers": [
      {
        "name": "site geographique",
        "ip": "192.168.1.100",
        "ping_ms": 23,
        "port": {"status": True, "latency_ms": 25}
      },
      "tunnels": [
        {
          "name": "printer1",
          "listen_port": {"status": True, "latency_ms": 1},
          "endpoint_port": {"status": True, "latency_ms": 45},
          "endpoint_host": {"latency_ms": 46}
        },
        {
          "name": "cam1",
          "listen_port": {"status": True, "latency_ms": 1},
          "listen_host": {"latency_ms": 1},
          "endpoint_port": {"status": False, "latency_ms": null},
          "endpoint_host": {"latency_ms": 46}
        },
        {
          "name": "remote_lan1",
          "listen_port": {"status": True, "latency_ms": 1},
        }
      ]
    ]
  }
  ```

---

### **7. Web management et monitoring**
interface moderne et dynamique pour la gestion des configs et le disgnostic
**management** :
  la liste des site geographique apparaitront sous forme d'une liste, avec les debits et des boutons d'action "add tunnel", "restart", "rename", "remove"
  il sera possible de déplier pour visualiser la liste des tunnels existant regroupe par type
    - chaque ligne affichera le "name" puis les parametres du tunnel puis les bouton "rename" et "remove"
  en haut avant cette liste un bouton pour le pairing d'un nouveau site geographique

**monitoring** :
  chaque ligne se terminera par une icone de status lui correspondant, actualisé régulierement
  - un symbole vert/rouge pour le status du host, un autre juste a coté, vert/rouge pour le status du port
  - un survol affichra les details

**API** :
  l'api sera capable de :
    - transmetre les actions au sshtunnel-manager
      - restart
      - status
      - pairing
    - fournirles données au format JSON
      - liste de tous les sites geographiques (Nom, IP, port_ssh)
      - toute la config d'un site geographique
      - le status simplifié de tous les sites geographiques
      - le status complet d'un site geographique avec les details des tunnels

---

### **8. Conclusion**
Cette solution répond aux besoins critiques de gestion sécurisée et scalable de tunnels SSH, avec une approche "Infrastructure as Code" via les configurations JSON. Elle s’intègre parfaitement dans des environnements DevOps exigeants tout en restant accessible aux administrateurs système.
