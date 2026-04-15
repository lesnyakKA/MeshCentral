const amqp = require('amqplib');

let connection = null;
let channel = null;

async function getChannel() {
    if (channel) return channel;

    connection = await amqp.connect('amqp://guest:guest@localhost:5672');
    channel = await connection.createChannel();

    await channel.assertQueue('device_tasks', { durable: true });

    connection.on('error', (err) => {
        console.error('Rabbit connection error:', err.message);
        connection = null;
        channel = null;
    });

    connection.on('close', () => {
        console.error('Rabbit connection closed');
        connection = null;
        channel = null;
    });

    return channel;
}

async function sendDeviceTask(payload) {
    const ch = await getChannel();
    const body = Buffer.from(JSON.stringify(payload));

    ch.sendToQueue('device_tasks', body, {
        persistent: true,
        contentType: 'application/json'
    });
}

module.exports = {
    sendDeviceTask
};