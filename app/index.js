const config = require('./config');
const logger = require('./logger');
const WebSocket = require('ws');
const pako = require('pako');
const moment = require('moment');
const elastcsearch = require('./elastic');
const http = require('http');
const TIME_FORMAT = 'YYYY/MM/DD HH:mm:ss';
const status = {
  receiveTickCount: 0,
  receiveTickCountPerSecond: null,
  receiveLastTickTime: null,
  recieveLastTickPrice: null,
  bulkSuccessTickCount: 0,
  bulkErrorTickCount: 0,
  bulkLastTickTime: null,  
  sysBootTime: moment().format(TIME_FORMAT),
  sysErrorCount: 0,
  sysLastErrorTime: null,
  sysLastErrorMessage: null
};

class BtcCrawler {
  constructor() {
    this._bootTime = Date.now() / 1000;
    this._tickQueue = [];
    this._bulkBusy = true;
    this._destried = false;
    this._ws = null;
    this._bulkTM = setInterval(this._onBulkInt.bind(this), config.elastic.bulkInterval);
    this._checkES();
  }
  _checkES() {
    elastcsearch.ping(err => {
      if (err) {
        logger.error('elasticsearch connect error, will try after 10 seconds');
        logger.error(err);
        setTimeout(() => {
          this._checkES();
        }, 10000);
      } else {
        logger.info('elasticsearch connected');
        this._bulkBusy = false;
        this._initialize();
      }
    });
  }
  _onBulkInt() {
    if (this._destried) {
      clearInterval(this._bulkTM);
      return;
    }
    if (this._bulkBusy || this._tickQueue.length === 0) return;
    const ticks = this._tickQueue;
    this._tickQueue = [];
    this._bulk(ticks);
  }
  _pushTick(tick) {
    this._tickQueue.push(tick);
    const tm = moment(tick.timestamp).format('YYYY/MM/DD HH:mm:ss.SSS');
    status.receiveLastTickTime = tm;
    status.recieveLastTickPrice = tick.price;
    status.receiveTickCount++;    
    status.receiveTickCountPerSecond = status.receiveTickCount / (tick.timestamp / 1000 - this._bootTime);
    logger.debug('recieve tick', tm, tick.price);
  }
  _bulk(ticks) {
    const body = [];
    ticks.forEach(tick => {
      body.push({
        index: {
          _index: `huobi-${moment.utc(tick.timestamp).format('YYYYMMDD')}`,
          _type: 'btcusdt'
        }
      });
      body.push(tick);
    });
    this._bulkBusy = true;
    elastcsearch.bulk({
      body 
    }, (err) => {
      this._bulkBusy = false;
      if (err) {
        status.bulkErrorTickCount += ticks.length;
        this._onSysErr(err);
      } else {
        status.bulkSuccessTickCount += ticks.length;
        status.bulkLastTickTime = moment(ticks[ticks.length - 1].timestamp).format('YYYY/MM/DD HH:mm:ss.SSS');
        logger.info('write ticks', ticks.length);
      }
    });
  }
  _onSysErr(err) {
    logger.error(err);
    status.sysErrorCount++;
    status.sysLastErrorTime = moment().format(TIME_FORMAT);
    status.sysLastErrorMessage = err ? (err.message || err.toString()) : 'unkown';
  }
  _initialize() {
    const ws = new WebSocket(`wss://${config.api.host}/ws`);
    ws.on('open', () => {
      logger.info('websocket connected');
      ws.send(JSON.stringify({
        sub: 'market.btcusdt.kline.1min',
        id: 'btcusdt'
      }));
    });
    ws.on('message', (data) => {
      try {
        const text = pako.inflate(data, {
          to: 'string'
        });
        const msg = JSON.parse(text);
        if (msg.ping) {
          ws.send(JSON.stringify({
            pong: msg.ping
          }));
        } else if (msg.tick) {
          this._pushTick({
            timestamp: msg.ts,
            price: msg.tick.close
          });
        }
      } catch(ex) {
        this._onSysErr(ex);
      }
    });
    ws.on('close', () => {
      logger.info('websocket closed');
      this.destroy();
    });
    ws.on('error', err => {
      this._onSysErr(err);
      this.destroy();
    });
    this._ws = ws;
  }
  destroy() {
    if (this._destried) return;
    this._destried = true;    
    if (this._ws) {
      this._ws.removeAllListeners();
      this._ws.close();
      this._ws = null;
    }
    if (this._tickQueue.length > 0) {
      this._bulk(this._tickQueue);
    }
    this._tickQueue = null;
    clearInterval(this._bulkTM);
    logger.info('will restart after 3 seconds');
    setTimeout(run, 3000);
  }
}



let crawler = null;
function run() {
  if (crawler) crawler.destroy();
  crawler = new BtcCrawler();
}
/* bootstrap */
run();

http.createServer((req, res) => {
  res.end(JSON.stringify(status, null, 2));
}).listen(config.server.port, config.server.host, () => {
  logger.info(`crawler status server listening at http://${config.server.host}:${config.server.port}`);
});
