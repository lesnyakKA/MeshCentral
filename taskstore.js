'use strict';

module.exports = function createTaskStore() {
    const MAX_PENDING_PER_UUID = 100;
    const MAX_RESULTS_PER_SESSION = 100;
    const PENDING_TTL_MS = 5 * 60 * 1000;

    const pendingByUuid = Object.create(null);     // uuid -> [pendingTask]
    const resultsBySession = Object.create(null);  // userId|sessionId -> [result]

    function makeSessionKey(userId, sessionId) {
        if (!userId || !sessionId) return null;
        return userId + '|' + sessionId;
    }

    function normalizeType(type) {
        if (!type) return null;
        return String(type).trim().replace(/-/g, '_').toUpperCase();
    }

    function cleanupPending(now) {
        const ts = now || Date.now();

        for (const uuid in pendingByUuid) {
            pendingByUuid[uuid] = pendingByUuid[uuid].filter(function (item) {
                return (ts - item.ts) < PENDING_TTL_MS;
            });

            if (pendingByUuid[uuid].length === 0) {
                delete pendingByUuid[uuid];
            }
        }
    }

    function registerPending(task) {
        if (!task || !task.uuid || !task.remId || !task.userId || !task.sessionId) {
            return false;
        }

        cleanupPending();

        if (!pendingByUuid[task.uuid]) {
            pendingByUuid[task.uuid] = [];
        }

        pendingByUuid[task.uuid].push({
            uuid: task.uuid,
            remId: task.remId,
            userId: task.userId,
            sessionId: task.sessionId,
            type: normalizeType(task.type || null),
            ts: task.ts || Date.now()
        });

        if (pendingByUuid[task.uuid].length > MAX_PENDING_PER_UUID) {
            pendingByUuid[task.uuid].shift();
        }

        return true;
    }

    function cancelPending(uuid, remId) {
        if (!uuid || !remId || !pendingByUuid[uuid]) {
            return false;
        }

        const originalLength = pendingByUuid[uuid].length;

        pendingByUuid[uuid] = pendingByUuid[uuid].filter(function (item) {
            return item.remId !== remId;
        });

        if (pendingByUuid[uuid].length === 0) {
            delete pendingByUuid[uuid];
        }

        return pendingByUuid[uuid] ? pendingByUuid[uuid].length !== originalLength : originalLength > 0;
    }

    function addResult(message) {
        if (!message || !message.uuid || !message.data || !message.data.remId) {
            return false;
        }

        cleanupPending();

        const uuid = message.uuid;
        const remId = String(message.data.remId);
        const resultType = normalizeType(message.data.task || null);

        const pendingList = pendingByUuid[uuid];
        if (!pendingList || pendingList.length === 0) {
            return false;
        }

        const index = pendingList.findIndex(function (item) {
            return item.remId === remId;
        });

        if (index === -1) {
            return false;
        }

        const pending = pendingList[index];
        pendingList.splice(index, 1);

        if (pendingList.length === 0) {
            delete pendingByUuid[uuid];
        }

        const sessionKey = makeSessionKey(pending.userId, pending.sessionId);
        if (!sessionKey) {
            return false;
        }

        if (!resultsBySession[sessionKey]) {
            resultsBySession[sessionKey] = [];
        }

        resultsBySession[sessionKey].push({
            uuid: uuid,
            remId: remId,
            type: resultType || pending.type || null,
            status: String(message.data.result || 'DONE').toLowerCase(),
            result: {
                task: message.data.task || null,
                remId: remId,
                result: message.data.result || null,
                error: message.data.error || null
            },
            raw: message,
            ts: Date.now()
        });

        if (resultsBySession[sessionKey].length > MAX_RESULTS_PER_SESSION) {
            resultsBySession[sessionKey].shift();
        }

        return true;
    }

    function get(userId, sessionId, after) {
        const sessionKey = makeSessionKey(userId, sessionId);
        if (!sessionKey) {
            return [];
        }

        const list = resultsBySession[sessionKey] || [];
        if (!after) {
            return list.slice();
        }

        return list.filter(function (item) {
            return item.ts > after;
        });
    }

    function clear(userId, sessionId) {
        const sessionKey = makeSessionKey(userId, sessionId);
        if (!sessionKey) {
            return;
        }

        delete resultsBySession[sessionKey];
    }

    return {
        registerPending: registerPending,
        cancelPending: cancelPending,
        addResult: addResult,
        get: get,
        clear: clear
    };
};