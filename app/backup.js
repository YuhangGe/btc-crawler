const zlib = require('zlib');
const moment = require('moment-timezone');
const config = require('./config');
const elasticsearch = require('./elastic');
const logger = require('./logger');
const TIME_FORMAT = 'YYYY/MM/DD HH:mm:ss.SSS';
const status = {
  progress: null,
  errorCount: 0,
  errorLastTime: null,
  errorLastMessage: null
};

let busy = false;
let preBackupDay = null;

function run(checkDay) {
  if (!checkDay)
    checkDay = moment.utc().subtract(1, 'd').format('YYYYMMDD');
  if (checkDay === preBackupDay) {
    logger.debug('Backup service nothing todo', checkDay, preBackupDay);    
    return;
  }
  logger.info('Backup service do backup for', checkDay);
  backup(checkDay).catch(_onErr);
}

async function backup(day) {
  try {
    busy = true;
    const allHits = await fetchData(day);
    logger.debug('Backup service got', allHits.length, 'hits');
    const content = await gzip(new Buffer(allHits.join('\n')));
    process.env.BACKUP_TO_FILE && require('fs').writeFileSync(require('path').resolve(__dirname, `../run/${day}.csv.gz`), content);
    await sendMail(day, content);
    busy = false;
    preBackupDay = day;
    logger.info('Backup for huobipro.com, kline,', day, 'success.');   
  } catch(ex) {
    busy = false;
    _onErr(ex);
  }
}
backup.status = status;

function _add(arr, hit) {
  arr.push(`${hit.timestamp},${hit.symbol},${hit.price}`);
}
async function fetchData(day) {
  const allHits = [];
  let result = await elasticsearch.client.search({
    index: `${config.elastic.indexPrefix}_${day}`,
    scroll: '1m',
    size: 6000,
    sort: '_doc'
  });
  logger.debug('fetch', result.hits.hits.length, 'hits with scroll id', result._scroll_id);
  result.hits.hits.forEach(hit => _add(allHits, hit._source));
  status.progress = `${allHits.length}/${result.hits.total}(${(allHits.length / result.hits.total * 10000 | 0) / 100}%)`;
  let tries = 0;
  let progress = allHits.length / result.hits.total * 10 | 0;
  logger.debug(status.progress);
  while (allHits.length < result.hits.total) {
    logger.debug('call scroll with id', result._scroll_id);
    result = await elasticsearch.client.scroll({
      scrollId: result._scroll_id,
      scroll: '1m'
    });
    result.hits.hits.forEach(hit => _add(allHits, hit._source));
    const newProgress = allHits.length / result.hits.total * 10 | 0;
    if (newProgress > progress) {
      logger.info('Backup fetch process', newProgress * 10, '%');
      progress = newProgress;
    }
    status.progress = `${allHits.length}/${result.hits.total}(${(allHits.length / result.hits.total * 10000 | 0) / 100}%)`;
    logger.debug(status.progress);
    if ((++tries) >= 1000) {
      // 防止未知异常导致的死循环。
      throw new Error('loop tries overflow.');
    }
  }
  logger.info('Backup fetch finish,', allHits.length, 'hits total.');
  return allHits;  
}

function gzip(buf) {
  return new Promise((resolve, reject) => {
    zlib.gzip(buf, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}
function sendMail(day, content) {
  return new Promise((resolve, reject) => {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport(config.mailer.transportOptions);
    const subject = `Crawler data backup for huobipro.com, kline, ${day}`;
    const mailOptions = Object.assign({
      subject: subject,
      html: `<h1>${subject}</h1><p>csv header: timestamp,symbol,price</p>`,
      attachments: [{
        filename: `${config.elastic.indexPrefix}_${day}.csv.gz`,
        content
      }]
    }, config.mailer.sendOptions);
    logger.info('Backup sending mail to', mailOptions.to);
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) return reject(error);
      logger.info('Backup send email to', mailOptions.to, 'success.');
      resolve(info.messageId);
    });
  });
}
function _onErr(err) {
  status.errorCount++;
  status.errorLastTime = moment().tz('Asia/Shanghai').format(TIME_FORMAT);
  status.errorLastMessage = err ? (err.message || err.toString()) : 'unkown';
  logger.error('Backup service error');
  logger.error(err);
}
process.env.BACKUP_ENABLE !== 'false' && setInterval(() => {
  if (busy) {
    logger.info('Backup service skip interval as busy');
    return;
  }
  run();
}, config.api.backupInterval);

process.env.BACKUP_ENABLE !== 'false' && run(process.env.BACKUP_DAY || null);

module.exports = backup;