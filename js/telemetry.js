(function (global) {
    const MAX_QUEUE_SIZE = 20;
    const queue = [];

    async function getSettingsSafe() {
        try {
            if (!global.ParamExtSettings) {
                return null;
            }
            return await global.ParamExtSettings.getSettings();
        } catch (_) {
            return null;
        }
    }

    function normalizeBaseUrl(raw) {
        if (!raw || typeof raw !== 'string') {
            return '';
        }
        return raw.trim().replace(/\/$/, '');
    }

    function buildHeaders(token) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (token && token.length > 0) {
            headers.Authorization = 'Bearer ' + token;
        }

        return headers;
    }

    function buildSystemInfo(scope) {
        return {
            scope,
            extensionVersion: chrome.runtime.getManifest().version,
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            url: location.href,
            timestamp: new Date().toISOString()
        };
    }

    function getPlatformFromScope(scope, activePlatform) {
        if (typeof scope === 'string') {
            if (scope.includes('moodle')) {
                return 'moodle';
            }
            if (scope.includes('openedu')) {
                return 'openedu';
            }
        }
        return activePlatform === 'moodle' ? 'moodle' : 'openedu';
    }

    function pickBackendConfig(settings, scope) {
        const platform = getPlatformFromScope(scope, settings?.activePlatform);

        if (global.ParamExtSettings && typeof global.ParamExtSettings.getBackendByPlatform === 'function') {
            return global.ParamExtSettings.getBackendByPlatform(settings, platform);
        }

        const backend = settings?.backend || {};
        if (backend.moodle || backend.openedu) {
            return platform === 'moodle' ? (backend.moodle || {}) : (backend.openedu || {});
        }

        return backend;
    }

    async function flushQueue(scope) {
        if (queue.length === 0) {
            return;
        }

        const settings = await getSettingsSafe();
        const backendConfig = pickBackendConfig(settings, scope);
        const baseUrl = normalizeBaseUrl(backendConfig?.apiBaseUrl);
        if (!baseUrl) {
            return;
        }

        const token = backendConfig?.apiToken || '';
        const timeoutMs = Number(backendConfig?.requestTimeoutMs || 4000);

        while (queue.length > 0) {
            const packet = queue.shift();
            if (!packet) {
                continue;
            }

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                await fetch(baseUrl + '/v1/logs/client', {
                    method: 'POST',
                    headers: buildHeaders(token),
                    body: JSON.stringify(packet),
                    signal: controller.signal
                });
            } catch (_) {
                // Keep telemetry fully non-blocking.
            } finally {
                clearTimeout(timer);
            }
        }
    }

    function push(kind, payload, scope) {
        const packet = {
            kind,
            payload,
            system: buildSystemInfo(scope)
        };

        queue.push(packet);
        if (queue.length > MAX_QUEUE_SIZE) {
            queue.splice(0, queue.length - MAX_QUEUE_SIZE);
        }

        flushQueue(scope);
    }

    function installGlobalHandlers(scope) {
        window.addEventListener('error', (event) => {
            push('error', {
                message: event.message,
                source: event.filename,
                line: event.lineno,
                column: event.colno,
                stack: event.error && event.error.stack ? String(event.error.stack) : ''
            }, scope);
        });

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            push('unhandledrejection', {
                message: typeof reason === 'string' ? reason : (reason && reason.message ? String(reason.message) : 'unknown rejection'),
                stack: reason && reason.stack ? String(reason.stack) : ''
            }, scope);
        });
    }

    global.ParamExtTelemetry = {
        push,
        installGlobalHandlers
    };
})(globalThis);
