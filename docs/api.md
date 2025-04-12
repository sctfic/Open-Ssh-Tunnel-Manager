
## 1. Add Port Forward
Endpoint: POST /api/v1/channel/add/:tunnelId
Description: Adds a port forward to a specific tunnel.

**Request Body:**
```json
{
  "type": "-L", // Tunnel type: -L (local), -R (remote), -D (dynamic)
  "name": "printer1", // Name of the port forward
  "listen_port": 9101, // Listening port
  "listen_host": "localhost", // (Optional) Listening host (for -R)
  "endpoint_host": "127.0.0.1", // Endpoint host (for -L or -R)
  "endpoint_port": 9100 // Endpoint port (for -L or -R)
}
```
#### Response:

**Success:**
```json
{
    "success": true,
    "message": "Port ajouté",
    "result": {
        "success": true,
        "tunnelId": "london",
        "config": {
            "name": "test1",
            "listen_port": 5678,
            "endpoint_host": "127.0.0.1",
            "endpoint_port": 4567
        },
        "message": "Port 5678 ajouté avec succès"
    }
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```
## 2. Remove Port Forward
Endpoint: DELETE /api/v1/channel/rm/:tunnelId/:type/:port
Description: Removes a specific port forward from a tunnel.

**Path Parameters:**

tunnelId: ID of the tunnel.
type: Tunnel type (-L, -R, -D).
port: Port number to remove.
#### Response:

**Success:**
```json
{
  "success": true,
  "message": "Port supprimé",
  "result": { ... }
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```
## 3. Check Tunnel
Endpoint: GET /api/v1/channel/check/:id
Description: Checks the SSH connection of a specific tunnel.

**Path Parameters:**

id: ID of the tunnel.
#### Response:

**Success:**
```json
{
  "user": "ostm_user",
  "ip": "142.16.102.35",
  "ssh_port": 22,
  "ssh_key": "/path/to/key",
  "options": {
    "compression": "yes",
    "ServerAliveInterval": 10,
    "ServerAliveCountMax": 3
  },
  "bandwidth": {
    "up": 132,
    "down": 96
  },
  "channels": {
    "-L": {
      "9101": {
        "name": "printer1",
        "listen_port": 9101,
        "endpoint_host": "HP",
        "endpoint_port": 9100,
        "listen_status": 89,
        "endpoint_status": 91,
        "success": true
      }
    },
    "-R": {
      "5003": {
        "name": "cam1",
        "listen_port": 5003,
        "listen_host": "cam",
        "endpoint_host": "127.0.0.1",
        "endpoint_port": 5000,
        "listen_status": 54,
        "endpoint_status": null,
        "success": false
      }
    },
    "-D": {
      "4443": {
        "name": "remote_lan1",
        "listen_port": 4443,
        "listen_status": 62,
        "success": true
      }
    }
  },
  "ssh_status": 17
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```
## 4. Start Tunnel
Endpoint: GET /api/v1/tunnels/start/:tunnelId?
Description: Starts one or all tunnels.

**Path Parameters:**

tunnelId (optional): ID of the tunnel to start.
#### Response:

**Success:**
```json
{
  "success": true,
  "message": "Tous les tunnels ont été démarrés.",
  "tunnels": [
    {
      "success": true,
      "id": "london",
      "pid": "12883",
      "cmd": "/usr/lib/autossh/autossh -M 0    -N -i /path/to/key -p 22 -o compression=yes -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -L 9101:HP:9100 -L 9102:xerox:9100 -R scan:1901:127.0.0.1:1900 -R cam:5003:127.0.0.1:5000 -D 4443 ostm_user@142.16.102.35",
      "status": "running",
      "message": "Tunnel déjà en cours d'exécution."
    }
  ]
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```
## 5. Stop Tunnel
Endpoint: GET /api/v1/tunnels/stop/:tunnelId?
Description: Stops one or all tunnels.

**Path Parameters:**

tunnelId (optional): ID of the tunnel to stop.
#### Response:

