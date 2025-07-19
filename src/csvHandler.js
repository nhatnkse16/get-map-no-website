// src/csvHandler.js
const fs = require('fs').promises;
const path = require('path');

const appendToCsv = async (filePath, header, dataRow) => {
    const sanitizedDataRow = dataRow.map(item => `"${String(item || '').replace(/"/g, '""')}"`).join(',');
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);

    let content = '';
    if (!fileExists) content += header + '\n';
    content += sanitizedDataRow + '\n';

    try {
        await fs.appendFile(filePath, content, 'utf8');
    } catch (error) {
        console.error(`❌ Lỗi khi ghi CSV vào ${filePath}:`, error.message);
    }
};

module.exports = {
    appendToCsv
};