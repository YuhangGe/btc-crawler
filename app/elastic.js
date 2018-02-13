const elasticsearch = require('elasticsearch');
const config = require('./config');
const logger = require('./logger');

const client =  new elasticsearch.Client({
  hosts: config.elastic.hosts,
  apiVersion: config.apiVersion,
  log: {
    level: process.env['ES_LOG_LEVEL'] || (config.logger.level === 'warn' ? 'warning' : config.logger.level)
  }
});

client.ping(err => {
  if (err) {
    logger.error(err);
  } else {
    logger.info('elasticsearch connected');
  }
});
module.exports = client;

