# VAL-003: Identus DID Issuance and Verification on Cardano Preprod

Proves end-to-end W3C DID publication, credential issuance, and presentation
verification using Hyperledger Identus Cloud Agent v2.2.0 on Cardano preprod.
Part of Zivana Protocol Phase 0: Foundation Verification.

## What Was Proven

| Step | Result | Evidence |
|---|---|---|
| DID published on Cardano preprod | Confirmed | TX `f6becc52...` block 4894745, fee 183,365 lovelace |
| JWT credential issued | Confirmed | CredentialSent / CredentialReceived |
| Presentation verified | Confirmed | `PresentationVerified` from independent verifier |

**Issuer DID:**
`did:prism:1e99b05986e260d569eea85c181af04fb8f7e437d337677b609b79e260fd3292`

**Cardano TX:**
`f6becc5272cf26a328c5d822390a5fee68a769bc23b26e3fcf11f8e075688389`

---

## Architecture

Three independent Cloud Agent stacks communicate over DIDComm V2 across
separate Docker networks via host bridge IPs.

Issuer (8085)  ──DIDComm──►  Holder (7085)  ──DIDComm──►  Verifier (6085)
│                             │
│ publishes DID               │ holds credential
▼                             ▼
Cardano preprod              presents proof
(prism-node + db-sync)           │
▼
Verifier resolves DID
from Cardano preprod


| Stack | Ports | Ledger | Cardano connectivity |
|---|---|---|---|
| Issuer | 8085 (REST), 8095 (DIDComm) | Cardano preprod | cardano-node + wallet + db-sync |
| Holder | 7085 (REST), 7095 (DIDComm) | In-memory | None needed |
| Verifier | 6085 (REST), 6095 (DIDComm) | Cardano preprod | cardano-node + wallet + db-sync |

**Network gateways:**
- `identus-issuer-net`: `172.20.0.1`
- `identus-holder-net`: `172.22.0.1`
- `identus-verifier-net`: `172.23.0.1`

---

## Image Versions

| Image | Version | Notes |
|---|---|---|
| `hyperledgeridentus/identus-cloud-agent` | 2.2.0 | |
| `inputoutput/prism-node` | 2.6.0 | |
| `cardanofoundation/cardano-wallet` | v2026-05-11 | Compatible with node 11.0.1 |
| `intersectmbo/cardano-db-sync` | 13.7.0.5 | |
| `ghcr.io/blinklabs-io/cardano-node` | latest | Preprod |
| `hashicorp/vault` | 1.15 | Raft backend, KV v2 |
| `postgres` | 13 | |

---

## Prerequisites

- Docker Desktop with WSL2 backend (Windows) or Docker Engine (Linux/macOS)
- At least 15GB RAM available to Docker
- Node.js 18+ (for seed generation scripts)
- A funded Cardano preprod wallet (see Cardano stack setup below)

---

## Cardano Stack Setup

The Cardano stack must be running before starting any Identus stack.

```bash
cd cardano-preprod
cp .env.example .env   # fill in DBSYNC_POSTGRES_PASSWORD
docker compose up -d
```

Wait for the node to sync. This uses Mithril bootstrap and takes 15-30 minutes
on first run. Check sync progress:

```bash
curl -s http://localhost:8090/v2/network/information | python3 -m json.tool | grep status
```

Fund the preprod wallet from the faucet at https://docs.cardano.org/cardano-testnets/tools/faucet/
using the payment address printed in wallet logs.

---

## Generating Secrets

Each stack needs its own `.env` file with unique secrets. Use the generator:

```bash
node scripts/generate-seed.js        # prints 128-char hex seed to stdout
openssl rand -hex 32                  # VAULT_DEV_ROOT_TOKEN_ID
openssl rand -hex 32                  # ADMIN_TOKEN
openssl rand -hex 24                  # POSTGRES_PASSWORD
```

