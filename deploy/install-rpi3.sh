#!/usr/bin/env bash
# Run as root on the authorized rpi3 test host after uploading the source archive.
set -euo pipefail
archive="${1:?source archive required}"
runtime=/opt/ostm-runtime/node-v24.21.0-linux-arm64
test "$(uname -m)" = aarch64
test "$(id -u)" = 0
if ! id ostm >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/ostm --shell /usr/sbin/nologin ostm
fi
install -d -m 0755 /opt/ostm /opt/ostm-runtime
install -d -m 0700 -o ostm -g ostm /var/lib/ostm
if ! test -x "$runtime/bin/node"; then
  stage=$(mktemp -d /opt/ostm-runtime/download.XXXXXX)
  curl -fL --connect-timeout 15 --max-time 300 \
    https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-arm64.tar.xz \
    -o "$stage/node.tar.xz"
  printf '%s  %s\n' 6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2 "$stage/node.tar.xz" | sha256sum -c -
  tar -xJf "$stage/node.tar.xz" -C /opt/ostm-runtime --no-same-owner
  rm -- "$stage/node.tar.xz"
  rmdir -- "$stage"
fi
tar -xzf "$archive" -C /opt/ostm --no-same-owner
chown -R root:root /opt/ostm /opt/ostm-runtime
chmod -R go-w /opt/ostm /opt/ostm-runtime
cd /opt/ostm
export PATH="$runtime/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
npm ci --omit=optional --ignore-scripts --cache /var/cache/ostm-npm --no-audit --no-fund
runuser -u ostm -- "$runtime/bin/node" --test --test-concurrency=1 tests/*.test.js
install -m 0644 deploy/90-ostm-forward.conf /etc/sysctl.d/90-ostm-forward.conf
/usr/sbin/sysctl -p /etc/sysctl.d/90-ostm-forward.conf
OSTM_LINUX_INTEGRATION=1 "$runtime/bin/node" --test tests/network-linux.test.js
