#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
cd /opt/ostm
runtime=/opt/ostm-runtime/node-v24.21.0-linux-arm64
export PATH="$runtime/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
/usr/sbin/visudo -cf deploy/ostm-rpi3.sudoers
install -m 0440 deploy/ostm-rpi3.sudoers /etc/sudoers.d/ostm-test
runuser -u ostm -- env OSTM_DATA_DIR=/var/lib/ostm "$runtime/bin/node" deploy/init-test-root.mjs
if test -f /var/lib/ostm/initial-root-password; then
  install -d -m 0700 -o alban -g alban /home/alban/.config/ostm-test
  install -m 0600 -o alban -g alban /var/lib/ostm/initial-root-password /home/alban/.config/ostm-test/root-password
  rm -- /var/lib/ostm/initial-root-password
fi
if ! test -f /etc/ssl/private/ostm-rpi3-test.key; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -keyout /etc/ssl/private/ostm-rpi3-test.key -out /etc/ssl/certs/ostm-rpi3-test.crt \
    -subj '/CN=rpi3.lan' -addext 'subjectAltName=DNS:rpi3.lan,IP:10.0.0.253'
  chmod 0600 /etc/ssl/private/ostm-rpi3-test.key
fi
install -m 0644 deploy/nginx.rpi3.conf /etc/nginx/sites-available/ostm-test.conf
ln -sfn /etc/nginx/sites-available/ostm-test.conf /etc/nginx/sites-enabled/ostm-test.conf
/usr/sbin/nginx -t
runuser -u ostm -- env PM2_HOME=/var/lib/ostm/.pm2 "$runtime/bin/node" /usr/local/lib/node_modules/pm2/bin/pm2 start deploy/ecosystem.rpi3.config.cjs
runuser -u ostm -- env PM2_HOME=/var/lib/ostm/.pm2 "$runtime/bin/node" /usr/local/lib/node_modules/pm2/bin/pm2 save
runuser -u ostm -- env PM2_HOME=/var/lib/ostm/.pm2 "$runtime/bin/node" /usr/local/lib/node_modules/pm2/bin/pm2 kill
install -m 0644 deploy/pm2-ostm.service /etc/systemd/system/pm2-ostm.service
systemctl daemon-reload
systemctl enable --now pm2-ostm
systemctl reload nginx
curl --retry 10 --retry-connrefused --retry-delay 1 --fail --silent http://127.0.0.1:4000/health
curl --fail --silent --cacert /etc/ssl/certs/ostm-rpi3-test.crt --resolve rpi3.lan:8443:127.0.0.1 https://rpi3.lan:8443/health
systemctl is-active pm2-ostm nginx
