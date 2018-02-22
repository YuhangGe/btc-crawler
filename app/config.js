const pEnv = process.env;
const logLevel = pEnv.LOG_LEVEL || (pEnv.NODE_ENV === 'production' ? 'info' : 'debug');
const esHosts = pEnv.ES_HOSTS || '172.16.150.29:9200';
const bulkInterval = Number(pEnv.BULK_INTERVAL || (pEnv.NODE_ENV === 'production' ? 3 * 60 * 1000 : 5 * 1000));
const resetInterval = Number(pEnv.RESET_INTERVAL || 30 * 1000);
const symbols = (
  pEnv['SYMBOLS']
  // || 'letusdt'
  || 'btcusdt,bchusdt,ethusdt,etcusdt,ltcusdt,eosusdt,xrpusdt,omgusdt,dashusdt,zecusdt,nasusdt,ruffusdt,zilusdt,dtausdt,letusdt,htusdt,thetausdt,hsrusdt,qtumusdt,sntusdt,iostusdt,neousdt,storjusdt,gntusdt,cvcusdt,smtusdt,venusdt,elfusdt,xemusdt'
).split(/\s*,\s*/);

const config = {
  server: {
    host: '0.0.0.0',
    port: 8066
  },
  logger: {
    level: logLevel
  },
  api: {
    resetInterval, 
    host: 'api.huobipro.com',
    symbols
  },
  elastic: {
    indexPrefix: pEnv.INDEX_PREFIX || 'huobi',
    bulkInterval,   
    hosts: esHosts.split(','),
    apiVersion: '6'
  }
};

module.exports = config;
