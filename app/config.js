const pEnv = process.env;
const logLevel = pEnv.LOG_LEVEL || (pEnv.NODE_ENV === 'production' ? 'error' : 'debug');
const esHosts = pEnv.ES_HOSTS || (pEnv.NODE_ENV === 'production' ? '127.0.0.1:9200' : '172.16.150.29:9200');
const bulkInterval = Number(pEnv.BULK_INTERVAL || (pEnv.NODE_ENV === 'production' ? 5 * 60 * 1000 : 5 * 1000));

const config = {
  server: {
    host: '127.0.0.1',
    port: 8066
  },
  logger: {
    level: logLevel
  },
  api: {
    host: 'api.huobipro.com'
  },
  elastic: {
    bulkInterval,   
    hosts: esHosts.split(','),
    apiVersion: '6'
  }
};

module.exports = config;
