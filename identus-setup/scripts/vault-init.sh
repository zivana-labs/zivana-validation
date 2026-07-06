#!/bin/sh
set -e

INIT_FILE="/vault/data/init.json"
CONFIG_FILE="/vault/config/config.hcl"

mkdir -p /vault/config /vault/data
cat > $CONFIG_FILE << EOF
storage "raft" {
  path    = "/vault/data"
  node_id = "node1"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}
api_addr      = "http://127.0.0.1:8200"
cluster_addr  = "http://127.0.0.1:8201"
ui            = true
disable_mlock = true
EOF

vault server -config=$CONFIG_FILE &
VAULT_PID=$!
sleep 5

export VAULT_ADDR="http://127.0.0.1:8200"

FIRST_INIT=false
if [ ! -f "$INIT_FILE" ]; then
  echo "Initializing Vault with raft..."
  vault operator init -key-shares=1 -key-threshold=1 -format=json > $INIT_FILE
  FIRST_INIT=true
  echo "Vault initialized."
fi

UNSEAL_KEY=$(awk -F'"' '/"unseal_keys_b64"/{getline; print $2}' $INIT_FILE)
ROOT_TOKEN=$(awk -F'"' '/"root_token"/{print $4}' $INIT_FILE)

echo "Unsealing Vault..."
vault operator unseal $UNSEAL_KEY

sleep 2

echo "Logging in..."
vault login $ROOT_TOKEN

if [ "$FIRST_INIT" = "true" ]; then
  echo "First init: enabling KV v2..."
  vault secrets enable -path=secret kv-v2
  echo "KV v2 enabled."
fi

echo "Ensuring configured token exists..."
if vault token lookup "${VAULT_TOKEN_ID}" >/dev/null 2>&1; then
  echo "Token already exists, skipping creation."
else
  vault token create -id="${VAULT_TOKEN_ID}" -policy=root -no-default-policy
  echo "Token created."
fi

echo "Vault ready."
wait $VAULT_PID
