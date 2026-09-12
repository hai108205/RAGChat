#!/usr/bin/env bash
# One-shot replica set bootstrap for MongoDB single-node Docker setup.
# Waits for mongod on 'mongo' container, bootstraps rs0 and waits
# for primary election — safe to call multiple times (idempotent).

set -euo pipefail

MONGO_HOST="mongo:27017"

wait_for_mongod() {
    echo "[bootstrap] Waiting for mongod at $MONGO_HOST..."
    local retries=120
    while ! mongosh --quiet --host "$MONGO_HOST" --eval 'db.adminCommand("ping")' 2>/dev/null; do
        retries=$((retries - 1))
        if [ $retries -le 0 ]; then
            echo "[bootstrap] TIMEOUT waiting for mongod" >&2
            exit 1
        fi
        sleep 1
    done
    sleep 2
}

bootstrap_replicaset() {
    echo "[bootstrap] Initiating replica set rs0..."
    mongosh --quiet "mongodb://$MONGO_HOST/admin" <<'JSEOF'
try {
    var s = rs.status();
    print('[bootstrap] rs0 already running (' + s.set + '), skipping');
    quit(0);
} catch(e) {
    // rs.status() fails if not initiated or during election
}
var r = rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongo:27017' }]
});
if (!r.ok) {
    if (r.errmsg && r.errmsg.indexOf('already initiated') !== -1) {
        print('[bootstrap] rs0 already initiated by another process');
    } else {
        printjson(r);
        print('[bootstrap] Init failed, retrying after 5s...');
        sleep(5000);
        r = rs.initiate({
            _id: 'rs0',
            members: [{ _id: 0, host: 'mongo:27017' }]
        });
        if (!r.ok) {
            printjson(r);
            print('[bootstrap] Retry failed');
            quit(1);
        }
        print('[bootstrap] rs0 initiated on retry');
    }
} else {
    print('[bootstrap] rs0 initiated successfully');
}
JSEOF
}

wait_for_primary() {
    echo "[bootstrap] Waiting for primary election..."
    local retries=60
    while [ $retries -gt 0 ]; do
        local result
        result=$(mongosh --quiet "mongodb://$MONGO_HOST/admin" --eval "
try {
    var s = rs.status();
    var p = s.members.find(function(m){ return m.stateStr === 'PRIMARY'; });
    p ? 'yes' : 'no';
} catch(e) { 'no'; }
" 2>/dev/null)
        if [ "$result" = "yes" ]; then
            echo "[bootstrap] Primary elected!"
            return 0
        fi
        retries=$((retries - 1))
        sleep 2
    done
    echo "[bootstrap] WARNING: Primary not elected within timeout"
    return 0  # Don't block stack startup
}

wait_for_mongod
bootstrap_replicaset
wait_for_primary
echo "[bootstrap] Complete."
