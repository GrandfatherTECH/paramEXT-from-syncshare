(function () {
    const HOST_RE = /(^|\.)openedu\.ru$/i;
    const STICK_ID = 'paramext-openedu-stick';
    const MAX_ANSWERS_PER_QUESTION = 5;

    if (!HOST_RE.test(location.hostname)) {
        return;
    }

    if (!window.ParamExtSettings) {
        return;
    }

    if (window.ParamExtTelemetry) {
        window.ParamExtTelemetry.installGlobalHandlers('openedu-content');
    }

    let settings = null;
    let stickRoot = null;
    let stickBody = null;
    let statusDot = null;
    let statusText = null;
    let lastAutoAdvanceAt = 0;

    function textOf(node) {
        return (node && node.textContent ? node.textContent : '').replace(/\s+/g, ' ').trim();
    }

    function hash(input) {
        let value = 0;
        for (let i = 0; i < input.length; i += 1) {
            value = ((value << 5) - value) + input.charCodeAt(i);
            value |= 0;
        }
        return String(Math.abs(value));
    }

    function normalizeApiBaseUrl() {
        const raw = settings?.backend?.openedu?.apiBaseUrl || settings?.backend?.apiBaseUrl;
        if (typeof raw !== 'string') {
            return '';
        }
        return raw.trim().replace(/\/$/, '');
    }

    function getAuthHeaders(withJsonContentType) {
        const token = settings?.backend?.openedu?.apiToken || settings?.backend?.apiToken || '';
        const headers = {};
        if (withJsonContentType) {
            headers['Content-Type'] = 'application/json';
        }
        if (token.length > 0) {
            headers.Authorization = 'Bearer ' + token;
        }
        return headers;
    }

    async function requestViaBackground(request) {
        return await new Promise((resolve) => {
            if (!chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
                resolve(null);
                return;
            }

            chrome.runtime.sendMessage({
                type: 'PARAMEXT_HTTP',
                request
            }, (response) => {
                const lastError = chrome.runtime.lastError;
                if (lastError) {
                    resolve(null);
                    return;
                }
                resolve(response || null);
            });
        });
    }

    async function apiPost(path, body) {
        const baseUrl = normalizeApiBaseUrl();
        if (!baseUrl) {
            return null;
        }

        const timeoutMs = Number(settings?.backend?.openedu?.requestTimeoutMs || settings?.backend?.requestTimeoutMs || 4000);

        const bgResponse = await requestViaBackground({
            url: baseUrl + path,
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify(body),
            timeoutMs
        });

        if (bgResponse) {
            if (!bgResponse.ok) {
                return null;
            }
            if (bgResponse.json && typeof bgResponse.json === 'object') {
                return bgResponse.json;
            }
            return null;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(baseUrl + path, {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify(body),
                signal: controller.signal
            });

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (_) {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    async function apiGet(path) {
        const baseUrl = normalizeApiBaseUrl();
        if (!baseUrl) {
            return null;
        }

        const timeoutMs = Number(settings?.backend?.openedu?.requestTimeoutMs || settings?.backend?.requestTimeoutMs || 4000);

        const bgResponse = await requestViaBackground({
            url: baseUrl + path,
            method: 'GET',
            headers: getAuthHeaders(false),
            timeoutMs
        });

        if (bgResponse) {
            if (!bgResponse.ok) {
                return null;
            }
            if (bgResponse.json && typeof bgResponse.json === 'object') {
                return bgResponse.json;
            }
            return null;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(baseUrl + path, {
                method: 'GET',
                headers: getAuthHeaders(false),
                signal: controller.signal
            });
            if (!response.ok) {
                return null;
            }
            return await response.json();
        } catch (_) {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    async function probeBackendOnline() {
        const baseUrl = normalizeApiBaseUrl();
        if (!baseUrl) {
            return false;
        }

        const timeoutMs = Number(settings?.backend?.openedu?.requestTimeoutMs || settings?.backend?.requestTimeoutMs || 4000);
        const headers = getAuthHeaders(false);
        const probePaths = ['/healthz', '/health', '/v2/status'];
        let hasHttpResponse = false;

        for (const path of probePaths) {
            const bgResponse = await requestViaBackground({
                url: baseUrl + path,
                method: 'GET',
                headers,
                timeoutMs
            });

            if (bgResponse) {
                hasHttpResponse = true;
                if (bgResponse.status !== 404) {
                    return true;
                }
                continue;
            }

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(baseUrl + path, {
                    method: 'GET',
                    headers,
                    signal: controller.signal
                });

                hasHttpResponse = true;
                if (response.status !== 404) {
                    return true;
                }
            } catch (_) {
                // Continue probing known health endpoints.
            } finally {
                clearTimeout(timer);
            }
        }

        return hasHttpResponse;
    }

    function getCourseContext() {
        const parts = location.pathname.split('/').filter(Boolean);
        const titleNode = document.querySelector('h1, h2, h3');
        const title = textOf(titleNode) || document.title;

        return {
            host: location.host,
            path: location.pathname,
            fullUrl: location.href,
            title,
            testKey: hash(location.host + '|' + location.pathname)
        };
    }

    function getQuestionBlocks() {
        const selectors = [
            '.problems-wrapper[data-problem-id]',
            '.xblock-student_view-problem .problems-wrapper',
            '.problems-wrapper',
            '[data-problem-id]',
            '[id^="problem_"]'
        ];

        const seen = new Set();
        const result = [];

        selectors.forEach((selector) => {
            const nodes = document.querySelectorAll(selector);
            nodes.forEach((node) => {
                if (!(node instanceof HTMLElement) || seen.has(node)) {
                    return;
                }

                const hasAnswers = Boolean(node.querySelector('label[for], input[type="radio"], input[type="checkbox"]'));
                if (!hasAnswers) {
                    return;
                }

                seen.add(node);
                result.push(node);
            });
        });

        return result;
    }

    function getQuestionPrompt(root) {
        const labelNode = root.querySelector('.problem-header, .wrapper-problem-response p, .wrapper-problem-response h3, legend, .problem-title');
        const prompt = textOf(labelNode);
        if (prompt) {
            return prompt;
        }

        return textOf(root.querySelector('h2, h3, p'));
    }

    function isOptionMarkedCorrect(label, input) {
        const classText = (String(label?.className || '') + ' ' + String(input?.className || '')).toLowerCase();
        if (classText.includes('incorrect') || classText.includes('wrong')) {
            return false;
        }

        if (classText.includes('choicegroup_correct')) {
            return true;
        }

        if (/(^|[^a-z])correct([^a-z]|$)/.test(classText)) {
            return true;
        }

        const aria = String(label?.getAttribute?.('aria-label') || '').toLowerCase();
        return aria.includes('correct') || aria.includes('верно');
    }

    function getAnswerOptions(root) {
        const options = [];
        const labels = root.querySelectorAll('label.response-label, label.field-label, .choicegroup label[for], label[for]');
        const usedKeys = new Set();

        labels.forEach((label, idx) => {
            const inputId = label.getAttribute('for') || '';
            const input = inputId ? root.querySelector('#' + CSS.escape(inputId)) : label.querySelector('input[type="radio"], input[type="checkbox"]');
            const answerText = textOf(label);
            if (!answerText) {
                return;
            }

            const dedupeKey = inputId || answerText;
            if (usedKeys.has(dedupeKey)) {
                return;
            }
            usedKeys.add(dedupeKey);

            options.push({
                answerKey: hash(answerText + '|' + (inputId || idx)),
                answerText,
                selected: Boolean(input && input.checked),
                correct: isOptionMarkedCorrect(label, input)
            });
        });

        if (options.length === 0) {
            const inputs = root.querySelectorAll('input[type="radio"], input[type="checkbox"]');
            inputs.forEach((input, idx) => {
                if (!(input instanceof HTMLInputElement)) {
                    return;
                }

                const inputId = input.id || '';
                const label = inputId ? root.querySelector('label[for="' + CSS.escape(inputId) + '"]') : input.closest('label');
                const answerText = textOf(label);
                if (!answerText) {
                    return;
                }

                options.push({
                    answerKey: hash(answerText + '|' + (inputId || idx)),
                    answerText,
                    selected: Boolean(input.checked),
                    correct: isOptionMarkedCorrect(label, input)
                });
            });
        }

        return options;
    }

    function isQuestionCorrect(root) {
        const statusNode = root.querySelector('.status.correct, .message .feedback-hint-correct, .feedback-hint-correct, [data-correct="true"]');
        return Boolean(statusNode);
    }

    function createEmptyStatsEntry() {
        return {
            completedCount: 0,
            verifiedAnswers: [],
            fallbackAnswers: []
        };
    }

    function buildLocalFallbackStats(questions) {
        const local = {};

        questions.forEach((question) => {
            const selected = question.options
                .filter((option) => option.selected)
                .slice(0, MAX_ANSWERS_PER_QUESTION)
                .map((option) => ({ answerText: option.answerText, count: 1 }));

            if (selected.length === 0) {
                return;
            }

            local[question.questionKey] = {
                completedCount: 0,
                verifiedAnswers: [],
                fallbackAnswers: selected,
                localOnly: true
            };
        });

        return local;
    }

    function mergeStatsByQuestion(remoteStatsByQuestion, localStatsByQuestion, questions) {
        const merged = {};

        questions.forEach((question) => {
            const key = question.questionKey;
            const remote = remoteStatsByQuestion && remoteStatsByQuestion[key]
                ? remoteStatsByQuestion[key]
                : createEmptyStatsEntry();
            const local = localStatsByQuestion && localStatsByQuestion[key]
                ? localStatsByQuestion[key]
                : null;

            const remoteVerified = Array.isArray(remote.verifiedAnswers) ? remote.verifiedAnswers.slice(0, MAX_ANSWERS_PER_QUESTION) : [];
            const remoteFallback = Array.isArray(remote.fallbackAnswers) ? remote.fallbackAnswers.slice(0, MAX_ANSWERS_PER_QUESTION) : [];
            const hasRemoteAnswers = remoteVerified.length > 0 || remoteFallback.length > 0;

            if (hasRemoteAnswers || !local) {
                merged[key] = {
                    completedCount: Number(remote.completedCount || 0),
                    verifiedAnswers: remoteVerified,
                    fallbackAnswers: remoteFallback,
                    localOnly: false
                };
                return;
            }

            merged[key] = {
                completedCount: 0,
                verifiedAnswers: [],
                fallbackAnswers: local.fallbackAnswers,
                localOnly: true
            };
        });

        return merged;
    }

    function parseQuestions() {
        const blocks = getQuestionBlocks();

        return blocks.map((root, idx) => {
            const prompt = getQuestionPrompt(root);
            const options = getAnswerOptions(root);
            const questionDomId = root.getAttribute('data-problem-id') || root.getAttribute('id') || ('question-' + idx);
            const questionKey = hash(questionDomId + '|' + prompt);

            return {
                questionKey,
                domId: questionDomId,
                prompt,
                correct: isQuestionCorrect(root),
                options,
                hasVerifiedAnswer: options.some((item) => item.correct)
            };
        }).filter((item) => item.options.length > 0);
    }

    function isWholePageCompleted(questions) {
        if (questions.length === 0) {
            return false;
        }
        return questions.every((question) => question.correct || question.hasVerifiedAnswer);
    }

    async function pushAttemptSnapshot(questions) {
        const context = getCourseContext();
        const payload = {
            source: 'extension',
            context,
            completed: isWholePageCompleted(questions),
            questions: questions.map((question) => ({
                questionKey: question.questionKey,
                prompt: question.prompt,
                verified: question.hasVerifiedAnswer,
                answers: question.options
            }))
        };

        await apiPost('/v1/openedu/attempts', payload);
    }

    async function pullStatistics(questions) {
        const context = getCourseContext();
        return await apiPost('/v1/openedu/solutions/query', {
            context,
            questionKeys: questions.map((question) => question.questionKey)
        });
    }

    function applyAnswerToQuestion(question, answerText) {
        const escaped = answerText.replace(/\s+/g, ' ').trim().toLowerCase();
        const block = document.querySelector('[data-problem-id="' + question.domId.replace(/"/g, '\\"') + '"]') || document.getElementById(question.domId);
        if (!block) {
            return false;
        }

        const labels = block.querySelectorAll('label.response-label, label.field-label');
        let selectedInput = null;

        labels.forEach((label) => {
            if (selectedInput) {
                return;
            }
            const normalized = textOf(label).toLowerCase();
            if (normalized !== escaped) {
                return;
            }

            const inputId = label.getAttribute('for') || '';
            if (!inputId) {
                return;
            }
            const input = block.querySelector('#' + CSS.escape(inputId));
            if (input instanceof HTMLInputElement) {
                selectedInput = input;
            }
        });

        if (!selectedInput) {
            return false;
        }

        selectedInput.click();
        selectedInput.dispatchEvent(new Event('change', { bubbles: true }));
        block.classList.add('paramext-openedu-highlight');
        setTimeout(() => block.classList.remove('paramext-openedu-highlight'), 1600);
        return true;
    }

    function setStickOnline(isOnline) {
        if (!statusDot) {
            return;
        }
        statusDot.classList.toggle('online', isOnline);
        statusText.textContent = isOnline ? 'API доступен' : 'API недоступен';
    }

    function renderStick(statsByQuestion, questions) {
        if (!stickBody) {
            return;
        }

        stickBody.innerHTML = '';

        if (!statsByQuestion || Object.keys(statsByQuestion).length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'paramext-stick-empty';
            emptyState.textContent = 'Статистика появится после первого завершенного прохождения.';
            stickBody.appendChild(emptyState);
            return;
        }

        questions.forEach((question, index) => {
            const stats = statsByQuestion[question.questionKey];
            if (!stats) {
                return;
            }

            const card = document.createElement('div');
            card.className = 'paramext-question-card';

            const head = document.createElement('div');
            head.className = 'paramext-question-head';

            const title = document.createElement('p');
            title.className = 'paramext-question-name';
            title.textContent = 'Вопрос ' + (index + 1);

            const meta = document.createElement('p');
            meta.className = 'paramext-question-meta';
            const completedCount = Number(stats.completedCount || 0);
            if (completedCount > 0) {
                meta.textContent = 'завершений: ' + completedCount;
            } else if (stats.localOnly) {
                meta.textContent = 'ответы на странице зафиксированы';
            } else {
                meta.textContent = 'ожидание данных';
            }

            head.appendChild(title);
            head.appendChild(meta);
            card.appendChild(head);

            const list = document.createElement('ul');
            list.className = 'paramext-answer-list';

            const verifiedAnswers = Array.isArray(stats.verifiedAnswers) ? stats.verifiedAnswers.slice(0, MAX_ANSWERS_PER_QUESTION) : [];
            const fallbackAnswers = Array.isArray(stats.fallbackAnswers) ? stats.fallbackAnswers.slice(0, MAX_ANSWERS_PER_QUESTION) : [];
            const canUseFallback = settings.openedu.showFallbackStats;
            const answersToRender = verifiedAnswers.length > 0 ? verifiedAnswers : (canUseFallback ? fallbackAnswers : []);
            const isFallback = verifiedAnswers.length === 0;

            if (answersToRender.length === 0) {
                const emptyItem = document.createElement('li');
                emptyItem.className = 'paramext-answer-item';
                emptyItem.textContent = 'Пока нет подтвержденных ответов.';
                list.appendChild(emptyItem);
            }

            answersToRender.forEach((answer) => {
                const item = document.createElement('li');
                item.className = 'paramext-answer-item';

                const text = document.createElement('span');
                text.className = 'paramext-answer-text';
                text.textContent = answer.answerText;

                const count = document.createElement('span');
                count.className = 'paramext-answer-count' + (isFallback ? ' fallback' : '');
                count.textContent = String(answer.count || 0);

                item.appendChild(text);
                item.appendChild(count);
                list.appendChild(item);
            });

            card.appendChild(list);

            const topAnswer = answersToRender.length > 0 ? answersToRender[0].answerText : '';
            const controls = document.createElement('div');
            controls.className = 'paramext-question-controls';
            const applyBtn = document.createElement('button');
            applyBtn.className = 'paramext-apply-btn';
            applyBtn.textContent = isFallback ? 'Применить (резерв)' : 'Применить лучший';
            applyBtn.disabled = !topAnswer;
            applyBtn.addEventListener('click', () => {
                if (!topAnswer) {
                    return;
                }
                applyAnswerToQuestion(question, topAnswer);
            });
            controls.appendChild(applyBtn);
            card.appendChild(controls);

            stickBody.appendChild(card);
        });
    }

    function toggleStick() {
        if (!stickRoot) {
            return;
        }
        stickRoot.classList.toggle('hidden');
    }

    function ensureStickUi() {
        if (stickRoot) {
            return;
        }

        const existing = document.getElementById(STICK_ID);
        if (existing) {
            existing.remove();
        }

        stickRoot = document.createElement('aside');
        stickRoot.id = STICK_ID;
        stickRoot.className = 'paramext-openedu-stick';

        const header = document.createElement('div');
        header.className = 'paramext-stick-header';

        const left = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'paramext-stick-title';
        title.textContent = 'paramEXT OpenEdu';
        const subtitle = document.createElement('div');
        subtitle.className = 'paramext-stick-subtitle';
        subtitle.textContent = 'Проверенные ответы и статистика';
        left.appendChild(title);
        left.appendChild(subtitle);

        const actions = document.createElement('div');
        actions.className = 'paramext-stick-actions';

        statusDot = document.createElement('span');
        statusDot.className = 'paramext-stick-status';

        statusText = document.createElement('span');
        statusText.className = 'paramext-stick-subtitle';
        statusText.textContent = 'API недоступен';

        const hideButton = document.createElement('button');
        hideButton.className = 'paramext-stick-button';
        hideButton.type = 'button';
        hideButton.textContent = 'Скрыть';
        hideButton.addEventListener('click', toggleStick);

        actions.appendChild(statusDot);
        actions.appendChild(statusText);
        actions.appendChild(hideButton);

        header.appendChild(left);
        header.appendChild(actions);

        stickBody = document.createElement('div');
        stickBody.className = 'paramext-stick-content';

        stickRoot.appendChild(header);
        stickRoot.appendChild(stickBody);
        document.documentElement.appendChild(stickRoot);
    }

    async function runStickCycle() {
        const questions = parseQuestions();
        if (questions.length === 0) {
            setStickOnline(await probeBackendOnline());
            renderStick(null, []);
            return;
        }

        await pushAttemptSnapshot(questions);

        const statsResponse = await pullStatistics(questions);
        const statsByQuestion = statsResponse && statsResponse.statsByQuestion ? statsResponse.statsByQuestion : null;
        const localFallbackStats = buildLocalFallbackStats(questions);
        const mergedStatsByQuestion = mergeStatsByQuestion(statsByQuestion, localFallbackStats, questions);

        if (statsResponse === null) {
            setStickOnline(await probeBackendOnline());
        } else {
            setStickOnline(true);
        }
        renderStick(mergedStatsByQuestion, questions);
    }

    function isAutoAdvanceEnabled() {
        return settings.openedu.autoAdvanceEnabled || settings.openedu.mode === 'autoSolve';
    }

    function maybeClickNextOnSequencePage() {
        const tabsHost = document.querySelector('.sequence-navigation-tabs');
        if (!tabsHost) {
            return;
        }

        const activeTab = tabsHost.querySelector('button.active');
        if (!activeTab) {
            return;
        }

        const isComplete = activeTab.classList.contains('complete');
        if (!isComplete && settings.openedu.activeTabRefreshEnabled) {
            activeTab.click();
            return;
        }

        if (!isComplete && settings.openedu.requiredCompletionOnly) {
            return;
        }

        const now = Date.now();
        const delayMs = Number(settings.openedu.autoAdvanceDelayMs || 1800);
        if (now - lastAutoAdvanceAt < delayMs) {
            return;
        }

        const nextButton = document.querySelector('.next-btn:not([disabled]), .next-button:not([disabled])');
        if (!nextButton) {
            return;
        }

        lastAutoAdvanceAt = now;
        nextButton.click();
    }

    function installKeyboardToggle() {
        document.addEventListener('keydown', (event) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
                return;
            }
            if (window.ParamExtSettings.hotkeyMatches(event, settings.openedu.stickHotkey)) {
                event.preventDefault();
                toggleStick();
            }
        });
    }

    function installStorageSync() {
        chrome.storage.onChanged.addListener(async (changes, areaName) => {
            if (areaName !== 'local') {
                return;
            }
            if (!Object.prototype.hasOwnProperty.call(changes, window.ParamExtSettings.STORAGE_KEY)) {
                return;
            }
            settings = await window.ParamExtSettings.getSettings();
            runStickCycle();
        });
    }

    async function boot() {
        settings = await window.ParamExtSettings.getSettings();

        if (window.ParamExtTelemetry) {
            window.ParamExtTelemetry.push('system_state', {
                activePlatform: settings.activePlatform,
                mode: settings.openedu.mode,
                autoAdvanceEnabled: settings.openedu.autoAdvanceEnabled,
                locationHost: location.host
            }, 'openedu-content');
        }

        ensureStickUi();
        installKeyboardToggle();
        installStorageSync();

        setStickOnline(await probeBackendOnline());

        setInterval(() => {
            runStickCycle();
        }, 7000);

        runStickCycle();

        setInterval(() => {
            if (isAutoAdvanceEnabled()) {
                maybeClickNextOnSequencePage();
            }
        }, 3000);
    }

    boot();
})();
