document.addEventListener('DOMContentLoaded', async () => {
    const mainLogo = document.getElementById('mainLogo');
    if (mainLogo) {
        mainLogo.addEventListener('error', () => {
            mainLogo.src = '../../icons/logo@128.png';
        });
    }

    const modeRadios = document.getElementsByName('mode');
    const autoSolveControls = document.getElementById('autoSolveControls');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const wandKeyInput = document.getElementById('wandKey');
    const nextBtnSelectorInput = document.getElementById('nextBtnSelector');
    const btnSave = document.getElementById('btnSave');

    // Load settings
    let data = {};
    try {
        data = await chrome.storage.local.get('paramExtSettings');
    } catch (e) {
        console.log('paramEXT: Context invalidated', e);
    }
    const settings = data.paramExtSettings || {
        mode: 'wand',
        wandKey: 'KeyQ',
        nextBtnText: 'Следующая страница',
        autoSolving: false
    };

    // Apply settings to UI
    for (const radio of modeRadios) {
        if (radio.value === settings.mode) {
            radio.checked = true;
        }
        radio.addEventListener('change', updateUI);
    }
    wandKeyInput.value = settings.wandKey;
    nextBtnSelectorInput.value = settings.nextBtnText;

    if (settings.autoSolving) {
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');
    }

    updateUI();

    function updateUI() {
        const selectedMode = Array.from(modeRadios).find(r => r.checked).value;
        if (selectedMode === 'autoSolve') {
            autoSolveControls.classList.remove('hidden');
        } else {
            autoSolveControls.classList.add('hidden');
        }
    }

    // Save settings
    btnSave.addEventListener('click', async () => {
        try {
            const selectedMode = Array.from(modeRadios).find(r => r.checked).value;
            const newSettings = {
                ...settings,
                mode: selectedMode,
                wandKey: wandKeyInput.value,
                nextBtnText: nextBtnSelectorInput.value
            };
            await chrome.storage.local.set({ paramExtSettings: newSettings });
            alert('Настройки сохранены');
            
            // Notify content script
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'SETTINGS_UPDATED', settings: newSettings });
                }
            });
        } catch (e) {
            console.log('paramEXT: Error saving settings', e);
        }
    });

    // Start Auto-solve
    btnStart.addEventListener('click', async () => {
        const newSettings = { ...settings, autoSolving: true };
        await chrome.storage.local.set({ paramExtSettings: newSettings });
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');
        
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'START_AUTO_SOLVE' });
            }
        });
    });

    // Stop Auto-solve
    btnStop.addEventListener('click', async () => {
        const newSettings = { ...settings, autoSolving: false };
        await chrome.storage.local.set({ paramExtSettings: newSettings });
        btnStart.classList.remove('hidden');
        btnStop.classList.add('hidden');

        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_AUTO_SOLVE' });
            }
        });
    });
});
