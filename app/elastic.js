const elasticsearch = require('elasticsearch');
const config = require('./config');

const client =  new elasticsearch.Client({
  hosts: config.elastic.hosts,
  apiVersion: config.apiVersion,
  log: {
    level: process.env['ES_LOG_LEVEL'] || (config.logger.level === 'warn' ? 'warning' : config.logger.level)
  }
});

module.exports = client;