Never commit `.env` files. The `.gitignore` excludes them.

The following variables have constraints worth noting:

- `NODE_CARDANO_WALLET_PASSPHRASE` — the passphrase used when the cardano-wallet
  was created. Must match exactly or the wallet will not unlock.
- `CARDANO_WALLET_ID` and `CARDANO_PAYMENT_ADDRESS` — obtained from the
  cardano-wallet after funding. See the Cardano Stack Setup section.
- `POLLUX_DB_APP_PASSWORD`, `CONNECT_DB_APP_PASSWORD`, `AGENT_DB_APP_PASSWORD` —
  must be `password` to match the Cloud Agent v2.2.0 `application.conf` hardcoded
  defaults. Do not change these unless you are also patching the agent configuration.

---

## Starting the Stacks

Start one stack at a time. Each requires 1-2GB RAM on top of the Cardano stack.

### Issuer

```bash
cd identus-setup/issuer
cp .env.example .env   # fill in all values
docker compose --env-file .env up -d
```

Wait for healthy status:
```bash
curl -s http://localhost:8085/_system/health
# {"version":"2.2.0"}
```

Register API key and create DID:
```bash
curl -s -X POST http://localhost:8085/iam/apikey-authentication \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: <ADMIN_TOKEN>" \
  -d '{"entityId": "00000000-0000-0000-0000-000000000000", "apiKey": "zivana-issuer-key-001"}'

curl -s -X POST http://localhost:8085/did-registrar/dids \
  -H "Content-Type: application/json" \
  -H "apikey: zivana-issuer-key-001" \
  -d '{"documentTemplate":{"publicKeys":[{"id":"auth-1","purpose":"authentication"},{"id":"issue-1","purpose":"assertionMethod"}],"services":[]}}'
```

Publish the DID (replace `<LONG_FORM_DID>` with the value from above):
```bash
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('<LONG_FORM_DID>', safe=''))")
curl -s -X POST "http://localhost:8085/did-registrar/dids/${ENCODED}/publications" \
  -H "apikey: zivana-issuer-key-001"
```

Poll for confirmation (requires 112 blocks, ~37 minutes on preprod):
```bash
curl -s "http://localhost:8085/did-registrar/dids/<SHORT_DID>" \
  -H "apikey: zivana-issuer-key-001" | python3 -m json.tool | grep status
# "status": "PUBLISHED"
```

Confirm with wallet transaction:
```bash
curl -s "http://localhost:8090/v2/wallets/<WALLET_ID>/transactions" | python3 -c "
import sys,json
txs=json.load(sys.stdin)
for tx in txs[:3]: print(tx.get('direction'), tx.get('status'), tx.get('amount'))
"
# outgoing in_ledger {'quantity': 183365, ...}
```

### Holder

```bash
cd identus-setup/holder
cp .env.example .env
docker compose --env-file .env -p identus-holder up -d
curl -s http://localhost:7085/_system/health
```

### Verifier

```bash
cd identus-setup/verifier
cp .env.example .env
docker compose --env-file .env -p identus-verifier up -d
curl -s http://localhost:6085/_system/health
```

Note: the verifier's prism-node must sync from the Cardano genesis block to the
block where the issuer DID was published before verification can succeed. This
takes roughly 2-3 hours on first run. Monitor progress:

```bash
docker exec -i identus-verifier-db psql -U postgres -d node_db \
  -c "SELECT MAX(block_number) FROM atala_object_txs;"

docker exec -i identus-verifier-db psql -U postgres -d node_db \
  -c "SELECT did_suffix FROM did_data WHERE did_suffix LIKE '<DID_SUFFIX>%';"
```

Proceed once the DID suffix appears in the result.

---

## Credential Issuance Flow

### 1. Register schema

