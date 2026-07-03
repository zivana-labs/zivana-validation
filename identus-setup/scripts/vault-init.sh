#!/bin/sh
set -e

INIT_FILE="/vault/data/init.json"
CONFIG_FILE="/vault/config/config.hcl"

mkdir -p /vault/config /vault/data
cat > $CONFIG_FILE << EOF
storage "file" {
  path = "/vault/data"
}
listener "tcp" {
  address = "0.0.0.0:8200"
  tls_disable = 1
}
ui = true
EOF

vault server -config=$CONFIG_FILE &
VAULT_PID=$!
sleep 3

export VAULT_ADDR="http://127.0.0.1:8200"

if [ ! -f "$INIT_FILE" ]; then
  echo "Initializing Vault..."
  vault operator init -key-shares=1 -key-threshold=1 -format=json > $INIT_FILE
  echo "Vault initialized."
fi

# Extract using awk - more reliable than grep/sed for JSON
UNSEAL_KEY=$(awk -F'"' '/"unseal_keys_b64"/{getline; print $2}' $INIT_FILE)
ROOT_TOKEN=$(awk -F'"' '/"root_token"/{print $4}' $INIT_FILE)

echo "UNSEAL_KEY=$UNSEAL_KEY"
echo "Unsealing Vault..."
vault operator unseal $UNSEAL_KEY

echo "Logging in..."
vault login $ROOT_TOKEN

echo "Enabling KV secrets engine..."
vault secrets enable -path=secret kv-v2 2>/dev/null || true

echo "Creating configured token..."
vault token create -id="${VAULT_TOKEN_ID}" -policy=root -no-default-policy 2>/dev/null || true

echo "Vault ready."
wait $VAULT_PID
