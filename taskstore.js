'use strict';

module.exports = function createTaskStore() {
    const MAX_PENDING_PER_UUID = 20;
    const MAX_RESULTS_PER_UUID = 100;
    const PENDING_TTL_MS = 5 * 60 * 1000;

    const pendingByUuid = Object.create(null); // uuid -> [pendingTask]
    const resultsByUuid = Object.create(null); // uuid -> [storedResult]

    function normalizeType(type) {
        if (!type) return null;
        return String(type).trim().replace(/-/g, '_').toUpperCase();
    }

    function mapResultStatus(result) {
        const value = String(result || '').trim().toUpperCase();
        if (value === 'ERROR') return 'error';
        if (value === 'WARNING') return 'warning';
        if (value === 'SUCCESS') return 'done';
        return 'done';
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
        if (!task || !task.uuid || !task.userId || !task.sessionId || !task.type) {
            return false;
        }

        cleanupPending();

        const uuid = task.uuid;
        const type = normalizeType(task.type);

        if (!pendingByUuid[uuid]) {
            pendingByUuid[uuid] = [];
        }

        const existsSameType = pendingByUuid[uuid].some(function (item) {
            return normalizeType(item.type) === type;
        });

        if (existsSameType) {
            return false;
        }

        pendingByUuid[uuid].push({
            uuid: uuid,
            remId: task.remId || null,
            userId: task.userId,
            sessionId: task.sessionId,
            type: type,
            ts: task.ts || Date.now()
        });

        if (pendingByUuid[uuid].length > MAX_PENDING_PER_UUID) {
            pendingByUuid[uuid].shift();
        }

        return true;
    }

    function addResult(message) {
        if (!message || !message.uuid || !message.data || !Array.isArray(message.data.task_results)) {
            return false;
        }

        cleanupPending();

        const uuid = message.uuid;
        const pendingList = pendingByUuid[uuid];
        if (!pendingList || pendingList.length === 0) {
            return false;
        }

        let accepted = false;

        message.data.task_results.forEach(function (taskResult) {
            const type = normalizeType(taskResult.task_type);
            if (!type) {
                return;
            }

            const index = pendingList.findIndex(function (item) {
                return normalizeType(item.type) === type;
            });

            if (index === -1) {
                return;
            }

            const pending = pendingList[index];
            pendingList.splice(index, 1);

            if (!resultsByUuid[uuid]) {
                resultsByUuid[uuid] = [];
            }

            resultsByUuid[uuid].push({
                uuid: uuid,
                remId: pending.remId || null,
                type: type,
                status: mapResultStatus(taskResult.result),
                result: {
                    task_id: taskResult.task_id,
                    task_type: taskResult.task_type,
                    result: taskResult.result,
                    message: taskResult.message || null,
                    data: taskResult.data || null
                },
                userId: pending.userId,
                sessionId: pending.sessionId,
                ts: Date.now()
            });

            if (resultsByUuid[uuid].length > MAX_RESULTS_PER_UUID) {
                resultsByUuid[uuid].shift();
            }

            accepted = true;
        });

        if (pendingList.length === 0) {
            delete pendingByUuid[uuid];
        }

        return accepted;
    }

    function get(userId, sessionId, after) {
        const afterTs = Number(after) || 0;
        const out = [];

        for (const uuid in resultsByUuid) {
            const items = resultsByUuid[uuid];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];

                if (item.userId !== userId || item.sessionId !== sessionId) {
                    continue;
                }

                if (item.ts <= afterTs) {
                    continue;
                }

                out.push({
                    uuid: item.uuid,
                    remId: item.remId,
                    type: item.type,
                    status: item.status,
                    result: item.result,
                    ts: item.ts
                });
            }
        }

        out.sort(function (a, b) {
            return a.ts - b.ts;
        });

        return out;
    }

    function clear(userId, sessionId) {
        for (const uuid in resultsByUuid) {
            resultsByUuid[uuid] = resultsByUuid[uuid].filter(function (item) {
                return !(item.userId === userId && item.sessionId === sessionId);
            });

            if (resultsByUuid[uuid].length === 0) {
                delete resultsByUuid[uuid];
            }
        }
    }

    function cancelPending(uuid, type) {
        if (!uuid || !type || !pendingByUuid[uuid]) {
            return false;
        }

        const normalizedType = normalizeType(type);
        const originalLength = pendingByUuid[uuid].length;

        pendingByUuid[uuid] = pendingByUuid[uuid].filter(function (item) {
            return normalizeType(item.type) !== normalizedType;
        });

        if (pendingByUuid[uuid].length === 0) {
            delete pendingByUuid[uuid];
        }

        return pendingByUuid[uuid] ? pendingByUuid[uuid].length !== originalLength : originalLength > 0;
    }

    return {
        registerPending: registerPending,
        cancelPending: cancelPending,
        addResult: addResult,
        get: get,
        clear: clear
    };
};