**Success:**
```json
{
  "success": true,
  "message": "Tous les tunnels ont été arrêtés.",
  "tunnels": [ ... ]
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```
## 6. Restart Tunnel
Endpoint: GET /api/v1/tunnels/restart/:tunnelId?
Description: Restarts one or all tunnels.

**Path Parameters:**

tunnelId (optional): ID of the tunnel to restart.
#### Response:

**Success:**
```json
{
  "success": true,
  "message": "Tous les tunnels ont été redémarrés.",
  "tunnels": [ ... ]
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```
## 7. Get Tunnel Status
Endpoint: GET /api/v1/tunnels/status/:tunnelId?
Description: Retrieves the status of one or all tunnels.

**Path Parameters:**

tunnelId (optional): ID of the tunnel to check.
#### Response:

**Success:**
```json
// 20250411164105
// http://ostm.lpz.ovh/api/v1/tunnels/status

{
  "success": true,
  "message": "4/4 tunnels actifs (2 non gérés)",
  "tunnels": [
    {
      "success": true,
      "id": "Paris",
      "pid": "12855",
      "cmd": "/usr/lib/autossh/autossh -M 0    -N -i /home/alban/www/ostm/src/configs/key/Paris_key -p 22 -o compression=yes -o ServerAliveInterval=10 -o ServerAliveCountMax=3 alban@localhost",
      "status": "running",
      "message": "Tunnel en cour d'execution"
    },
    {
      "success": true,
      "id": "london",
      "pid": "12899",
      "cmd": "/usr/lib/autossh/autossh -M 0    -N -i /path/to/key -p 22 -o compression=yes -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -L 9101:HP:9100 -L 9102:xerox:9100 -R scan:1901:127.0.0.1:1900 -R cam:5003:127.0.0.1:5000 -D 4443 ostm_user@142.16.102.35",
      "status": "running",
      "message": "Tunnel en cour d'execution"
    },
    {
      "success": null,
      "id": null,
      "pid": 12899,
      "cmd": "autossh -M 0    -N -i /path/to/key -p 22 -o compression=yes -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -L 9101:HP:9100 -L 9102:xerox:9100 -R scan:1901:127.0.0.1:1900 -R cam:5003:127.0.0.1:5000 -D 4443 ostm_user@142.16.102.35",
      "status": "orphelin",
      "message": "Processus orphelin non géré"
    }
  ]
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```
## 8. Set Bandwidth
Endpoint: POST /api/v1/tunnels/bandwidth/:tunnelId
Description: Updates the bandwidth limits for a specific tunnel.

**Path Parameters:**

tunnelId: ID of the tunnel.
**Request Body:**
```json
{
  "up": 1000, // Upload bandwidth in Kbps
  "down": 5000 // Download bandwidth in Kbps
}
```
#### Response:

**Success:**
```json
{
  "success": true,
  "message": "Bande passante du tunnel london modifiée.",
  "config": {
    "user": "ostm_user",
    "ip": "142.16.102.35",
    "ssh_port": 22,
    "ssh_key": "/path/to/key",
    "options": {
      "compression": "yes",
      "ServerAliveInterval": 10,
      "ServerAliveCountMax": 3
    },
    "bandwidth": {
      "up": 1000,
      "down": 5000
    },
    "channels": { ... }
    }
  }
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```
## 9. Pairing
Endpoint: POST /api/v1/pairing/plug
Description: Creates a new tunnel configuration and generates an SSH key.

**Request Body:**
```json
{
  "ip": "192.168.1.1", // Server IP
  "adminUser": "admin", // Admin username
  "adminPass": "password_or_public_key", // Admin password or public key
  "configName": "paris_server" // Configuration name
}
```
#### Response:

**Success:**
```json
{
  "success": true,
  "message": "Tunnel ajouté.",
  "result": { ... }
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}
```
10. Unpairing
Endpoint: DELETE /api/v1/pairing/unplug/:tunnelId
Description: Deletes a tunnel configuration and its associated SSH key.

**Path Parameters:**

tunnelId: ID of the tunnel to unpair.
#### Response:

**Success:**
```json
{
  "success": true,
  "message": "Tunnel supprimé.",
  "result": { ... }
}
```
**Error:**
```json
{
  "success": false,
  "message": "Error message"
}