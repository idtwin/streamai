const axios = require('axios');

async function scrapeDMM(stremioId, type, config) {
    if (!config.useDmm) {
        return [];
    }

    try {
        // Parse the Stremio ID to handle series properly
        const parts = stremioId.split(':');
        const imdbId = parts[0];
        let seasonStr = '';
        let epStr = '';

        if (parts.length === 3) {
            // zero-pad season and episode: S01E02
            seasonStr = parts[1].padStart(2, '0');
            epStr = parts[2].padStart(2, '0');
        }

        let searchString = imdbId;

        // Fetch Series Name from Cinemeta to search APiBay accurately
        if (seasonStr && epStr) {
            try {
                const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`);
                if (metaRes.data && metaRes.data.meta && metaRes.data.meta.name) {
                    searchString = `${metaRes.data.meta.name} s${seasonStr}e${epStr}`;
                }
            } catch (err) {
                console.error('[Cinemeta Proxy Error]', err.message);
                searchString = `${imdbId} s${seasonStr}e${epStr}`; // fallback
            }
        }

        // Fetch directly from APiBay (The Pirate Bay) instead of Torrentio
        // This is necessary because Torrentio blocks Render/Cloud IPs with a 403 Forbidden.
        let dmmResults = [];
        let apiBayBlocked = false;

        try {
            const res = await axios.get(`https://apibay.org/q.php?q=${encodeURIComponent(searchString)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                }
            });

            if (res.data && Array.isArray(res.data) && res.data.length > 0 && res.data[0].id !== '0') {
                res.data.forEach(stream => {
                    if (stream.info_hash) {
                        const titleStr = stream.name.toLowerCase();

                        // If looking for a series episode, filter out torrents that don't match the requested episode
                        if (seasonStr && epStr) {
                            const seStr1 = `s${seasonStr}e${epStr}`;
                            const seStr2 = `${seasonStr}x${epStr}`;
                            if (!titleStr.includes(seStr1) && !titleStr.includes(seStr2)) {
                                return; // skip if doesn't match season/ep
                            }
                        }

                        // Parse quality logically from the title
                        let quality = 'Unknown';
                        if (titleStr.includes('4k') || titleStr.includes('2160p')) quality = '4k';
                        else if (titleStr.includes('1080p') || titleStr.includes('fhd')) quality = '1080p';
                        else if (titleStr.includes('720p') || titleStr.includes('hd')) quality = '720p';
                        else if (titleStr.includes('480p') || titleStr.includes('sd')) quality = '480p';
                        else if (titleStr.includes('cam')) quality = 'cam';

                        // Size in MB/GB
                        const sizeBytes = parseInt(stream.size || '0');
                        const sizeFormat = sizeBytes > 1073741824
                            ? (sizeBytes / 1073741824).toFixed(2) + ' GB'
                            : (sizeBytes / 1048576).toFixed(2) + ' MB';

                        dmmResults.push({
                            provider: 'Public Tracker',
                            hash: stream.info_hash.toLowerCase(),
                            quality: quality,
                            title: `[Public Index] ${stream.name}`,
                            size: sizeFormat,
                            seeders: parseInt(stream.seeders || '0'),
                            leechers: parseInt(stream.leechers || '0')
                        });
                    }
                });
            } else {
                apiBayBlocked = true;
            }
        } catch (e) {
            apiBayBlocked = true;
            console.error('[APiBay Scraper Error]', e.message);
        }

        // --- FALLBACK SCRAPER (YTS API) ---
        // If APiBay is blocking the Render Datacenter, fallback to YTS for movies
        if (apiBayBlocked && type === 'movie') {
            try {
                const ytsRes = await axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${imdbId}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });

                if (ytsRes.data && ytsRes.data.data && ytsRes.data.data.movies && ytsRes.data.data.movies.length > 0) {
                    const movie = ytsRes.data.data.movies[0];
                    if (movie.torrents) {
                        movie.torrents.forEach(t => {
                            dmmResults.push({
                                provider: 'YTS Proxy',
                                hash: t.hash.toLowerCase(),
                                quality: t.quality.toLowerCase() === '2160p' ? '4k' : t.quality.toLowerCase(),
                                title: `[YTS DB] ${movie.title} (${movie.year})`,
                                size: t.size,
                                seeders: t.seeds || 0,
                                leechers: t.peers || 0
                            });
                        });
                    }
                }
            } catch (err) {
                console.error('[YTS Scraper Error]', err.message);
            }
        }

        // Apply Quality filters from UI
        if (config.qualities && config.qualities.length > 0) {
            dmmResults = dmmResults.filter(t => {
                const tq = t.quality.toLowerCase();
                return config.qualities.some(q => tq.includes(q.toLowerCase()));
            });
        }

        return dmmResults;

    } catch (e) {
        console.error('[Public Scraper Error]', e.message);
        return [];
    }
}

module.exports = { scrapeDMM };
