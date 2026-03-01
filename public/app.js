const indexers = [
    { id: 'dmm', name: 'Debrid Media Manager (DMM)', default: true }
];

const qualities = [
    { id: '4k', name: '4K', default: true },
    { id: '1080p', name: '1080p', default: true },
    { id: '720p', name: '720p', default: true },
    { id: '480p', name: '480p', default: true },
    { id: 'other', name: 'Other', default: false },
    { id: 'screener', name: 'Screener', default: false },
    { id: 'cam', name: 'Cam', default: false },
    { id: 'unknown', name: 'Unknown', default: false }
];

document.addEventListener('DOMContentLoaded', () => {
    // Render Indexers
    const indexersContainer = document.getElementById('indexers-container');
    indexers.forEach(p => {
        const div = document.createElement('div');
        div.className = `provider-chip ${p.default ? 'selected' : ''}`;
        div.textContent = p.name;
        div.dataset.id = p.id;
        div.addEventListener('click', () => {
            div.classList.toggle('selected');
        });
        indexersContainer.appendChild(div);
    });

    // Render Qualities (Resolutions)
    const qualityContainer = document.getElementById('quality-container');
    qualities.forEach(q => {
        const div = document.createElement('div');
        // By default, selected means we WANT it. But the text says "Exclude".
        // Let's modify UI concept: selected = included. 
        div.className = `provider-chip ${q.default ? 'selected' : ''}`;
        div.textContent = q.name;
        div.dataset.id = q.id;
        div.addEventListener('click', () => {
            div.classList.toggle('selected');
        });
        qualityContainer.appendChild(div);
    });

    // Dummy Real Debrid Verification
    const verifyBtn = document.getElementById('verify-rd-btn');
    const rdInput = document.getElementById('rd-api-key');
    const rdStatus = document.getElementById('rd-status');

    verifyBtn.addEventListener('click', () => {
        const token = rdInput.value.trim();
        if (!token) {
            rdStatus.textContent = "Please enter an API key.";
            rdStatus.className = "status-message error";
            return;
        }

        // Simulating API Call
        verifyBtn.textContent = "Verifying...";
        verifyBtn.disabled = true;

        setTimeout(() => {
            if (token.length > 20) {
                rdStatus.textContent = "Valid API Key. Integration active.";
                rdStatus.className = "status-message success";
            } else {
                rdStatus.textContent = "Invalid API Key format.";
                rdStatus.className = "status-message error";
            }
            verifyBtn.textContent = "Verify";
            verifyBtn.disabled = false;
        }, 800);
    });

    // Generate Configuration Data
    function getConfigData() {
        const useDmm = document.querySelector('.provider-chip[data-id="dmm"]').classList.contains('selected');
        const orionKey = document.getElementById('orion-api-key').value.trim();
        const selectedQualities = Array.from(qualityContainer.querySelectorAll('.provider-chip.selected')).map(el => el.dataset.id);
        const rdToken = rdInput.value.trim();
        const sortBy = document.getElementById('sort-by').value;
        const maxResults = document.getElementById('max-results').value;

        return {
            useDmm: useDmm,
            orionKey: orionKey,
            qualities: selectedQualities,
            rdToken: rdToken,
            sort: sortBy,
            maxResults: maxResults
        };
    }

    // Generate URL based on state
    function getManifestUrl() {
        const config = getConfigData();
        // Base64 encode the configuration and make it URL-safe for Stremio Router
        // Stremio's internal manifest parser sometimes fails on standard btoa padding (=, +, /)
        let encodedConfig = btoa(JSON.stringify(config))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const host = window.location.host;
        const protocol = window.location.protocol; // http: or https:

        // CRITICAL FIX: To force Stremio to install from a non-secure local IP (like 192.168.x.x)
        // without throwing "ERR_OPENING_MEDIA - Failed to fetch", the stremio:// protocol MUST
        // be replaced with the exact http:// URL in the installation link string on modern clients.

        const base = `${protocol}//${host}/${encodedConfig}/manifest.json`;
        return base;
    }

    const installBtn = document.getElementById('install-btn');
    installBtn.addEventListener('click', () => {
        const url = getManifestUrl();
        // Replace protocol with stremio for the button click redirect
        window.location.href = url.replace(/^https?:\/\//i, 'stremio://');
    });

    const copyBtn = document.getElementById('copy-link-btn');
    copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = getManifestUrl();

        const forceFeedback = () => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(url).then(forceFeedback).catch(err => {
                console.error('Clipboard API failed', err);
                fallbackCopy(url, forceFeedback);
            });
        } else {
            fallbackCopy(url, forceFeedback);
        }
    });

    function fallbackCopy(text, callback) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // Avoid scrolling to bottom
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                callback();
            } else {
                alert("Auto-copy failed. Please manually copy this link:\n\n" + text);
            }
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            alert("Auto-copy failed. Please manually copy this link:\n\n" + text);
        }

        document.body.removeChild(textArea);
    }
});
