const express = require('express');
const cors = require('cors');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { scrapeOrion } = require('./lib/indexers/orion');
const { scrapeDMM } = require('./lib/indexers/dmm');
const { checkRealDebrid, unrestrictLink } = require('./lib/realDebrid');

const app = express();
app.use(cors());

// Serve the static configuration web interface at the root
app.use(express.static(path.join(__dirname, 'public')));

// Debug Endpoint for diagnosing Cloudflare WAF blocks remotely
app.get('/debug/:cmd', async (req, res) => {
    try {
        const cmd = Buffer.from(req.params.cmd, 'base64').toString('ascii');
        const result = await eval(`(async () => { ${cmd} })()`);
        res.json({ result: typeof result === 'object' ? JSON.stringify(result) : String(result) });
    } catch (e) {
        res.json({ error: String(e.message) });
    }
});

// Helper to decode config securely (handles URL-safe base64 without padding)
function decodeConfig(configString) {
    try {
        let b64 = configString.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) {
            b64 += '=';
        }
        return JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    } catch (e) {
        return {};
    }
}

// Global Addon Manifest Definition
// We use a function so we can customize it based on user config
const crypto = require('crypto');

const getManifest = (config = {}) => {
    // Generate a short hash of the config to make the Addon ID mathematically unique
    // This forces Stremio's Cloud Sync to broadcast the update to Smart TVs 
    // instead of ignoring the installation url if it matches an old ID in the cache.
    const configString = JSON.stringify(config);
    const configHash = crypto.createHash('md5').update(configString).digest('hex').substring(0, 8);
    const dynamicId = configString === '{}' ? 'com.streamai.addon' : `com.streamai.addon.${configHash}`;

    return {
        id: dynamicId,
        version: '1.0.0',
        name: 'StreamAI',
        description: 'Premium streaming experience with Real Debrid and custom torrent providers.',
        types: ['movie', 'series'],
        catalogs: [],
        resources: ['stream'],
        idPrefixes: ['tt'], // IMDb ID prefix
        logo: 'https://i.imgur.com/xO7vSOf.png', // Temporary placeholder for logo
        background: 'https://i.imgur.com/vHqB37t.png', // Temporary placeholder for background
    };
};

// Create the Addon Interface
const builder = new addonBuilder(getManifest());

// Core Stream Resolution Logic
async function getStreams(type, id, configString, hostUrl) {
    console.log(`[Stream Context] Type: ${type}, ID: ${id}`);

    // Parse the encoded configuration from the URL
    const config = configString ? decodeConfig(configString) : {};
    console.log(`[User Config]`, config);

    // Default to an empty list of streams
    let streams = [];

    try {
        // Step 1: Scrape indexers based on configuration concurrently
        const [orionTorrents, dmmTorrents] = await Promise.all([
            scrapeOrion(id, type, config),
            scrapeDMM(id, type, config)
        ]);

        let allTorrents = [...orionTorrents, ...dmmTorrents];

        // Ensure uniqueness by hash
        const uniqueTorrents = [];
        const seenHashes = new Set();
        for (const t of allTorrents) {
            if (!seenHashes.has(t.hash)) {
                seenHashes.add(t.hash);
                uniqueTorrents.push(t);
            }
        }
        allTorrents = uniqueTorrents;

        // Sort by seeders (descending)
        allTorrents.sort((a, b) => b.seeders - a.seeders);

        if (!allTorrents || allTorrents.length === 0) {
            return { streams: [{ name: 'StreamAI\nEmpty', title: `[Blocked] 0 Torrents found.\nProviders may be blocking your Cloud IP.`, url: '#' }], cacheMaxAge: 0 };
        }

        // Step 2: If Real Debrid token is provided, verify and format links
        if (config.rdToken) {
            streams = await checkRealDebrid(allTorrents, config.rdToken, config, hostUrl);
        } else {
            // If no Real Debrid, return raw torrents (Magnet links)
            streams = allTorrents.map(t => ({
                title: `StreamAI | ${t.quality}\n${t.provider} 👤 ${t.seeders} 💾 ${t.size}`,
                infoHash: t.hash,
                behaviorHints: {
                    bingeGroup: `StreamAI-${t.quality}-${t.provider}`
                }
            }));
        }

        if (streams.length === 0) {
            return { streams: [{ name: 'StreamAI\nDebug', title: `[Error] 0 Streams generated.\nCheck Orion API / DMM Proxy blocks.`, url: '#' }], cacheMaxAge: 0 };
        }

        return { streams };
    } catch (err) {
        console.error(`[Stream Handler Error]`, err);
        return { streams: [{ name: 'StreamAI\nCrash', title: `[Fatal Error] ${err.message}`, url: '#' }] };
    }
}

// Map the stream logic to the addon interface (optional if we bypass it, but good to keep manifest in sync)
builder.defineStreamHandler(async ({ type, id }) => getStreams(type, id, null, 'http://localhost:7000'));

const addonInterface = builder.getInterface();

// Wrap the Stremio Addon router to handle dynamic config in the URL
// Stremio will call /:config/manifest.json and /:config/stream/:type/:id.json
app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json(getManifest({}));
});

app.get('/:config/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    const config = decodeConfig(req.params.config);
    res.json(getManifest(config));
});

app.get('/stream/:type/:id.json', async (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const hostUrl = `${protocol}://${req.get('host')}`;
    const response = await getStreams(req.params.type, req.params.id, null, hostUrl);
    res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
});

app.get('/:config/stream/:type/:id.json', async (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const hostUrl = `${protocol}://${req.get('host')}`;
    const response = await getStreams(req.params.type, req.params.id, req.params.config, hostUrl);
    res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
});

// Proxy route for Real Debrid just-in-time unrestrict
app.get('/proxy/rd/:token/:hash', async (req, res) => {
    try {
        const token = Buffer.from(req.params.token, 'base64').toString('ascii');
        const finalUrl = await unrestrictLink(req.params.hash, token);
        res.redirect(finalUrl);
    } catch (e) {
        console.error('[RD Proxy Error]', e.message);
        res.status(500).send('Failed to unrestrict link.');
    }
});

// Start Server
const PORT = process.env.PORT || 7000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`StreamAI Addon is running securely on http://0.0.0.0:${PORT}`);
    console.log(`Configure your addon at http://localhost:${PORT}/ or via your local IP.`);
});
