// src/index.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const readline = require('readline');
const path = require('path');
const fs = require('fs').promises;

// Import các module đã tách
const CONFIG = require('./config');
const { wait, randomDelay } = require('./utils');
const { appendToCsv } = require('./csvHandler');
const { handlePopup } = require('./popupHandler');
const { extractCoordinates, getInnerText, getRatingAndReviews } = require('./dataExtractor');
const { findSocialLinks, getWebsiteFromSocialProfile } = require('./socialScraper');

// Sử dụng plugin Stealth cho Puppeteer
puppeteer.use(StealthPlugin());

// Hàm chính để chạy scraping
const scrapeGoogleMapsByStates = async () => {
    // Khởi tạo interface để đọc input từ người dùng
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Hỏi người dùng từ khóa tìm kiếm
    let keyword = await new Promise(resolve => {
        rl.question(`🔍 Nhập từ khóa tìm kiếm (mặc định: "flower shop" nếu để trống): `, (answer) => {
            rl.close(); // Đóng interface sau khi nhận được câu trả lời
            resolve(answer.trim()); // trim() để loại bỏ khoảng trắng thừa
        });
    });

    // --- LOGIC MỚI: Đặt giá trị mặc định nếu từ khóa trống ---
    if (!keyword) {
        keyword = "flower shop";
        console.log(`➡️ Không nhập từ khóa, sử dụng mặc định: "${keyword}"`);
    }
    // --- KẾT THÚC LOGIC MỚI ---

    // Định nghĩa thư mục đầu ra và tên file CSV
    const outputDir = path.join(__dirname, '..', 'output'); // Lưu vào thư mục 'output' ở cấp trên
    // File duy nhất cho các shop KHÔNG CÓ website từ Maps (nhưng đã tìm kiếm MXH)
    const outputFile = path.join(outputDir, `${keyword.replace(/\s/g, '_')}_no_map_website_info_US.csv`);

    // Tạo thư mục đầu ra nếu chưa tồn tại
    await fs.mkdir(outputDir, { recursive: true });

    // Khởi chạy trình duyệt Puppeteer
    const browser = await puppeteer.launch({
        headless: false, // Chạy trình duyệt có giao diện để dễ quan sát
        defaultViewport: null, // Sử dụng kích thước viewport mặc định của trình duyệt
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'] // Các đối số khởi chạy trình duyệt
        // Nếu muốn dùng trình duyệt khác Chrome/Chromium mặc định của Puppeteer, thêm executablePath hoặc channel:
        // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        // channel: 'chrome',
    });

    try {
        // Khởi tạo file CSV với tiêu đề (header)
        await appendToCsv(outputFile, 'Name,Address,Phone Number,Link Facebook,Link Instagram,Website from FB,Website from IG,Location,URL Google Maps,Star vote,Number of reviews', []);

        // Lặp qua từng tiểu bang của Mỹ
        for (const state of CONFIG.AMERICAN_STATES) {
            console.log(`\n🚀 Đang scraping: "${keyword} ở ${state}"`);

            const page = await browser.newPage(); // Tạo một tab mới cho mỗi tiểu bang
            const processedUrls = new Set(); // Theo dõi các URL cửa hàng đã xử lý để tránh trùng lặp
            let scrapedCount = 0; // Đếm số lượng cửa hàng đã scrape được
            let noNewContentScrolls = 0; // Đếm số lần cuộn mà không có nội dung mới

            try {
                // Xây dựng URL tìm kiếm Google Maps
                const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${keyword} in ${state}`)}`;
                // Đi tới URL tìm kiếm và chờ trang tải xong
                await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                await randomDelay(3000); // Chờ ngẫu nhiên

                // Bắt đầu vòng lặp để cuộn và scrape kết quả
                while (scrapedCount < CONFIG.MAX_RESULTS_PER_STATE) {
                    try {
                        // Chờ cho container chứa các kết quả xuất hiện
                        await page.waitForSelector('div[role="feed"]', { timeout: 10000 });
                    } catch (e) {
                        console.log(`⚠️ Hết kết quả hoặc không tìm thấy container feed cho ${state}. Lỗi: ${e.message}`);
                        break; // Thoát vòng lặp nếu không tìm thấy feed
                    }

                    // Tìm phần tử có thể cuộn
                    const scrollable = await page.$('div[role="feed"]');
                    if (!scrollable) {
                        console.log(`⚠️ Không tìm thấy phần tử cuộn được cho ${state}.`);
                        break;
                    }

                    // Lấy tất cả các liên kết đến trang chi tiết của các cửa hàng
                    const shopHrefs = await page.$$eval('a.hfpxzc', links => links.map(link => link.href));
                    let newShopsFound = false; // Cờ để kiểm tra xem có cửa hàng mới được tìm thấy trong lần lặp này không

                    // Lặp qua từng liên kết cửa hàng
                    for (const shopHref of shopHrefs) {
                        // Bỏ qua nếu đã xử lý hoặc đã đạt giới hạn số lượng kết quả
                        if (processedUrls.has(shopHref) || scrapedCount >= CONFIG.MAX_RESULTS_PER_STATE) {
                            continue;
                        }

                        const detailPage = await browser.newPage(); // Mở một tab mới cho trang chi tiết
                        try {
                            // Đi tới trang chi tiết của cửa hàng
                            await detailPage.goto(shopHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await randomDelay(2000); // Chờ ngẫu nhiên

                            // Trích xuất thông tin cơ bản của cửa hàng
                            const name = await getInnerText(detailPage, 'h1.DUwDvf') || 'Unknown Name';
                            const address = await getInnerText(detailPage, 'button[data-item-id="address"] div.fontBodyMedium, div[data-item-id="address"] div.fontBodyMedium') || 'Không có địa chỉ';
                            const phone = await getInnerText(detailPage, 'button[data-item-id^="phone"] div.fontBodyMedium, div[data-item-id^="phone"] div.fontBodyMedium') || 'Không có số điện thoại';
                            const { rating, reviews } = await getRatingAndReviews(detailPage); // Lấy số sao và số lượt đánh giá

                            // Trích xuất link website từ Google Maps nếu có
                            const websiteElement = await detailPage.$('a[data-item-id="authority"]');
                            const websiteFromMaps = websiteElement ? await detailPage.evaluate(el => el.href, websiteElement) : '';

                            const mapsUrl = detailPage.url(); // URL của trang Google Maps hiện tại
                            const coordinates = extractCoordinates(mapsUrl); // Trích xuất tọa độ từ URL

                            console.log(`\n--- Cửa hàng ${scrapedCount + 1}/${CONFIG.MAX_RESULTS_PER_STATE} (${state}) ---`);
                            console.log(`${name} | ${address} | ${phone} | ${rating} sao (${reviews} lượt đánh giá)`);

                            // --- LOGIC PHÂN CHIA MỚI NHẤT ---
                            if (websiteFromMaps !== '') {
                                // Nếu có website từ Maps, KHÔNG GHI VÀO CSV, chỉ log ra console
                                console.log(`✅ ${name} có website từ Google Maps: ${websiteFromMaps}. Bỏ qua ghi vào file CSV.`);
                            } else {
                                // Nếu KHÔNG CÓ website từ Maps, tiến hành tìm kiếm MXH và ghi vào file CSV
                                console.log(`🔍 Không có website từ Google Maps cho "${name}". Đang tìm kiếm mạng xã hội...`);

                                const socialLinks = await findSocialLinks(browser, name);
                                const facebookLink = socialLinks.facebookLink || 'Không có';
                                const instagramLink = socialLinks.instagramLink || 'Không có';

                                let websiteFromFB = 'Không có';
                                let websiteFromIG = 'Không có';

                                // Trích xuất website từ Facebook nếu tìm thấy hồ sơ
                                if (facebookLink !== 'Không có') {
                                    console.log(`🔍 Đang kiểm tra website trên Facebook: ${facebookLink}`);
                                    const fbWebsite = await getWebsiteFromSocialProfile(browser, facebookLink);
                                    if (fbWebsite) {
                                        websiteFromFB = fbWebsite;
                                        console.log(`✅ Website tìm thấy trên FB: ${fbWebsite}`);
                                    } else {
                                        console.log(`❌ Không có website trên hồ sơ Facebook`);
                                    }
                                }

                                // Trích xuất website từ Instagram nếu tìm thấy hồ sơ
                                if (instagramLink !== 'Không có') {
                                    console.log(`🔍 Đang kiểm tra website trên Instagram: ${instagramLink}`);
                                    const igWebsite = await getWebsiteFromSocialProfile(browser, instagramLink);
                                    if (igWebsite) {
                                        websiteFromIG = igWebsite;
                                        console.log(`✅ Website tìm thấy trên IG: ${igWebsite}`);
                                    } else {
                                        console.log(`❌ Không có website trên hồ sơ Instagram`);
                                    }
                                }
                                console.log(`📋 Tóm tắt: FB=${facebookLink} | IG=${instagramLink} | Website FB=${websiteFromFB} | Website IG=${websiteFromIG}`);

                                // Ghi vào outputFile (không có website Maps, đã kiểm tra MXH)
                                await appendToCsv(outputFile, '', [
                                    name, address, phone,
                                    facebookLink, instagramLink, websiteFromFB, websiteFromIG,
                                    coordinates, mapsUrl, rating, reviews
                                ]);
                                console.log(`➡️ Đã ghi vào file "${path.basename(outputFile)}".`);
                            }
                            // --- KẾT THÚC LOGIC PHÂN CHIA ---

                            processedUrls.add(shopHref); // Đánh dấu URL đã xử lý
                            scrapedCount++; // Tăng số lượng cửa hàng đã scrape
                            newShopsFound = true; // Đánh dấu rằng có cửa hàng mới được tìm thấy
                        } catch (error) {
                            console.error(`⚠️ Lỗi khi xử lý cửa hàng ${shopHref}:`, error.message);
                        } finally {
                            await detailPage.close(); // Đóng tab chi tiết
                            await randomDelay(500, 200); // Chờ một khoảng thời gian ngắn
                        }
                    }

                    // Cuộn trang để tải thêm kết quả
                    const previousHeight = await page.evaluate(el => el.scrollHeight, scrollable);
                    await page.evaluate(el => el.scrollBy(0, el.scrollHeight), scrollable);
                    await randomDelay(3000, 1500); // Chờ sau khi cuộn
                    const newHeight = await page.evaluate(el => el.scrollHeight, scrollable);

                    // Kiểm tra xem có nội dung mới được tải không
                    if (newHeight === previousHeight && !newShopsFound) {
                        noNewContentScrolls++;
                        if (noNewContentScrolls >= CONFIG.MAX_NO_NEW_CONTENT_ATTEMPTS) {
                            console.log(`Không còn kết quả mới hoặc không thể cuộn thêm cho ${state}.`);
                            break; // Thoát nếu không có nội dung mới sau nhiều lần thử
                        }
                    } else {
                        noNewContentScrolls = 0; // Reset bộ đếm nếu có nội dung mới
                    }
                }

            } catch (error) {
                console.error(`❗ Lỗi tổng quát khi scrape ${state}:`, error.message);
            } finally {
                await page.close(); // Đóng tab của tiểu bang hiện tại
                console.log(`✅ ${state} hoàn tất (${scrapedCount} cửa hàng đã được xử lý)`);
                await randomDelay(5000, 2000); // Chờ giữa các tiểu bang
            }
        }

    } catch (error) {
        console.error("❗ Lỗi tổng quát trong quá trình scraping:", error.message);
    } finally {
        await browser.close(); // Đóng trình duyệt khi hoàn tất
        console.log("\n🎉 Scraping hoàn thành!");
        console.log(`📁 File các shop không có website từ Maps: ${outputFile}`);
    }
};

// Lancer le scraping
scrapeGoogleMapsByStates();