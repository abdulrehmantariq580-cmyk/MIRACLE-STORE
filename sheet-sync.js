/* =========================================================
   MIRACLE STORE - GOOGLE SHEET PRODUCT SYNC MODULE (sheet-sync.js)
   ========================================================= */

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTLpK648W8ufKmKP-8QRidY_nG8K7qDECjyHn3aDCyyTgYz1zKIFS32dA8BLiTbvo4oXBcjjzZn5dRc/pub?output=csv';

// Convert Google Drive view/open link to direct CDN preview URL
function convertDriveToCdn(url) {
    if (!url) return 'media/product_1.webp';
    const trimmed = String(url).trim();
    const match = trimmed.match(/[-\w]{25,}/);
    if (trimmed.includes('drive.google.com') && match) {
        return `https://lh3.googleusercontent.com/d/${match[0]}`;
    }
    return trimmed;
}

// Normalize category into 5 core keys
function normalizeCategoryKey(raw) {
    if (!raw) return 'other';
    const c = String(raw).toLowerCase().trim();
    if (c.includes('watch') || c.includes('ghadi')) return 'watches';
    if (c.includes('accessor') || c.includes('mobile') || c.includes('cover') || c.includes('charger') || c.includes('cable') || c.includes('earbud')) return 'accessories';
    if (c.includes('cloth') || c.includes('dress') || c.includes('suit') || c.includes('kurti') || c.includes('lawn') || c.includes('fabric') || c.includes('women')) return 'clothing';
    if (c.includes('cosmetic') || c.includes('makeup') || c.includes('skin') || c.includes('serum') || c.includes('cream') || c.includes('beauty')) return 'cosmetics';
    if (c.includes('flower') || c.includes('decor') || c.includes('vase') || c.includes('pot') || c.includes('plant')) return 'flowers';
    return 'other';
}

// Clean category label for display
function getCategoryLabel(key) {
    switch (key) {
        case 'watches': return 'Luxury Watches';
        case 'accessories': return 'Mobile Accessories';
        case 'clothing': return "Women's Clothing";
        case 'cosmetics': return 'Cosmetics & Beauty';
        case 'flowers': return 'Flowers & Home Decor';
        default: return 'Miracle Collection';
    }
}

// Clean price into number
function cleanNumericPrice(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/[^0-9]/g, '');
    const num = parseInt(str, 10);
    return isNaN(num) ? 0 : num;
}

// Full RFC-compliant CSV Parser handling quotes, commas, multiline
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

// Fetch and parse all products from Google Sheets
async function fetchProductsFromSheet(forceRefresh = false) {
    const CACHE_KEY = 'miracle_products_cache_v2';
    const CACHE_TIME_KEY = 'miracle_products_cache_time';
    const CACHE_DURATION = 60 * 1000; // 1 minute fresh cache

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
        let nameIdx = -1, catIdx = -1, priceIdx = -1, imgIdx = -1, descIdx = -1, stockIdx = -1;

        headers.forEach((h, idx) => {
            if (h.includes('name') || h.includes('title') || h.includes('product') || h.includes('item') || h.includes('naam')) {
                if (nameIdx === -1) nameIdx = idx;
            }
            if (h.includes('categor') || h.includes('type') || h.includes('section')) {
                catIdx = idx;
            }
            if (h.includes('price') || h.includes('cost') || h.includes('amount') || h.includes('rate') || h.includes('rs') || h.includes('keemat')) {
                priceIdx = idx;
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

        // Fallback positions based on standard form creation
        if (nameIdx === -1) nameIdx = 1;
        if (catIdx === -1) catIdx = 2;
        if (priceIdx === -1) priceIdx = 3;
        if (imgIdx === -1) imgIdx = 4;
        if (descIdx === -1 && headers.length > 5) descIdx = 5;

        // Data rows excluding header
        // Reverse so that the NEWEST entries submitted via Form come FIRST
        const dataRows = parsedRows.slice(1).reverse();

        const products = [];

        dataRows.forEach((row, rowIndex) => {
            const rawName = (row[nameIdx] || '').trim();
            const rawCat = (row[catIdx] || '').trim();
            const rawPrice = (row[priceIdx] || '').trim();
            const rawImg = (row[imgIdx] || '').trim();
            const rawDesc = descIdx > -1 ? (row[descIdx] || '').trim() : '';
            const rawStock = stockIdx > -1 ? (row[stockIdx] || '').trim() : '';

            // Ignore totally empty rows
            if (!rawName && !rawImg) return;

            const numericPrice = cleanNumericPrice(rawPrice);
            const categoryKey = normalizeCategoryKey(rawCat);
            const directImg = convertDriveToCdn(rawImg);
            const uniqueId = 'prod_' + (dataRows.length - rowIndex) + '_' + rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

            // Stock calculation
            // If rawStock is explicitly '0', 'out of stock', 'no', 'sold out' -> out of stock
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
                price: numericPrice,
                priceFormatted: 'Rs. ' + numericPrice.toLocaleString('en-PK'),
                image: directImg,
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
        return products;

    } catch (err) {
        console.error('Error fetching Google Sheets CSV:', err);
        return [];
    }
}

// Render universal product card HTML
function createProductCardHtml(p) {
    const safeTitle = escapeCartHtml(p.title);
    const safePriceFormatted = escapeCartHtml(p.priceFormatted);
    const safeDirectImg = escapeCartHtml(p.image);
    const safeOriginalImg = escapeCartHtml(p.originalImage);
    const safeId = escapeCartHtml(p.id);

    const stockBadge = p.inStock
        ? `<span class="product-badge-tag stock-in"><i class="fa-solid fa-circle-check"></i> In Stock</span>`
        : `<span class="product-badge-tag stock-out"><i class="fa-solid fa-circle-xmark"></i> Out of Stock</span>`;

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
                <img src="${safeDirectImg}" alt="${safeTitle}" loading="lazy" onerror="this.src='media/product_1.webp';">
            </div>
            <div class="product-info">
                <span class="product-category-label">${escapeCartHtml(p.categoryLabel)}</span>
                <h4 onclick="navigateToProduct('${safeId}')" title="${safeTitle}">${safeTitle}</h4>
                <p class="price">${safePriceFormatted}</p>
                <div class="product-actions-wrap">
                    ${buttonHtml}
                    <button type="button" class="view-details-btn-icon" onclick="navigateToProduct('${safeId}')" title="View Details">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Open product details page
function navigateToProduct(id) {
    window.location.href = `product.html?id=${encodeURIComponent(id)}`;
}

