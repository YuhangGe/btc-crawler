FROM node:alpine
MAINTAINER Yuhang Ge

RUN echo 'http://nl.alpinelinux.org/alpine/edge/main' >> /etc/apk/repositories \
    && apk add -U curl libsodium python \
    && curl -sSL https://bootstrap.pypa.io/get-pip.py | python \
    && pip install shadowsocks \
    && apk del curl \
    && rm -rf /var/cache/apk/*

ENV SS_SERVER_HOST 0.0.0.0
ENV SS_SERVER_PORT 25607
ENV SS_LOCAL_PORT 1080
ENV SS_LOCAL_ADDR 0.0.0.0
ENV SS_PASSWORD default
ENV SS_METHOD rc4-md5
ENV SS_TIMEOUT 300

EXPOSE $SS_LOCAL_PORT


COPY package.json /opt/btc-crawler/package.json
COPY ./app /opt/btc-crawler/app

WORKDIR /opt/btc-crawler
RUN npm install --production
EXPOSE 8066
CMD npm run docker