```bash
curl -s -X POST http://localhost:8085/schema-registry/schemas \
  -H "Content-Type: application/json" \
  -H "apikey: zivana-issuer-key-001" \
  -d '{
    "name": "zivana-contributor-role",
    "version": "1.0.0",
    "type": "https://w3c-ccg.github.io/vc-json-schemas/schema/2.0/schema.json",
    "author": "<SHORT_DID>",
    "tags": ["zivana"],
    "schema": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {"role": {"type": "string"}, "jurisdiction": {"type": "string"}},
      "required": ["role", "jurisdiction"],
      "additionalProperties": true
    }
  }'
```

### 2. Establish issuer-to-holder connection

Issuer creates invitation:
```bash
curl -s -X POST http://localhost:8085/connections \
  -H "Content-Type: application/json" \
  -H "apikey: zivana-issuer-key-001" \
  -d '{"label": "issuer-to-holder"}'
```

Holder accepts (pass only the base64 after `_oob=`, not the full URL):
```bash
curl -s -X POST http://localhost:7085/connection-invitations \
  -H "Content-Type: application/json" \
  -H "apikey: zivana-holder-key-001" \
  -d '{"invitation": "<BASE64_ONLY>"}'
```

Poll until `ConnectionResponseReceived` on holder and `ConnectionResponseSent` on issuer.

### 3. Issue credential

```bash
curl -s -X POST http://localhost:8085/issue-credentials/credential-offers \
  -H "Content-Type: application/json" \
  -H "apikey: zivana-issuer-key-001" \
  -d '{
    "claims": {"role": "contributor", "jurisdiction": "NG"},
    "connectionId": "<ISSUER_CONN_ID>",
    "issuingDID": "<SHORT_DID>",
    "schemaId": "http://172.20.0.1:8085/schema-registry/schemas/<SCHEMA_ID>",
    "credentialFormat": "JWT",
    "automaticIssuance": true
  }'
```

Holder creates a PRISM DID and accepts the offer:
```bash
# Create holder DID
curl -s -X POST http://localhost:7085/did-registrar/dids \
  -H "Content-Type: application/json" \
  -H "apikey: zivana-holder-key-001" \
  -d '{"documentTemplate":{"publicKeys":[{"id":"auth-1","purpose":"authentication"}],"services":[]}}'

# Accept offer
curl -s -X POST http://localhost:7085/issue-credentials/records/<HOLDER_RECORD_ID>/accept-offer \
  -H "Content-Type: application/json" \
  -H "apikey: zivana-holder-key-001" \
  -d '{"subjectId": "<HOLDER_LONG_FORM_DID>"}'
```

Poll until `CredentialSent` on issuer and `CredentialReceived` on holder.

---

## Verification Flow

### 1. Establish verifier-to-holder connection

Same pattern as issuer-to-holder above, using verifier API key on port 6085.

### 2. Request presentation

```bash
curl -s -X POST http://localhost:6085/present-proof/presentations \
  -H "Content-Type: application/json" \
  -H "apikey: zivana-verifier-key-001" \
  -d '{
    "connectionId": "<VERIFIER_CONN_ID>",
    "proofs": [{"schemaId": "http://172.20.0.1:8085/schema-registry/schemas/<SCHEMA_ID>",
                "trustIssuers": ["<SHORT_DID>"]}],
    "options": {"challenge": "zivana-val-003", "domain": "zivana.network"}
  }'
```

### 3. Holder presents

```bash
curl -s -X PATCH http://localhost:7085/present-proof/presentations/<HOLDER_PRES_ID> \
  -H "Content-Type: application/json" \
  -H "apikey: zivana-holder-key-001" \
  -d '{"action": "request-accept", "proofId": ["<HOLDER_RECORD_ID>"]}'
```

### 4. Check result

```bash
curl -s http://localhost:6085/present-proof/presentations/<VERIFIER_PRES_ID> \
  -H "apikey: zivana-verifier-key-001" | python3 -m json.tool | grep status
# "status": "PresentationVerified"
```

---

## Memory Management

