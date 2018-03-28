const pEnv = process.env;
const logLevel = pEnv.LOG_LEVEL || (pEnv.NODE_ENV === 'production' ? 'info' : 'debug');
const esHosts = pEnv.ES_HOSTS || '172.16.150.29:9200';
const bulkInterval = Number(pEnv.BULK_INTERVAL || (pEnv.NODE_ENV === 'production' ? 3 * 60 * 1000 : 5 * 1000));
const resetInterval = Number(pEnv.RESET_INTERVAL || 30 * 1000);
const backupInterval = Number(pEnv.BACKUP_INTERVAL || (pEnv.NODE_ENV === 'production' ? 30 * 60 * 1000 : 30 * 1000));

const symbols = (
  pEnv['SYMBOLS']
  // || 'letusdt'
  || 'btcusdt,bchusdt,ethusdt,etcusdt,ltcusdt,eosusdt,xrpusdt,omgusdt,dashusdt,zecusdt,nasusdt,ruffusdt,zilusdt,dtausdt,letusdt,htusdt,thetausdt,hsrusdt,qtumusdt,sntusdt,iostusdt,neousdt,storjusdt,gntusdt,cvcusdt,smtusdt,venusdt,elfusdt,xemusdt'
).split(/\s*,\s*/);

const config = {
  server: {
    host: '0.0.0.0',
    proxy: pEnv['SS_PROXY'] || 'socks://127.0.0.1:1080',
    port: 8066
  },
  logger: {
    level: logLevel
  },
  api: {
    backupInterval,
    resetInterval, 
    host: 'api.huobipro.com',
    symbols
  },
  elastic: {
    indexPrefix: pEnv.INDEX_PREFIX || 'huobi',
    bulkInterval,   
    hosts: esHosts.split(','),
    apiVersion: '6'
  },
  mailer: {
    transportOptions: pEnv.MAIL_TRANSPORT_OPTIONS ? JSON.parse(pEnv.MAIL_TRANSPORT_OPTIONS) : {
      host: 'smtp.qq.com',
      secureConnection: true,
      port: 465,
      secure: true,
      auth: {
        user: pEnv.MAIL_USER,
        pass: pEnv.MAIL_PASS
      }
    },
    sendOptions: pEnv.MAIL_SEND_OPTIONS ? JSON.parse(pEnv.MAIL_SEND_OPTIONS) : {
      from: `"${pEnv.MAIL_FROM || 'Crawler'}" <${pEnv.MAIL_USER}>`,
      to: pEnv.MAIL_TO
    }
  }
};

module.exports = config;
