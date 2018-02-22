const config = require('./config');
const logger = require('./logger');
const WebSocket = require('ws');
const pako = require('pako');
const moment = require('moment-timezone');
const elastcsearch = require('./elastic');
const http = require('http');
const TIME_FORMAT = 'YYYY/MM/DD HH:mm:ss.SSS';
const symbolStatusMap = (function () {
  const map = {
    ____bootTime: moment().tz('Asia/Shanghai').format(TIME_FORMAT),
    ____webServer: {
      errorCount: 0,
      errorLastTime: null,
      errorLastMessage: null
    }
  };
  config.api.symbols.forEach(sym => {
    map[sym] = {
      AUTO_INC_ID: 0,
      crawlerId: null,
      receiveLastTickTimestamp: 0,
      receiveTickCount: 0,
      receiveTickCountPerSecond: null,
      receiveLastTickTime: null,
      recieveLastTickPrice: null,
      bulkSuccessTickCount: 0,
      bulkErrorTickCount: 0,
      bulkLastTickTime: null,
      errorCount: 0,
      errorLastTime: null,
      errorLastMessage: null
    };
  });
  return map;
})();

class Crawler {
  constructor(symbol) {
    this._symbol = symbol;
    this._id = (symbolStatusMap[symbol].AUTO_INC_ID++).toString(32);
    this._bootTime = Date.now() / 1000;
    this._tickQueue = [];
    this._bulkBusy = true;
    this._destried = false;
    this._ws = null;
    this._bulkTM = setInterval(this._onBulkInt.bind(this), config.elastic.bulkInterval);
    this._checkES();
  }
  _checkES() {
    if (this._destried) return;
    elastcsearch.client.ping(err => {
      if (this._destried) return;
      if (err) {
        logger.error(this._symbol, 'crawler', this._id, 'elasticsearch connect error, will try after 5 seconds');
        logger.error(err);
        setTimeout(() => {
          this._checkES();
        }, 2000);
      } else {
        logger.info(this._symbol, 'crawler', this._id, 'elasticsearch connected');
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
    const status = symbolStatusMap[this._symbol];
    status.receiveLastTickTimestamp = tick.timestamp;
    this._tickQueue.push(tick);
    const tm = moment(tick.timestamp).tz('Asia/Shanghai').format(TIME_FORMAT);
    status.receiveLastTickTime = tm;
    status.recieveLastTickPrice = tick.price;
    status.receiveTickCount++;
    status.receiveTickCountPerSecond = status.receiveTickCount / (tick.timestamp / 1000 - this._bootTime);
    logger.debug(this._symbol, 'crawler', this._id, 'recieve tick', tm, tick.price);
  }
  _bulk(ticks) {
    const body = [];
    ticks.forEach(tick => {
      body.push({
        index: {
          _index: `${config.elastic.indexPrefix}_${moment.utc(tick.timestamp).format('YYYYMMDD')}`,
          _type: 'price'
        }
      });
      body.push(tick);
    });
    this._bulkBusy = true;
    elastcsearch.client.bulk({
      body
    }, (err) => {
      this._bulkBusy = false;
      if (err) {
        symbolStatusMap[this._symbol].bulkErrorTickCount += ticks.length;
        this._onErr(err);
      } else {
        symbolStatusMap[this._symbol].bulkSuccessTickCount += ticks.length;
        symbolStatusMap[this._symbol].bulkLastTickTime = moment(ticks[ticks.length - 1].timestamp).tz('Asia/Shanghai').format(TIME_FORMAT);
        logger.info(this._symbol, 'crawler', this._id, 'write ticks', ticks.length);
      }
    });
  }
  _initialize() {
    if (this._destried) return;
    const ws = new WebSocket(`wss://${config.api.host}/ws`);
    ws.on('open', () => {
      if (this._destried) return;
      logger.info(this._symbol, 'crawler', this._id, 'websocket connected');
      ws.send(JSON.stringify({
        sub: `market.${this._symbol}.kline.1min`,
        id: this._id
      }));
    });
    ws.on('message', (data) => {
      if (this._destried) return;
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
            symbol: this._symbol,
            timestamp: msg.ts,
            price: msg.tick.close
          });
        }
      } catch (ex) {
        this._onErr(ex);
      }
    });
    ws.on('close', () => {
      if (this._destried) return;
      logger.info(this._symbol, 'crawler', this._id, 'websocket closed, will restart');
      this.destroy();
      setImmediate(run.bind(null, this._symbol));
    });
    ws.on('error', err => {
      if (this._destried) return;
      logger.info(this._symbol, 'crawler', this._id, 'websocket error, will restart');
      this.destroy();
      this._onErr(err);
      setImmediate(run.bind(null, this._symbol));
    });
    this._ws = ws;
  }
  _onErr(err) {
    logger.error(err);
    const status = symbolStatusMap[this._symbol];
    status.errorCount++;
    status.errorLastTime = moment().tz('Asia/Shanghai').format(TIME_FORMAT);
    status.errorLastMessage = err ? (err.message || err.toString()) : 'unkown';
  }
  destroy() {
    if (this._destried) return;
    this._destried = true;
    if (this._ws) {
      try {
        this._ws.removeAllListeners();
        this._ws.terminate();
        this._ws = null;
      } catch (ex) {
        this._onErr(ex);
      }
    }
    if (this._tickQueue.length > 0) {
      this._bulk(this._tickQueue);
    }
    this._tickQueue = null;
    clearInterval(this._bulkTM);
  }
}

const crawlersMap = {};

function run(symbol) {
  if (crawlersMap[symbol]) crawlersMap[symbol].destroy();
  crawlersMap[symbol] = new Crawler(symbol);
  symbolStatusMap[symbol].crawlerId = crawlersMap[symbol]._id;
  symbolStatusMap[symbol].receiveLastTickTimestamp = Date.now();
}

function bootstrap() {
  config.api.symbols.forEach((sym, i) => {
    setTimeout(() => {
      run(sym);
    }, i * 100);
  });
  setInterval(() => {
    config.api.symbols.forEach(sym => {
      const crawler = crawlersMap[sym];
      const st = symbolStatusMap[sym];
      const now = Date.now();
      if (!crawler || !crawler._ws) {
        st.receiveLastTickTimestamp = now;
        // not ready
        return;
      }
      // logger.debug(config.api.resetInterval, now - st.receiveLastTickTimestamp);
      if (now - st.receiveLastTickTimestamp >= config.api.resetInterval) {
        logger.info(crawler._symbol, 'crawler', crawler._id, 'will restart because of long time no tick', config.api.resetInterval, now - st.receiveLastTickTimestamp);
        run(sym);
      }
    });
  }, Math.floor(config.api.resetInterval / 2));


  http.createServer((req, res) => {
    if (req.url === '/restart') {
      logger.info('all crawlers will restart as user command');
      config.api.symbols.forEach(sym => {
        run(sym);
      });
    }
    res.end(JSON.stringify(symbolStatusMap, null, 2));
  }).on('error', err => {
    logger.error(err);
    const status = symbolStatusMap.____webServer;
    status.errorCount++;
    status.errorLastTime = moment().tz('Asia/Shanghai').format(TIME_FORMAT);
    status.errorLastMessage = err ? (err.message || err.toString()) : 'unkown';
  }).listen(config.server.port, config.server.host, () => {
    logger.info(`crawler status server listening at http://${config.server.host}:${config.server.port}`);
  });
}

elastcsearch.initialize().then(() => {
  bootstrap();
}, err => {
  logger.error(err);
  process.exit(-1);
});