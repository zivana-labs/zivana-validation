#!/bin/bash
set -e
set -u

function create_database() {
    local database=$1
    echo "Creating database '$database'"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        CREATE DATABASE "$database";
        GRANT ALL PRIVILEGES ON DATABASE "$database" TO "$POSTGRES_USER";
EOSQL
}

function create_application_role() {
    local database=$1
    local rolename="${database}-application-user"
    echo "Creating application role '$rolename' for database '$database'"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${rolename}') THEN
                CREATE ROLE "${rolename}" WITH LOGIN PASSWORD 'password';
            END IF;
        END
        \$\$;
        GRANT ALL PRIVILEGES ON DATABASE "$database" TO "${rolename}";
EOSQL
}

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
    echo "Multiple database creation requested: $POSTGRES_MULTIPLE_DATABASES"
    for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
        create_database "$db"
    done
    echo "Multiple databases created"

    # Create per-database application roles expected by the Cloud Agent's
    # bundled application.conf (appUsername = "<db>-application-user").
    # These roles are separate from the postgres superuser used for admin
    # operations — the agent uses them for its runtime connection pool.
    for db in pollux connect agent; do
        create_application_role "$db"
    done
    echo "Application roles created"
fi