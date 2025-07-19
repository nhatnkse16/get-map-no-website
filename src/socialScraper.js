// src/socialScraper.js
const { randomDelay } = require('./utils');
const { handlePopup } = require('./popupHandler');
const CONFIG = require('./config'); // Import CONFIG để lấy USER_AGENT

const findSocialLinks = async (browser, shopName) => {
    const searchPage = await browser.newPage();
    await searchPage.setUserAgent(CONFIG.USER_AGENT);

    let facebookLink = '', instagramLink = '';

    try {
        // Tìm kiếm Facebook
        const fbSearchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(shopName + ' Facebook')}&ia=web`;
        await searchPage.goto(fbSearchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await randomDelay(2000);

        facebookLink = await searchPage.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[data-testid="result-title-a"]'));
            const fbLink = links.find(link =>
                (link.href.includes('facebook.com/') || link.href.includes('fb.com/')) &&
                !link.href.includes('/groups/') && !link.href.includes('/posts/') &&
                !link.href.includes('/events/') && !link.href.includes('/photos/')
            );
            return fbLink ? fbLink.href : '';
        });

        // Tìm kiếm Instagram
        const igSearchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(shopName + ' Instagram')}&ia=web`;
        await searchPage.goto(igSearchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await randomDelay(2000);

        instagramLink = await searchPage.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[data-testid="result-title-a"]'));
            const igLink = links.find(link =>
                link.href.includes('instagram.com/') &&
                !link.href.includes('/p/') && !link.href.includes('/explore/') &&
                !link.href.includes('/tv/') && !link.href.includes('/reels/')
            );
            return igLink ? igLink.href : '';
        });

    } catch (error) {
        console.warn(`⚠️ Lỗi tìm kiếm MXH cho "${shopName}":`, error.message);
    } finally {
        await searchPage.close();
    }

    return { facebookLink, instagramLink };
};

const getWebsiteFromSocialProfile = async (browser, profileUrl) => {
    const page = await browser.newPage();
    await page.setUserAgent(CONFIG.USER_AGENT);

    try {
        await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        await randomDelay(3000, 1500);
        await handlePopup(page);

        const extractLink = (href, textContent = '') => {
            if (href && href.startsWith('https://l.facebook.com/l.php?u=')) {
                const urlParams = new URLSearchParams(href.split('?')[1]);
                const decodedUrl = urlParams.get('u');
                if (decodedUrl) href = decodeURIComponent(decodedUrl);
            } else if (href && href.startsWith('https://l.instagram.com/?u=')) {
                const urlParams = new URLSearchParams(href.split('?')[1]);
                const decodedUrl = urlParams.get('u');
                if (decodedUrl) href = decodeURIComponent(decodedUrl);
            }

            const target = href || textContent;
            if (target &&
                (target.startsWith('http') || target.startsWith('www.')) &&
                !target.includes('facebook.com') && !target.includes('instagram.com') &&
                !target.includes('mailto:') && !target.includes('tel:') &&
                target.match(/\.(com|net|org|vn|co|info|io|store|biz|us|uk|gov|edu)/i)) {
                return target.startsWith('http') ? target : `https://${target}`;
            }
            return '';
        };

        return await page.evaluate((extractLink) => {
            const linkIconParent = document.querySelector('svg[aria-label="Biểu tượng liên kết"]');
            if (linkIconParent) {
                const containerDiv = linkIconParent.closest('.x3nfvp2.x193iq5w');
                if (containerDiv) {
                    const linkElement = containerDiv.querySelector('div.x6ikm8r.x10wlt62 a[href]');
                    if (linkElement) {
                        const href = linkElement.href;
                        const text = linkElement.textContent || linkElement.innerText || '';
                        return new Function('href', 'text', `return (${extractLink})(href, text);`)(href, text);
                    }
                }
            }

            const selectors = [
                'a[href*="http"][target="_blank"]', 'a[href*="www"][target="_blank"]',
                'div[class*="x9f619"] a[href*="http"]', 'span[dir="auto"] a[href*="http"]',
                'span[dir="auto"].x1qq9wsj', 'button[class*="_acan"][class*="_acao"]',
                'div[class*="_ap3a"][dir="auto"]'
            ];

            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const href = el.tagName === 'A' ? el.href : '';
                    const text = el.textContent || el.innerText || '';

                    const link = new Function('href', 'text', `return (${extractLink})(href, text);`)(href, text);
                    if (link) return link;
                }
            }
            return '';
        }, extractLink.toString());

    } catch (error) {
        console.warn(`⚠️ Lỗi truy cập hồ sơ ${profileUrl}:`, error.message);
        return '';
    } finally {
        await page.close();
    }
};

module.exports = {
    findSocialLinks,
    getWebsiteFromSocialProfile
};