const config = require('./config');
const logger = require('./logger');
const WebSocket = require('ws');
const pako = require('pako');
const moment = require('moment-timezone');
const elastcsearch = require('./elastic');
const http = require('http');
const TIME_FORMAT = 'YYYY/MM/DD HH:mm:ss.SSS';
let autoId = 0;
let receiveLastTickTimestamp = 0;
const status = {
  crawlerId: null,
  receiveTickCount: 0,
  receiveTickCountPerSecond: null,
  receiveLastTickTime: null,
  recieveLastTickPrice: null,
  bulkSuccessTickCount: 0,
  bulkErrorTickCount: 0,
  bulkLastTickTime: null,  
  sysBootTime: moment().tz('Asia/Shanghai').format(TIME_FORMAT),
  sysErrorCount: 0,
  sysLastErrorTime: null,
  sysLastErrorMessage: null
};

class BtcCrawler {
  constructor() {
    this._id = (autoId++).toString(32);
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
        logger.error('crawler', this._id, 'elasticsearch connect error, will try after 5 seconds');
        logger.error(err);
        setTimeout(() => {
          this._checkES();
        }, 5000);
      } else {
        logger.info('crawler', this._id, 'elasticsearch connected');
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
    // receiveLastTickTimestamp = tick.timestamp;
    this._tickQueue.push(tick);
    const tm = moment(tick.timestamp).tz('Asia/Shanghai').format(TIME_FORMAT);
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
        _onSysErr(err);
      } else {
        status.bulkSuccessTickCount += ticks.length;
        status.bulkLastTickTime = moment(ticks[ticks.length - 1].timestamp).tz('Asia/Shanghai').format(TIME_FORMAT);
        logger.info('crawler', this._id, 'write ticks', ticks.length);
      }
    });
  }
  _initialize() {
    const ws = new WebSocket(`wss://${config.api.host}/ws`);
    ws.on('open', () => {
      logger.info('crawler', this._id, 'websocket connected');
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
        _onSysErr(ex);
      }
    });
    ws.on('close', () => {
      logger.info('crawler', this._id, 'websocket closed, will restart');
      this.destroy();
      setImmediate(run);
    });
    ws.on('error', err => {
      logger.info('crawler', this._id, 'websocket error, will restart');      
      _onSysErr(err);
      this.destroy();
      setImmediate(run);
    });
    this._ws = ws;
  }
  destroy() {
    if (this._destried) return;
    this._destried = true;
    if (this._ws) {
      try {
        this._ws.removeAllListeners();
        this._ws.close();
        this._ws = null;
      } catch(ex) {
        _onSysErr(ex);
      }
    }
    if (this._tickQueue.length > 0) {
      this._bulk(this._tickQueue);
    }
    this._tickQueue = null;    
    clearInterval(this._bulkTM);
  }
}

function _onSysErr(err) {
  logger.error(err);
  status.sysErrorCount++;
  status.sysLastErrorTime = moment().tz('Asia/Shanghai').format(TIME_FORMAT);
  status.sysLastErrorMessage = err ? (err.message || err.toString()) : 'unkown';
}

let crawler = null;
function run() {
  if (crawler) crawler.destroy();
  crawler = new BtcCrawler();
}
/* bootstrap */
run();
setInterval(() => {
  if (receiveLastTickTimestamp === null) return;
  const now = Date.now();
  logger.debug(config.api.resetInterval, now - receiveLastTickTimestamp);
  if (now - receiveLastTickTimestamp >= config.api.resetInterval) {
    logger.info('crawler', crawler._id, 'will restart because of long time no tick');
    run();
  }
}, Math.floor(config.api.resetInterval / 2));


http.createServer((req, res) => {
  if (req.url === '/restart') {
    logger.info('crawler', crawler._id, 'will restart as user command');
    run();
  }
  status.crawlerId = crawler._id;
  res.end(JSON.stringify(status, null, 2));  
}).on('error', err => {
  _onSysErr(err);
}).listen(config.server.port, config.server.host, () => {
  logger.info(`crawler status server listening at http://${config.server.host}:${config.server.port}`);
});
