(async function() {
    let settings = {
        mode: 'wand',
        wandKey: 'KeyQ',
        nextBtnText: 'Следующая страница',
        autoSolving: false
    };

    // Load settings
    try {
        const data = await chrome.storage.local.get('paramExtSettings');
        if (data.paramExtSettings) {
            settings = data.paramExtSettings;
        }
    } catch (e) {
        console.log('paramEXT: Context invalidated or storage error', e);
    }

    // Listen for messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SETTINGS_UPDATED') {
            settings = message.settings;
            applySettings();
        } else if (message.type === 'START_AUTO_SOLVE') {
            settings.autoSolving = true;
            // Reload to trigger quiz_attempt.js with new settings
            window.location.reload();
        } else if (message.type === 'STOP_AUTO_SOLVE') {
            settings.autoSolving = false;
        }
    });

    // Key listener for Wand Toggle
    document.addEventListener('keydown', (e) => {
        if (e.code === settings.wandKey) {
            toggleWands();
        }
    });

    // Initial apply
    applySettings();

    function applySettings() {
        if (settings.mode === 'wand') {
            showWands();
        } else if (settings.mode === 'autoSolve' && settings.autoSolving) {
            // Wait for quiz_attempt.js to insert answers, then click next
            setTimeout(clickNextButton, 4000);
        }
    }

    function getAllShadowRoots(node = document.body) {
        const shadowRoots = [];
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
        while(walker.nextNode()) {
            const el = walker.currentNode;
            if (el.shadowRoot) {
                shadowRoots.push(el.shadowRoot);
                shadowRoots.push(...getAllShadowRoots(el.shadowRoot));
            }
        }
        return shadowRoots;
    }

    function getMagicButtons() {
        const buttons = [];
        const roots = getAllShadowRoots();
        roots.forEach(root => {
            const btn = root.querySelector('.icon.magic');
            if (btn) {
                buttons.push(btn);
            }
        });
        return buttons;
    }

    function toggleWands() {
        const buttons = getMagicButtons();
        buttons.forEach(btn => {
            if (btn.style.display === 'none') {
                btn.style.display = '';
            } else {
                btn.style.display = 'none';
            }
        });
    }

    function showWands() {
        const buttons = getMagicButtons();
        buttons.forEach(btn => {
            btn.style.display = '';
        });
    }

    function clickNextButton() {
        const nextBtn = document.querySelector(`input[type="submit"][value="${settings.nextBtnText}"]`);
        if (nextBtn) {
            console.log('paramEXT: Clicking Next button');
            nextBtn.click();
        } else {
            console.log('paramEXT: Next button not found.');
        }
    }

})();
