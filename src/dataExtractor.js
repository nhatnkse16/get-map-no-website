// src/dataExtractor.js
const { wait } = require('./utils');

const extractCoordinates = (url) => {
    const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return match ? `${match[1]},${match[2]}` : 'Unknown';
};

const getInnerText = async (page, selector) => {
    try {
        await page.waitForSelector(selector, { timeout: 3000 });
        return await page.$eval(selector, el => el.innerText.trim());
    } catch {
        return null;
    }
};

const getRatingAndReviews = async (page) => {
    try {
        const selector = 'div.F7nice';
        await page.waitForSelector(selector, { timeout: 3000 });

        const ratingInfo = await page.$eval(selector, el => {
            const ratingTextElement = el.querySelector('span[aria-hidden="true"]');
            const reviewsTextElement = el.querySelector('span[aria-label*="reviews"]');

            const rating = ratingTextElement ? ratingTextElement.innerText.trim() : 'N/A';
            let reviews = 'N/A';

            if (reviewsTextElement) {
                const ariaLabel = reviewsTextElement.getAttribute('aria-label');
                if (ariaLabel) {
                    const match = ariaLabel.match(/(\d+)\sreviews/);
                    if (match && match[1]) {
                        reviews = match[1];
                    } else {
                        const textContent = reviewsTextElement.innerText.trim();
                        if (textContent) {
                            reviews = textContent.replace(/[()]/g, '');
                        }
                    }
                } else {
                    const textContent = reviewsTextElement.innerText.trim();
                    if (textContent) {
                        reviews = textContent.replace(/[()]/g, '');
                    }
                }
            }
            return { rating, reviews };
        });
        return ratingInfo;
    } catch (error) {
        // console.warn(`⚠️ Không thể lấy số sao hoặc lượt đánh giá: ${error.message}`);
        return { rating: 'N/A', reviews: 'N/A' };
    }
};

module.exports = {
    extractCoordinates,
    getInnerText,
    getRatingAndReviews
};