
nohup sslocal -s "$SS_SERVER_HOST" -p "$SS_SERVER_PORT" -l "$SS_LOCAL_PORT" -b "$SS_LOCAL_ADDR" -k "$SS_PASSWORD" -m "$SS_METHOD" -t "$SS_TIMEOUT" -vv

node /opt/btc-crawler/app/index.js