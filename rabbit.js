'use strict';

const amqp = require('amqplib');

let connection = null;
let channel = null;

const AMQP_URL = process.env.AMQP_URL || 'amqp://rabbit:h1ZIaAUG2nA9oJwNxwsweNcQOqiIaQO5S5JsJKjZJ6LAFkvbqM3EVDx5zlFqQv8@178.249.71.201:9501/%2F';
// const AMQP_URL = process.env.AMQP_URL || 'amqp://start:324012@193.233.231.126:5672/%2F';

const TASK_QUEUE = 'kab2hub';
const RESULT_QUEUE = 'hub2vnc';

async function getChannel() {
    if (channel) return channel;

    connection = await amqp.connect(AMQP_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(TASK_QUEUE, {
        durable: true,
        arguments: {
            'x-max-priority': 2
        }
    });

    await channel.assertQueue(RESULT_QUEUE, {
        durable: true,
        arguments: {
            'x-max-priority': 2
        }
    });

    connection.on('error', function (err) {
        console.error('Rabbit connection error:', err.message);
        connection = null;
        channel = null;
    });

    connection.on('close', function () {
        console.error('Rabbit connection closed');
        connection = null;
        channel = null;
    });

    return channel;
}

async function sendDeviceTask(payload, priority) {
    const ch = await getChannel();
    const body = Buffer.from(JSON.stringify(payload));

    ch.sendToQueue(TASK_QUEUE, body, {
        persistent: true,
        contentType: 'application/json',
        priority: typeof priority === 'number' ? priority : undefined
    });
}

async function sendDeviceTaskResult(payload, priority) {
    const ch = await getChannel();
    const body = Buffer.from(JSON.stringify(payload));

    ch.sendToQueue(RESULT_QUEUE, body, {
        persistent: true,
        contentType: 'application/json',
        priority: typeof priority === 'number' ? priority : undefined
    });
}

async function startDeviceTaskConsumer(onMessage) {
    const ch = await getChannel();

    await ch.consume(TASK_QUEUE, async function (msg) {
        if (!msg) return;

        try {
            const data = JSON.parse(msg.content.toString());
            await onMessage(data);
            ch.ack(msg);
        } catch (e) {
            console.error('Task consumer error:', e);
            ch.nack(msg, false, false);
        }
    });
}

async function startResultConsumer(onMessage) {
    const ch = await getChannel();

    await ch.consume(RESULT_QUEUE, async function (msg) {
        if (!msg) return;

        try {
            const data = JSON.parse(msg.content.toString());
            await onMessage(data);
            ch.ack(msg);
        } catch (e) {
            console.error('Result consumer error:', e);
            ch.nack(msg, false, false);
        }
    });
}

module.exports = {
    sendDeviceTask,
    sendDeviceTaskResult,
    startDeviceTaskConsumer,
    startResultConsumer
};