The full stack requires approximately 14GB RAM:

| Container | Approximate RAM |
|---|---|
| cardano-node | 5GB |
| cardano-db-sync | 2-3GB |
| issuer prism-node | 2.5GB |
| verifier prism-node | 1.5GB |
| All cloud-agents (x3) | 600MB each |
| All databases (x4) | 200MB each |

Run db-sync only when needed (DID publication confirmation, verifier sync).
Stop it once synced to save memory. Do not run all three prism-nodes
simultaneously unless you have 16GB+ available.

---

## Key Engineering Findings

**Bridge network gateway IPs must be pinned with IPAM subnets.** Docker assigns
bridge network subnets dynamically from its default pool. Without explicit
`ipam.config.subnet` entries in each network definition, the gateway IPs used in
`DIDCOMM_SERVICE_URL`, `REST_SERVICE_URL`, and `POLLUX_STATUS_LIST_REGISTRY_PUBLIC_URL`
will not match on a different machine or a different startup sequence. The result is
silent failure: DIDComm connections appear to succeed but messages never arrive,
credential status resolution returns `ResourceNotFound`, and verification fails with
no obvious error pointing at the real cause. Each network in this stack has its
subnet pinned: `172.20.0.0/24` for the issuer, `172.22.0.0/24` for the holder,
and `172.23.0.0/24` for the verifier.

**NODE_LEDGER=cardano is required.** Without it, prism-node defaults to
in-memory mode and reports PUBLISHED without submitting any Cardano transaction.
The wallet balance will not change. This was the root cause of all fake
publication results during development.

**NODE_CARDANO_NETWORK must be testnet, not preprod.** The enum in prism-node
v2.6.0 only accepts `Testnet` or `Mainnet`. Passing `preprod` causes a
`NoSuchElementException` crash at startup.

**POLLUX_STATUS_LIST_REGISTRY_PUBLIC_URL controls credential status URLs.**
It defaults to `http://localhost:{port}`. Set it to the host bridge IP
(`http://172.20.0.1:8085`) so credential status URLs embedded in JWTs are
resolvable from the verifier container. `REST_SERVICE_URL` does not control this.

**Cloud Agent v2.2.0 requires KV v2 at secret/.** The application.conf bundles
hardcoded app-user role names (`pollux-application-user` etc.) with default
password `password`. These roles must exist in Postgres before migration runs.
The `postgres-init-multiple-databases.sh` script handles this automatically.

**Vault file backend hits Linux path limits with KV v2.** Long DIDComm key
names cause `file name too long` errors on Linux when using the file storage
backend. Use the raft backend instead. Raft uses BoltDB and has no path length
constraints.

**OOB invitation base64 only.** When passing an OOB invitation URL to
`POST /connection-invitations`, pass only the base64 string after `_oob=`,
not the full URL. The full URL contains a colon which is an illegal base64
character and causes a 500 error.

**Connectionless credential issuance requires Edge Agent SDK.** The Cloud
Agent REST API does not support holder-side acceptance of connectionless OOB
credential offers. Use the connected flow (establish connection first, then
issue credential over that connection) for Cloud Agent to Cloud Agent issuance.

---

## Vault Operations

Vault uses raft storage with file-based persistence. On container restart,
`vault-init.sh` automatically unseals using the stored init.json and recreates
the configured token. KV v2 is enabled only on first initialization to avoid
wiping existing wallet seeds.

To check Vault status:
```bash
docker exec identus-issuer-vault sh -c "VAULT_ADDR=http://127.0.0.1:8200 vault status"
```

To verify KV v2 is mounted:
```bash
TOKEN=$(grep VAULT_DEV_ROOT_TOKEN_ID identus-setup/issuer/.env | cut -d= -f2)
docker exec identus-issuer-vault sh -c \
  "VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=$TOKEN vault secrets list" | grep secret
# secret/    kv-v2    ...
```