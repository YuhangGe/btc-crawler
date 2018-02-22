const elasticsearch = require('elasticsearch');
const config = require('./config');
const logger = require('./logger');

const client = new elasticsearch.Client({
  hosts: config.elastic.hosts,
  apiVersion: config.apiVersion,
  log: {
    level: process.env['ES_LOG_LEVEL'] || (config.logger.level === 'warn' ? 'warning' : config.logger.level)
  }
});

async function createTpl() {
  const isTplExists = await client.indices.existsTemplate({
    name: `${config.elastic.indexPrefix}_tpl`
  });
  if (isTplExists) {
    logger.info('Elasticsearch template is already exists');
    return;
  }
  const res = await client.indices.putTemplate({
    name: `${config.elastic.indexPrefix}_tpl`,
    body: {
      index_patterns: [`${config.elastic.indexPrefix}_*`],
      mappings: {
        price: {
          properties: {
            symbol: {
              type: 'keyword'
            },
            timestamp: {
              type: 'date'
            },
            price: {
              type: 'float'
            }
          }
        }
      }
    }
  });
  logger.info(JSON.stringify(res));
}
async function initialize() {
  for(let tries = 1; tries <= 20; tries++) {
    try {
      await createTpl();
      return;
    } catch(ex) {
      if (tries >= 10) {
        throw ex;
      }
      logger.error('elasticsearch create template fail, will try again');
      logger.error(ex);
    }
    await new Promise(res => setTimeout(res, 2000));
  }
}

module.exports = {
  initialize,
  client
};