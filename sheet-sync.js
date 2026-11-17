/* =========================================================
   MIRACLE STORE - GOOGLE SHEET PRODUCT SYNC MODULE (sheet-sync.js)
   ========================================================= */

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTLpK648W8ufKmKP-8QRidY_nG8K7qDECjyHn3aDCyyTgYz1zKIFS32dA8BLiTbvo4oXBcjjzZn5dRc/pub?output=csv';

function convertDriveToCdn(url, size = 600) {
    if (!url) return 'media/product_1.webp';
    const trimmed = String(url).trim();
    const match = trimmed.match(/[-\w]{25,}/);
    if (trimmed.includes('drive.google.com') && match) {
        const fileId = match[0];
        if (size === 0 || size === 'original') {
            return `https://lh3.googleusercontent.com/d/${fileId}`;
        }
        return `https://lh3.googleusercontent.com/d/${fileId}=w${size}-rw`;
    }
    return trimmed;
}

function normalizeCategoryKey(raw) {
    if (!raw) return 'other';
    const c = String(raw).toLowerCase().trim();
    if (c.includes('watch') || c.includes('ghadi')) return 'watches';
    if (c.includes('accessor') || c.includes('mobile') || c.includes('cover') || c.includes('charger') || c.includes('cable') || c.includes('earbud')) return 'accessories';
    if (c.includes('bangle') || c.includes('churi') || c.includes('choodi') || c.includes('kara') || c.includes('bracelet') || c.includes('jewel')) return 'bangles';
    if (c.includes('cloth') || c.includes('dress') || c.includes('suit') || c.includes('kurti') || c.includes('lawn') || c.includes('fabric') || c.includes('women')) return 'clothing';
    if (c.includes('cosmetic') || c.includes('makeup') || c.includes('skin') || c.includes('serum') || c.includes('cream') || c.includes('beauty')) return 'cosmetics';
    if (c.includes('flower') || c.includes('decor') || c.includes('vase') || c.includes('pot') || c.includes('plant')) return 'flowers';
    if (c.includes('fiber') || c.includes('fibre') || c.includes('optic') || c.includes('internet') || c.includes('router') || c.includes('patch') || c.includes('onu') || c.includes('ont') || c.includes('pon')) return 'fiber';
    return 'other';
}

function getCategoryLabel(key) {
    switch (key) {
        case 'watches': return 'Luxury Watches';
        case 'accessories': return 'Mobile Accessories';
        case 'clothing': return "Women's Clothing";
        case 'bangles': return 'Bangles & Jewellery';
        case 'cosmetics': return 'Cosmetics & Beauty';
        case 'flowers': return 'Flowers & Home Decor';
        case 'fiber': return 'Fiber Optic & Internet Products';
        default: return 'Miracle Collection';
    }
}

function cleanNumericPrice(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/[^0-9]/g, '');
    const num = parseInt(str, 10);
    return isNaN(num) ? 0 : num;
}

function parseDualPrices(primaryPriceVal, secondaryPriceVal = '') {
    let p1 = cleanNumericPrice(primaryPriceVal);
    let p2 = cleanNumericPrice(secondaryPriceVal);

    if (primaryPriceVal && (!p2 || p1 === p2)) {
        const matches = String(primaryPriceVal).match(/\d[\d,.]*/g);
        if (matches && matches.length >= 2) {
            const num1 = cleanNumericPrice(matches[0]);
            const num2 = cleanNumericPrice(matches[1]);
            if (num1 > 0 && num2 > 0 && num1 !== num2) {
                p1 = Math.max(num1, num2);
                p2 = Math.min(num1, num2);
            }
        }
    }

    let regularPrice = 0;
    let salePrice = 0;

    if (p1 > 0 && p2 > 0 && p1 !== p2) {
        regularPrice = Math.max(p1, p2);
        salePrice = Math.min(p1, p2);
    } else {
        salePrice = p1 || p2 || 0;
        regularPrice = 0;
    }

    const hasDiscount = regularPrice > salePrice && salePrice > 0;
    const discountPercent = hasDiscount ? Math.round(((regularPrice - salePrice) / regularPrice) * 100) : 0;

    return {
        salePrice,
        regularPrice,
        hasDiscount,
        discountPercent,
        priceFormatted: 'Rs. ' + salePrice.toLocaleString('en-PK'),
        regularPriceFormatted: regularPrice > 0 ? 'Rs. ' + regularPrice.toLocaleString('en-PK') : ''
    };
}

