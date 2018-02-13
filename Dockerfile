FROM node:alpine
MAINTAINER Yuhang Ge
COPY package.json /opt/btc-crawler/package.json
COPY ./app /opt/btc-crawler/app

WORKDIR /opt/btc-crawler
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
RUN npm install
EXPOSE 8066
CMD ["node", "app/index.js"]