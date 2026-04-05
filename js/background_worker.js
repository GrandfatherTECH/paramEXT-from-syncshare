importScripts('background.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'PARAMEXT_HTTP' || !message.request || typeof message.request.url !== 'string') {
        return;
    }

    const request = message.request;
    const timeoutMsRaw = Number(request.timeoutMs);
    const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(500, timeoutMsRaw) : 4000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    fetch(request.url, {
        method: typeof request.method === 'string' ? request.method : 'GET',
        headers: request.headers && typeof request.headers === 'object' ? request.headers : undefined,
        body: typeof request.body === 'string' ? request.body : undefined,
        signal: controller.signal
    }).then(async (response) => {
        let text = '';
        try {
            text = await response.text();
        } catch (_) {
            text = '';
        }

        let json = null;
        if (text) {
            try {
                json = JSON.parse(text);
            } catch (_) {
                json = null;
            }
        }

        sendResponse({
            ok: response.ok,
            status: response.status,
            json,
            text
        });
    }).catch((error) => {
        sendResponse({
            ok: false,
            status: 0,
            error: error && error.message ? error.message : 'request_failed'
        });
    }).finally(() => {
        clearTimeout(timer);
    });

    return true;
});
