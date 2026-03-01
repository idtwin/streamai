const axios = require('axios');

async function scrapeDMM(imdbId, type, config) {
    if (!config.useDmm) {
        return [];
    }

    try {
        // As a proxy for DMM's backend, we will fetch from Torrentio's JSON API 
        // to retrieve a massive pool of real, high-quality, pre-cached hashes instantly.
        const res = await axios.get(`https://torrentio.strem.fun/stream/${type}/${imdbId}.json`);

        if (!res.data || !res.data.streams) {
            return [];
        }

        let dmmResults = [];

        res.data.streams.forEach(stream => {
            if (stream.infoHash) {
                // Parse quality logically from the title
                let quality = 'Unknown';
                const titleStr = stream.title.toLowerCase();
                const nameStr = stream.name.toLowerCase();

                if (titleStr.includes('4k') || titleStr.includes('2160p') || nameStr.includes('4k')) quality = '4k';
                else if (titleStr.includes('1080p') || nameStr.includes('1080p')) quality = '1080p';
                else if (titleStr.includes('720p') || nameStr.includes('720p')) quality = '720p';
                else if (titleStr.includes('480p') || nameStr.includes('480p')) quality = '480p';
                else if (titleStr.includes('cam')) quality = 'cam';

                // Parse size roughly
                const sizeMatch = stream.title.match(/💾\s*([\d.]+\s*[KMG]B)/i);
                const size = sizeMatch ? sizeMatch[1] : 'Unknown';

                // Parse seeders
                const seedMatch = stream.title.match(/👤\s*(\d+)/i);
                const seeders = seedMatch ? parseInt(seedMatch[1]) : 0;

                // Parse original provider (e.g. TorrentGalaxy, YTS)
                const lines = stream.title.split('\n');
                let originalProvider = 'DMM';
                if (lines.length > 1) {
                    const provMatch = lines[1].match(/^([a-zA-Z0-9]+)\s+👤/);
                    if (provMatch) originalProvider = `DMM / ${provMatch[1]}`;
                }

                dmmResults.push({
                    provider: originalProvider,
                    hash: stream.infoHash.toLowerCase(),
                    quality: quality,
                    title: `[DMM] ${lines[0] || stream.name}`,
                    size: size,
                    seeders: seeders,
                    leechers: 0
                });
            }
        });

        // Apply Quality filters from UI
        if (config.qualities && config.qualities.length > 0) {
            dmmResults = dmmResults.filter(t => {
                const tq = t.quality.toLowerCase();
                return config.qualities.some(q => tq.includes(q.toLowerCase()));
            });
        }

        return dmmResults;

    } catch (e) {
        console.error('[DMM Scraper Error]', e.message);
        return [];
    }
}

module.exports = { scrapeDMM };
