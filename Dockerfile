FROM node:alpine
MAINTAINER Yuhang Ge
COPY package.json /opt/btc-crawler/package.json
COPY ./app /opt/btc-crawler/app

WORKDIR /opt/btc-crawler
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata
RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime
RUN npm install
EXPOSE 8066
CMD ["node", "app/index.js"]