function parseCsvFull(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell.trim());
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            currentRow.push(currentCell.trim());
            if (currentRow.some(c => c.length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) {
            rows.push(currentRow);
        }
    }

    return rows;
}

async function fetchProductsFromSheet(forceRefresh = false) {
    const CACHE_KEY = 'miracle_products_cache_v3';
    const CACHE_TIME_KEY = 'miracle_products_cache_time';
    const CACHE_DURATION = 45 * 1000; 

    if (!forceRefresh) {
        try {
            const cachedTime = parseInt(sessionStorage.getItem(CACHE_TIME_KEY), 10);
            const cachedData = sessionStorage.getItem(CACHE_KEY);
            if (cachedTime && cachedData && (Date.now() - cachedTime < CACHE_DURATION)) {
                const parsed = JSON.parse(cachedData);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    window.miracleProducts = parsed;
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('Session cache read error:', e);
        }
    }

    try {
        const url = GOOGLE_SHEET_CSV_URL + '&_t=' + Date.now();
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Google Sheets CSV HTTP error: ${response.status}`);
        }
        const csvText = await response.text();
        const parsedRows = parseCsvFull(csvText);

        if (!parsedRows || parsedRows.length < 2) {
            console.warn('Google Sheet has no data rows yet.');
            return [];
        }

        const headers = parsedRows[0].map(h => (h || '').toLowerCase().trim());
        let nameIdx = -1, catIdx = -1, priceIdx = -1, regPriceIdx = -1, imgIdx = -1, descIdx = -1, stockIdx = -1;

        headers.forEach((h, idx) => {
            if (h.includes('name') || h.includes('title') || h.includes('product') || h.includes('item') || h.includes('naam')) {
                if (nameIdx === -1) nameIdx = idx;
            }
            if (h.includes('categor') || h.includes('type') || h.includes('section')) {
                catIdx = idx;
            }
            if (h.includes('regular') || h.includes('original') || h.includes('old') || h.includes('cut') || h.includes('mrp') || h.includes('compare')) {
                regPriceIdx = idx;
            } else if (h.includes('price') || h.includes('cost') || h.includes('amount') || h.includes('rate') || h.includes('rs') || h.includes('sale') || h.includes('keemat')) {
                if (priceIdx === -1) priceIdx = idx;
            }
            if (h.includes('image') || h.includes('photo') || h.includes('picture') || h.includes('pic') || h.includes('drive') || h.includes('file') || h.includes('upload') || h.includes('tasweer')) {
                imgIdx = idx;
            }
            if (h.includes('desc') || h.includes('detail') || h.includes('about')) {
                descIdx = idx;
            }
            if (h.includes('stock') || h.includes('qty') || h.includes('quantity') || h.includes('available')) {
                stockIdx = idx;
            }
        });

        if (nameIdx === -1) nameIdx = 1;
        if (catIdx === -1) catIdx = 2;
        if (priceIdx === -1) priceIdx = 3;
        if (imgIdx === -1) imgIdx = 4;
        if (descIdx === -1 && headers.length > 5) descIdx = 5;

        const dataRows = parsedRows.slice(1).reverse();
        const products = [];

        dataRows.forEach((row, rowIndex) => {
            const rawName = (row[nameIdx] || '').trim();
            const rawCat = (row[catIdx] || '').trim();
            const rawPrice = (row[priceIdx] || '').trim();
            const rawRegPrice = regPriceIdx > -1 ? (row[regPriceIdx] || '').trim() : '';
            const rawImg = (row[imgIdx] || '').trim();
            const rawDesc = descIdx > -1 ? (row[descIdx] || '').trim() : '';
            const rawStock = stockIdx > -1 ? (row[stockIdx] || '').trim() : '';

            if (!rawName && !rawImg) return;

            const priceInfo = parseDualPrices(rawPrice, rawRegPrice);
            const categoryKey = normalizeCategoryKey(rawCat);
            const directImg = convertDriveToCdn(rawImg, 600);
            const fullResImg = convertDriveToCdn(rawImg, 'original');
            const uniqueId = 'prod_' + (dataRows.length - rowIndex) + '_' + rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

            let inStock = true;
            let stockCount = 10;
            if (rawStock) {
                const sLower = rawStock.toLowerCase();
                if (sLower === '0' || sLower.includes('out') || sLower === 'no' || sLower.includes('sold')) {
                    inStock = false;
                    stockCount = 0;
                } else {
                    const parsedNum = parseInt(rawStock.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(parsedNum)) {
                        stockCount = parsedNum;
                        inStock = parsedNum > 0;
                    }
                }
            }

            products.push({
                id: uniqueId,
                title: rawName || 'Miracle Store Exclusive',
                category: categoryKey,
                categoryRaw: rawCat,
                categoryLabel: getCategoryLabel(categoryKey),
                price: priceInfo.salePrice,
                priceFormatted: priceInfo.priceFormatted,
                regularPrice: priceInfo.regularPrice,
                regularPriceFormatted: priceInfo.regularPriceFormatted,
                hasDiscount: priceInfo.hasDiscount,
                discountPercent: priceInfo.discountPercent,
                image: directImg,
                fullImage: fullResImg,
                originalImage: rawImg || directImg,
                description: rawDesc || 'Premium authentic product from Miracle Store. Crafted with exceptional attention to detail, premium materials, and timeless elegance.',
                inStock: inStock,
                stockCount: stockCount,
                timestamp: row[0] || ''
            });
        });

        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(products));
            sessionStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
        } catch (e) {
            console.warn('Failed to cache in sessionStorage:', e);
        }

        window.miracleProducts = products;
        syncCategoryNavLinks(products);
        return products;

    } catch (err) {
        console.error('Error fetching Google Sheets CSV:', err);
        return [];
    }
}

function createProductCardHtml(p) {
    const safeTitle = escapeCartHtml(p.title);
    const safePriceFormatted = escapeCartHtml(p.priceFormatted);
    const safeDirectImg = escapeCartHtml(p.image);
    const safeOriginalImg = escapeCartHtml(p.originalImage);
    const safeId = escapeCartHtml(p.id);

    const stockBadge = p.inStock
        ? `<span class="product-badge-tag stock-in"><i class="fa-solid fa-circle-check"></i> In Stock</span>`
        : `<span class="product-badge-tag stock-out"><i class="fa-solid fa-circle-xmark"></i> Out of Stock</span>`;

    const discountBadge = p.hasDiscount
        ? `<span class="product-badge-tag discount-tag">-${p.discountPercent}%</span>`
        : '';

    const priceDisplayHtml = p.hasDiscount
        ? `<div class="product-price-box">
             <span class="price-sale">${safePriceFormatted}</span>
             <del class="price-regular-cut">${escapeCartHtml(p.regularPriceFormatted)}</del>
           </div>`
        : `<div class="product-price-box">
             <span class="price-sale">${safePriceFormatted}</span>
           </div>`;

    const buttonHtml = p.inStock
        ? `<button type="button" class="add-to-cart-btn" onclick="addToCart('${safeTitle.replace(/'/g, "\\'")}', ${p.price}, '${safeDirectImg.replace(/'/g, "\\'")}', '${safeOriginalImg.replace(/'/g, "\\'")}')">
             <i class="fa-solid fa-cart-plus"></i> Add to Cart
           </button>`
        : `<button type="button" class="add-to-cart-btn btn-disabled" disabled>
             <i class="fa-solid fa-ban"></i> Out of Stock
           </button>`;

    return `
        <div class="product-card" data-category="${p.category}" data-id="${safeId}">
            <div class="product-image-wrap" onclick="navigateToProduct('${safeId}')">
                ${stockBadge}
                ${discountBadge}
                <img src="${safeDirectImg}" alt="${safeTitle}" loading="lazy" decoding="async" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${safeOriginalImg}';}else{this.src='media/product_1.webp';}">
            </div>
            <div class="product-info">
                <span class="product-category-label">${escapeCartHtml(p.categoryLabel)}</span>
                <h4 onclick="navigateToProduct('${safeId}')" title="${safeTitle}">${safeTitle}</h4>
                ${priceDisplayHtml}
                <div class="product-actions-wrap">
                    ${buttonHtml}
                </div>
            </div>
        </div>
    `;
}

function navigateToProduct(id) {
    window.location.href = `product.html?id=${encodeURIComponent(id)}`;
}

function syncCategoryNavLinks(products) {
    if (!Array.isArray(products)) return;
    const allCategories = ['watches', 'accessories', 'clothing', 'bangles', 'cosmetics', 'flowers', 'fiber'];
    allCategories.forEach(catKey => {
        const hasProducts = products.some(p => p.category === catKey);
        document.querySelectorAll(`.category-item[data-category="${catKey}"]`).forEach(circle => {
            if (!hasProducts) {
                circle.classList.add('dyn-circle-hidden');
            } else {
                circle.classList.remove('dyn-circle-hidden');
            }
        });
    });
}
