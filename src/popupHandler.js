// src/popupHandler.js
const { wait } = require('./utils');

const handlePopup = async (page) => {
    const selectors = [
        'button[aria-label="Close"]', 'button[aria-label="Close dialog"]',
        'svg[aria-label="Close"]', 'div[role="button"][tabindex="0"] svg[aria-label="Close"]',
        'button[class*="close"]', 'div[class*="close"]',
        'div[aria-label="Close"]', 'div[role="button"][tabindex="0"]'
    ];

    for (const selector of selectors) {
        try {
            const closeButton = await page.$(selector);
            if (closeButton) {
                await closeButton.click();
                console.log(`✅ Popup đã đóng bằng: ${selector}`);
                await wait(1000);
                return true;
            }
        } catch { }
    }
    return false;
};

module.exports = {
    handlePopup
};