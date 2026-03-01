const axios = require('axios');

// Basic helper to fetch from YTS API for movies
async function scrapeYts(imdbId) {
    try {
        const res = await axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${imdbId}`);
        if (!res.data.data.movies) return [];

        const movie = res.data.data.movies[0];
        const torrents = movie.torrents || [];

        return torrents.map(t => ({
            provider: 'YTS',
            hash: t.hash.toLowerCase(),
            quality: t.quality,
            title: t.title || movie.title,
            size: t.size,
            seeders: t.seeds,
            leechers: t.peers
        }));
    } catch (e) {
        console.error('[YTS Scraper Error]', e.message);
        return [];
    }
}

// Dummy scraper for other providers (Demonstration purposes)
// In a full production add-on, you would implement cheerio/puppeteer scraping 
// for torrentgalaxy, 1337x, rarbg-clones, or use an indexer aggregate like Jackett/Prowlarr.
async function scrapeDummyProvider(providerName, type, id) {
    // Return some mock hashes that we know might exist or just random test data
    return [
        {
            provider: providerName,
            hash: '08ada5a7a6183aae1e09d831df6748d566095a10', // example hash (Big Buck Bunny)
            quality: '1080p',
            title: `[${providerName}] Dummy Release 1080p HEVC`,
            size: '1.5 GB',
            seeders: Math.floor(Math.random() * 500) + 10,
            leechers: Math.floor(Math.random() * 50)
        },
        {
            provider: providerName,
            hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4', // dummy hash
            quality: '4k',
            title: `[${providerName}] Dummy Release 2160p HDR`,
            size: '15.2 GB',
            seeders: Math.floor(Math.random() * 200) + 5,
            leechers: Math.floor(Math.random() * 20)
        }
    ];
}

// Main scrape function
async function scrapeProviders(type, id, config) {
    let allTorrents = [];
    const providers = config.providers || ['yts', '1337x', 'torrentgalaxy'];

    // We only have YTS API for movies
    if (type === 'movie' && providers.includes('yts')) {
        const ytsTorrents = await scrapeYts(id);
        allTorrents = allTorrents.concat(ytsTorrents);
    }

    // Run other dummy providers concurrently
    const otherProviders = providers.filter(p => p !== 'yts');
    const promises = otherProviders.map(p => scrapeDummyProvider(p.toUpperCase(), type, id));

    const results = await Promise.all(promises);
    results.forEach(res => {
        allTorrents = allTorrents.concat(res);
    });

    // Apply Quality Filters
    if (config.qualities && config.qualities.length > 0) {
        // config.qualities contains the qualities the user WANTS to include
        allTorrents = allTorrents.filter(t => {
            const tq = t.quality.toLowerCase();
            return config.qualities.some(q => tq.includes(q.toLowerCase()));
        });
    }

    // Apply Sorting limits per quality
    // Sort logic here based on config.sort (e.g. 'quality_seeders')
    allTorrents.sort((a, b) => b.seeders - a.seeders);

    // Filter Max Results Per Quality
    if (config.maxResults && config.maxResults !== 'all') {
        const max = parseInt(config.maxResults);
        const qualityCount = {};
        allTorrents = allTorrents.filter(t => {
            qualityCount[t.quality] = (qualityCount[t.quality] || 0) + 1;
            return qualityCount[t.quality] <= max;
        });
    }

    return allTorrents;
}

module.exports = { scrapeProviders };
