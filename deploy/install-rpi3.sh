#!/usr/bin/env bash
# Run as root on the authorized rpi3 test host after uploading the source archive.
set -euo pipefail
# Cette première phase installe le runtime et lance les tests. Elle n'active pas
# encore le service : activate-rpi3.sh s'en charge après validation.
archive="${1:?source archive required}"
runtime=/opt/ostm-runtime/node-v24.21.0-linux-arm64
test "$(uname -m)" = aarch64
test "$(id -u)" = 0
if ! id ostm >/dev/null 2>&1; then
  # Compte sans shell : une compromission de l'API n'offre pas de session locale.
  useradd --system --home-dir /var/lib/ostm --shell /usr/sbin/nologin ostm
fi
install -d -m 0755 /opt/ostm /opt/ostm-runtime
install -d -m 0700 -o ostm -g ostm /var/lib/ostm
# Les tests ICMP utilisent le ping iputils. Réparer automatiquement une image
# Debian minimale où le paquet aurait été retiré après l'installation initiale.
if ! command -v ping >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends iputils-ping
fi
if ! test -x "$runtime/bin/node"; then
  # Le Pi garde son ancien Node système pour ses autres services. OSTM reçoit un
  # runtime isolé afin de ne pas perturber les applications existantes.
  stage=$(mktemp -d /opt/ostm-runtime/download.XXXXXX)
  curl -fL --connect-timeout 15 --max-time 300 \
    https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-arm64.tar.xz \
    -o "$stage/node.tar.xz"
  # Vérifier l'archive officielle avant toute extraction avec privilèges root.
  printf '%s  %s\n' 6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2 "$stage/node.tar.xz" | sha256sum -c -
  tar -xJf "$stage/node.tar.xz" -C /opt/ostm-runtime --no-same-owner
  rm -- "$stage/node.tar.xz"
  rmdir -- "$stage"
fi
tar -xzf "$archive" -C /opt/ostm --no-same-owner
chown -R root:root /opt/ostm /opt/ostm-runtime
# Le helper importe du JavaScript : ce code doit rester non modifiable par ostm.
chmod -R go-w /opt/ostm /opt/ostm-runtime
cd /opt/ostm
export PATH="$runtime/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
npm ci --omit=optional --ignore-scripts --cache /var/cache/ostm-npm --no-audit --no-fund
# Les tests ordinaires tournent avec les mêmes droits que le futur service.
runuser -u ostm -- "$runtime/bin/node" --test --test-concurrency=1 tests/*.test.js
install -m 0644 deploy/90-ostm-forward.conf /etc/sysctl.d/90-ostm-forward.conf
/usr/sbin/sysctl -p /etc/sysctl.d/90-ostm-forward.conf
# Ce seul test demande root car il crée et supprime netns, veth et qdisc.
OSTM_LINUX_INTEGRATION=1 "$runtime/bin/node" --test tests/network-linux.test.js
