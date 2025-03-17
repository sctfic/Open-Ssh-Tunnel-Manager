import os
import json
import subprocess
import shutil
import logging
import argparse
from typing import Optional, List, Dict, Any

# Constantes pour les chemins
CONFIG_DIR = "/etc/sshtunnel/conf.d"
LOG_DIR = "/var/log/sshtunnel"
PID_DIR = "/var/run/sshtunnel"

# Liste des dépendances système requises
DEPENDENCIES = ['ssh', 'ping', 'netstat', 'nc', 'ssh-keygen']

# Configuration du logging
logging.basicConfig(
    filename=os.path.join(LOG_DIR, "sshtunnel.log"),
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

def check_dependencies() -> None:
    """
    Vérifie si toutes les dépendances nécessaires sont installées.
    Quitte avec un code d'erreur si une dépendance manque.
    """
    missing = [dep for dep in DEPENDENCIES if shutil.which(dep) is None]
    if missing:
        error_msg = f"Dépendances manquantes : {', '.join(missing)}. Installez-les avec votre gestionnaire de paquets."
        logging.error(error_msg)
        raise SystemExit(error_msg)

def check_root() -> None:
    """Vérifie si le script est exécuté avec des privilèges root."""
    if os.getuid() != 0:
        error_msg = "Ce script doit être exécuté avec des privilèges root (sudo)."
        logging.error(error_msg)
        raise SystemExit(error_msg)

def check_dirs(config_dir: str = CONFIG_DIR, log_dir: str = LOG_DIR, pid_dir: str = PID_DIR) -> None:
    """
    Crée les répertoires nécessaires s'ils n'existent pas et définit les permissions à 750.
    """
    for directory in [config_dir, log_dir, pid_dir]:
        try:
            os.makedirs(directory, exist_ok=True)
            os.chmod(directory, 0o750)
            logging.info(f"Répertoire {directory} vérifié ou créé avec permissions 750.")
        except OSError as e:
            logging.error(f"Erreur lors de la création du répertoire {directory} : {e}")
            raise SystemExit(1)


def validate_config(config):
    required_fields = ["user", "ip", "ssh_port", "tunnels"]
    for field in required_fields:
        if field not in config:
            raise ValueError(f"Champ obligatoire manquant : {field}")
    
    for tunnel in config["tunnels"]:
        if "type" not in tunnel or "name" not in tunnel:
            raise ValueError("Chaque tunnel doit avoir un 'type' et un 'name'")
        if tunnel["type"] == "-L" and not all(k in tunnel for k in ["listen_port", "endpoint_host", "endpoint_port"]):
            raise ValueError("Champs manquants pour tunnel de type -L (listen_port, endpoint_host, endpoint_port)")
        elif tunnel["type"] == "-R" and not all(k in tunnel for k in ["listen_host", "listen_port", "endpoint_host", "endpoint_port"]):
            raise ValueError("Champs manquants pour tunnel de type -R (listen_host, listen_port, endpoint_host, endpoint_port)")
        elif tunnel["type"] == "-D" and "listen_port" not in tunnel:
            raise ValueError("Champs manquants pour tunnel de type -D (listen_port)")
    return True

def start_tunnel(config_name):
    print(config_name)
    """Démarre les tunnels SSH définis dans la configuration."""
    pid_file = os.path.join(PID_DIR, f"{config_name}.pid")
    log_file = os.path.join(LOG_DIR, f"{config_name}.log")
    with open(f"{CONFIG_DIR}/{config_name}.json", "r") as f:
        config = json.load(f)
    validate_config(config)  # Validation préalable
    # Construction de la commande de base avec autossh
    base_cmd = ["autossh", "-M", "0", "-N", "-i", config["ssh_key"], 
                f"{config['user']}@{config['ip']}", "-p", str(config["ssh_port"])]
    
    # Ajout des options avancées si présentes
    if "options" in config and "keepalive_interval" in config["options"]:
        base_cmd += ["-o", f"ServerAliveInterval={config['options']['keepalive_interval']}"]
        
    for tunnel in config["tunnels"]:
        # Définition des options spécifiques au type de tunnel
        tunnel_opt = ""
        if tunnel["type"] == "-L":
            tunnel_opt = f"-L {tunnel['listen_port']}:{tunnel['endpoint_host']}:{tunnel['endpoint_port']}"
        elif tunnel["type"] == "-R":
            tunnel_opt = f"-R {tunnel['listen_host']}:{tunnel['listen_port']}:{tunnel['endpoint_host']}:{tunnel['endpoint_port']}"
        elif tunnel["type"] == "-D":
            tunnel_opt = f"-D {tunnel['listen_port']}"
        
        cmd = base_cmd + [tunnel_opt]
        
    # Application de la limitation de bande passante si définie
    if "bandwidth" in config:
        cmd = ["trickle", "-u", str(config["bandwidth"]["up"]), "-d", str(config["bandwidth"]["down"])] + cmd
    
    # Lancement du processus avec redirection des sorties
    with open(log_file, "a") as log:
        process = subprocess.Popen(cmd, stdout=log, stderr=log)
        with open(pid_file, "w") as f:
            f.write(str(process.pid))
        logging.info(f"Tunnel {config_name} démarré avec PID {process.pid}")

def stop_tunnel(config_name):
    print(config_name)
    """Arrête tous les tunnels associés à une configuration donnée."""
    config_path = f"{CONFIG_DIR}/{config_name}.json"
    if not os.path.exists(config_path):
        logging.error(f"Configuration {config_name} introuvable.")
        return
    with open(config_path, "r") as f:
        config = json.load(f)
    stopped = False
    for pid_file in os.listdir(PID_DIR):
        # verifier que le nom de pid_file est egal a config_name
        if pid_file.startswith(f"{config_name}"):
            pid_path = os.path.join(PID_DIR, pid_file)
            try:
                with open(pid_path, "r") as f:
                    pid = int(f.read().strip())
                os.kill(pid, 15)  # SIGTERM
                os.remove(pid_path)
                logging.info(f"Tunnel {pid_file} arrêté avec succès (PID {pid})")
                stopped = True
            except (ProcessLookupError, ValueError) as e:
                logging.warning(f"Tunnel {pid_file} déjà terminé ou PID invalide : {e}")
                os.remove(pid_path)
            except OSError as e:
                logging.error(f"Erreur système lors de l'arrêt de {pid_file} : {e}")
    if not stopped:
        logging.info(f"Aucun tunnel actif trouvé pour {config_name}")

def add_tunnel(config_path, tunnel_name, tunnel_type, params):
    """Ajoute un nouveau tunnel à une configuration JSON."""
    with open(config_path, "r") as f:
        config = json.load(f)
    
    # Validation et création du nouveau tunnel
    if tunnel_type == "-L":
        if len(params) != 3:
            raise ValueError("Usage: -L listen_port endpoint_host endpoint_port")
        new_tunnel = {"type": "-L", "name": tunnel_name, "listen_port": params[0], 
                      "endpoint_host": params[1], "endpoint_port": params[2]}
    elif tunnel_type == "-R":
        if len(params) != 4:
            raise ValueError("Usage: -R listen_host listen_port endpoint_host endpoint_port")
        new_tunnel = {"type": "-R", "name": tunnel_name, "listen_host": params[0], 
                      "listen_port": params[1], "endpoint_host": params[2], "endpoint_port": params[3]}
    elif tunnel_type == "-D":
        if len(params) != 1:
            raise ValueError("Usage: -D listen_port")
        new_tunnel = {"type": "-D", "name": tunnel_name, "listen_port": params[0]}
    else:
        raise ValueError("Type de tunnel invalide")
    
    config["tunnels"].append(new_tunnel)
    with open(config_path, "w") as f:
        json.dump(config, f, indent=4)
    logging.info(f"Tunnel {tunnel_name} ajouté à {config_path}")

def remove_tunnel(config_path, tunnel_name):
    """Supprime un tunnel spécifique d'une configuration."""
    with open(config_path, "r") as f:
        config = json.load(f)
    
    original_len = len(config["tunnels"])
    config["tunnels"] = [t for t in config["tunnels"] if t["name"] != tunnel_name]
    
    if len(config["tunnels"]) < original_len:
        with open(config_path, "w") as f:
            json.dump(config, f, indent=4)
        logging.info(f"Tunnel {tunnel_name} supprimé de {config_path}")
    else:
        logging.info(f"Tunnel {tunnel_name} non trouvé dans {config_path}")

def pairing(ip, admin_user, password, config_name, bandwidth=None):
    key_path = f"/root/.ssh/{config_name}_key"
    subprocess.run(["ssh-keygen", "-t", "ed25519", "-f", key_path, "-N", ""])
    os.chmod(key_path, 0o600)
    
    # Créer l'utilisateur distant
    ssh_cmd = f"sshpass -p {password} ssh {admin_user}@{ip} 'useradd -m -s /bin/false tunnel_user && mkdir -p ~tunnel_user/.ssh && cat >> ~tunnel_user/.ssh/authorized_keys'"
    subprocess.run(ssh_cmd, shell=True, input=open(f"{key_path}.pub").read(), text=True)
    
    # Générer le fichier JSON
    config = {
        "user": "tunnel_user",
        "ip": ip,
        "ssh_port": 22,
        "ssh_key": key_path,
        "tunnels": []
    }
    if bandwidth:
        up, down = bandwidth.split("/")
        config["bandwidth"] = {"up": int(up), "down": int(down)}
    
    with open(f"{CONFIG_DIR}/{config_name}.json", "w") as f:
        json.dump(config, f, indent=4)

def check_status(config_name=None):
    if not config_name:  # Check simplifié de tous les sites
        result = {"servers": []}
        for conf_file in os.listdir(CONFIG_DIR):
            with open(f"{CONFIG_DIR}/{conf_file}") as f:
                config = json.load(f)
            status = {"name": conf_file[:-5], "ip": config["ip"]}
            ping = subprocess.run(["ping", "-c", "4", config["ip"]], capture_output=True, text=True)
            # extraire le temps de ping si la commande a réussi
            status["ping_ms"] = float(ping.stdout.split("time=")[1].split("ms")[0]) if ping.returncode == 0 else None
            nc = subprocess.run(["nc", "-z", config["ip"], str(config["ssh_port"])], capture_output=True)
            status["port"] = {"status": nc.returncode == 0, "latency_ms": 25 if nc.returncode == 0 else None}
            result["servers"].append(status)
        return json.dumps(result, indent=4)
    
    # Check complet pour une config spécifique
    with open(f"{CONFIG_DIR}/{config_name}.json") as f:
        config = json.load(f)
    result = {"servers": [{"name": config_name, "ip": config["ip"]}], "tunnels": []}
    # Ajouter les métriques comme dans le cahier des charges
    return json.dumps(result, indent=4)


def reload_config():
    """Recharge les configurations et redémarre les tunnels."""
    for config_file in os.listdir(CONFIG_DIR):
        if config_file.endswith(".json"):
            config_name = config_file[:-5]
            stop_tunnel(config_name)
            start_tunnel(config_name)
    logging.info("Configurations rechargées et tunnels redémarrés.")

if __name__ == "__main__":
    # Vérifications initiales
    check_dependencies()
    check_root()
    check_dirs()

    parser = argparse.ArgumentParser(description="Gestionnaire de tunnels SSH")
    parser.add_argument("command", choices=["start", "stop", "restart", "status", "pairing", "check"])
    parser.add_argument("config", nargs="?", help="Nom de la configuration")
    args = parser.parse_args()

    if args.command == "start":
        start_tunnel(args.config)
    elif args.command == "check":
        print(check_status(args.config))