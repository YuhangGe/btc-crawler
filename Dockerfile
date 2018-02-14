FROM node:alpine
MAINTAINER Yuhang Ge
COPY package.json /opt/btc-crawler/package.json
COPY ./app /opt/btc-crawler/app

WORKDIR /opt/btc-crawler
RUN npm install
EXPOSE 8066
CMD ["node", "app/index.js"]