const path = require('path');
const fs = require('fs');
const exec = require('child_process').execSync;
const logPath = path.join(__dirname, 'run', 'logs');

const PROD_APP = {
  name      : 'btc-crawler',
  merge_logs: true,
  log_date_format : "YYYY-MM-DD HH:mm:ss.SSS Z",
  out_file  : path.join(logPath, `btc-crawler.out.log`),
  error_file: path.join(logPath, `btc-crawler.err.log`),
  pid_file  : path.join(logPath, `btc-crawler.pid`),
  script    : 'app/index.js',
  instances : 10,
  exec_mode : 'cluster',
  env : {
    NODE_APP_INSTANCES_COUNT: '10',
    NODE_ENV: 'production'
  }
};
/*
 * DEV_APP：本地开发 app
 */
const DEV_APP = {
  name: 'btc-crawler-dev',
  script: 'app/index.js',
  autorestart: false,
  watch: true,
  ignore_watch: [
    'node_modules',
    '.idea',
    '.git',
    '.tmp',
    '.vscode',
    'run',
    'dist',
    'script'
  ],
  env: {
    NODE_APP_INSTANCES_COUNT: '1',
    NODE_APP_INSTANCE: '0',
    NODE_ENV: 'development'
  }
};

module.exports = {
  apps : [ PROD_APP, DEV_APP ]
};
