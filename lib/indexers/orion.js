const axios = require('axios');

const ORION_API_URL = 'https://api.orionoid.com';

/**
 * Interacts with the Orion API to find cached or high-health torrents.
 * Orion provides an incredibly massive index of torrents across multiple providers.
 */
async function scrapeOrion(imdbId, type, config) {
    if (!config.orionKey) {
        return [];
    }

    // Prepare qualities to filter in Orion format
    // Orion uses parameters like videoquality=HD,4K,FHD etc
    let videoquality = [];
    if (config.qualities && config.qualities.length > 0) {
        if (config.qualities.includes('4k')) videoquality.push('4K');
        if (config.qualities.includes('1080p')) videoquality.push('FHD');
        if (config.qualities.includes('720p')) videoquality.push('HD');
        if (config.qualities.includes('480p')) videoquality.push('SD');
        if (config.qualities.includes('cam')) videoquality.push('CAM');
    }

    const params = {
        keyuser: config.orionKey,
        keyapp: '11111111111111111111111111111111',
        mode: 'stream',
        action: 'retrieve',
        type: type, // 'movie' or 'show' (Stremio passes 'series' so we might need to map it)
        idimdb: imdbId,
        limitcount: parseInt(config.maxResults) > 0 ? (parseInt(config.maxResults) * 3) : 15,
        access: 'torrent', // we want torrents/magnets to pass to our RD integration
    };

    // Stremio uses 'series', Orion uses 'show'
    if (params.type === 'series') {
        params.type = 'show';
    }

    if (videoquality.length > 0) {
        params.videoquality = videoquality.join(',');
    }

    // Sort preference
    if (config.sort === 'seeders') {
        params.sortvalue = 'seeders';
    } else if (config.sort === 'size') {
        params.sortvalue = 'filesize';
    } else {
        // default to best overall (usually best quality then seeders)
        params.sortvalue = 'best';
    }

    try {
        const res = await axios.get(ORION_API_URL, { params });
        const data = res.data;

        if (data && data.result && data.result.status === 'success' && data.data && data.data.streams) {
            return data.data.streams.map(stream => {
                // Return mapped object for our internal RD logic
                return {
                    provider: 'Orion',
                    hash: stream.file.hash.toLowerCase(),
                    quality: stream.video.quality || 'Unknown',
                    title: `[Orion] ${stream.file.name}`,
                    size: formatSize(stream.file.size),
                    seeders: stream.stream.seeds || 0,
                    leechers: stream.stream.peers || 0
                };
            });
        }
        return [];
    } catch (e) {
        console.error('[Orion Scraper Error]', e.message);
        return [];
    }
}

// Basic byte formatter
function formatSize(bytes) {
    if (!bytes) return 'Unknown';
    const b = parseInt(bytes);
    if (b < 1024) return b + ' B';
    else if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    else if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    else return (b / 1073741824).toFixed(1) + ' GB';
}

module.exports = { scrapeOrion };
