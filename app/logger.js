const config = require('./config');
const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4
};
const LEVEL_NAMES = ['debug', 'info', 'warn', 'error', 'none'];
const LEVEL_PREFIX = LEVEL_NAMES.map(n => `[${n.toUpperCase()}]`);

class SimpleLogger {
  constructor() {
    this._level = LEVELS[config.logger.level];
  }
  get level() {
    return LEVEL_NAMES[this._level];
  }
  set level(level) {
    if (!level || !LEVELS.hasOwnProperty(level.toLowerCase())) {
      throw new Error('Unsupport log level');
    }
    this._level = LEVELS[level.toLowerCase()];
  }
  access(ctx, startTime) {
    console.log(
      '[ACCESS]',
      ctx.method,
      ctx.originalUrl,
      ctx.status || 501,
      ctx.response.length || '-',       
      ctx.ip,
      ctx.request.length || '-',
      ctx.user ? ctx.user.id : '-',
      Date.now() - startTime
    );
  }
  _log(level, ...args) {
    if (level >= this._level) {
      console.log(LEVEL_PREFIX[level], ...args);
    }
  }
  error(...args) {
    if (this._level <= LEVELS.error) {
      console.error(...args);
    }
  }
  debug(...args) {
    this._log(LEVELS.debug, ...args);
  }
  log(...args) {
    this._log(LEVELS.info, ...args);
  }
  info(...args) {
    this._log(LEVELS.info, ...args);    
  }
  warn(...args) {
    this._log(LEVELS.warn, ...args);    
  }
}

module.exports = new SimpleLogger();
