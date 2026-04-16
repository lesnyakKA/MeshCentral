'use strict';

const store = Object.create(null);

function makeKey(userId, sessionId) {
    return userId + '|' + sessionId;
}

function add(result) {
    if (!result || !result.user || !result.sessionId) return;

    const key = makeKey(result.user, result.sessionId);
    if (!store[key]) { store[key] = []; }

    store[key].push(result);

    if (store[key].length > 100) {
        store[key].shift();
    }
}

function get(userId, sessionId, after) {
    const key = makeKey(userId, sessionId);
    const items = store[key] || [];
    const ts = Number(after || 0);

    return items.filter(function (x) {
        return Number(x.ts || 0) > ts;
    });
}

function clear(userId, sessionId) {
    delete store[makeKey(userId, sessionId)];
}

module.exports = {
    add,
    get,
    clear
};