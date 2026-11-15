/* =========================================================
   MIRACLE STORE - UNIVERSAL SHOPPING CART MODULE (cart.js)
   ========================================================= */

const MIRACLE_CART_KEY = 'miracle_store_cart_v1';
const MIRACLE_FLAT_DELIVERY = 300; // Flat delivery charges Rs. 300 across Pakistan

// Clean price string into numeric value (e.g. "Rs. 4,400" -> 4400)
function parsePriceToNumber(priceVal) {
    if (typeof priceVal === 'number') return priceVal;
    if (!priceVal) return 0;
    const cleaned = String(priceVal).replace(/[^0-9]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
}

// Format number into Pakistani Rupee string (e.g. 4400 -> "Rs. 4,400")
function formatPKR(amount) {
    const num = typeof amount === 'number' ? amount : parsePriceToNumber(amount);
    return 'Rs. ' + num.toLocaleString('en-PK');
}

// Retrieve cart from localStorage
function getMiracleCart() {
    try {
        const raw = localStorage.getItem(MIRACLE_CART_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('Error reading cart from localStorage:', e);
        return [];
    }
}

// Save cart to localStorage and update UI everywhere
function saveMiracleCart(cart) {
    try {
        localStorage.setItem(MIRACLE_CART_KEY, JSON.stringify(cart));
        renderSlidingCartUI();
        updateHeaderCartBadge();
        // Dispatch custom event for pages like checkout.html to auto-update
        window.dispatchEvent(new CustomEvent('miracleCartUpdated', { detail: { cart } }));
    } catch (e) {
        console.error('Error saving cart to localStorage:', e);
    }
}

// Calculate totals
function getMiracleCartTotals() {
    const cart = getMiracleCart();
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const delivery = subtotal > 0 ? MIRACLE_FLAT_DELIVERY : 0;
    const grandTotal = subtotal + delivery;

    return {
        cart,
        subtotal,
        delivery,
        grandTotal,
        totalCount
    };
}

// Add item to cart
function addToCart(title, price, image, originalImage = '', qty = 1, options = {}) {
    if (!title) return;
    const cart = getMiracleCart();
    const numericPrice = parsePriceToNumber(price);
    const cleanId = String(title).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    const quantityToAdd = Math.max(1, parseInt(qty, 10) || 1);

    const existingIndex = cart.findIndex(item => item.id === cleanId || item.title.trim().toLowerCase() === title.trim().toLowerCase());

    if (existingIndex > -1) {
        cart[existingIndex].quantity += quantityToAdd;
        // Update images if newer
        if (image) cart[existingIndex].image = image;
        if (originalImage) cart[existingIndex].originalImage = originalImage;
    } else {
        cart.push({
            id: cleanId,
            title: title.trim(),
            price: numericPrice,
            image: image || 'media/product_1.webp',
            originalImage: originalImage || image || 'media/product_1.webp',
            quantity: quantityToAdd
        });
    }

    saveMiracleCart(cart);

    showMiracleToast(`Added "${title.substring(0, 22)}${title.length > 22 ? '...' : ''}" to cart!`);

    if (options.openCart !== false) {
        openSlidingCart();
    }
}

// Update item quantity (+1 or -1). If qty becomes <= 0, delete item
function updateCartItemQty(id, delta) {
    const cart = getMiracleCart();
    const itemIndex = cart.findIndex(item => item.id === id);

    if (itemIndex === -1) return;

    cart[itemIndex].quantity += delta;

    if (cart[itemIndex].quantity <= 0) {
        const removedTitle = cart[itemIndex].title;
        cart.splice(itemIndex, 1);
        saveMiracleCart(cart);
        showMiracleToast(`Removed "${removedTitle}" from cart`);
    } else {
        saveMiracleCart(cart);
    }
}

// Remove item directly
function removeCartItem(id) {
    const cart = getMiracleCart();
    const filtered = cart.filter(item => item.id !== id);
    saveMiracleCart(filtered);
    showMiracleToast('Item removed from cart');
}

// Clear entire cart
function clearMiracleCart() {
    saveMiracleCart([]);
}

// Update header badge count
function updateHeaderCartBadge() {
    const { totalCount } = getMiracleCartTotals();
    const badges = document.querySelectorAll('.cart-badge-count, #headerCartCount');
    badges.forEach(badge => {
        if (badge) {
            badge.textContent = totalCount;
            badge.style.display = totalCount > 0 ? 'inline-block' : 'none';
        }
    });

    const headerCounts = document.querySelectorAll('#cartHeaderCount');
    headerCounts.forEach(hc => {
        if (hc) hc.textContent = totalCount;
    });
}

// Render sliding cart UI
function renderSlidingCartUI() {
    const container = document.getElementById('cartItemsContainer');
    if (!container) return;

    const { cart, subtotal, delivery, grandTotal, totalCount } = getMiracleCartTotals();

    // Summary elements
    const subtotalEl = document.getElementById('cartSubtotal');
    const deliveryEl = document.getElementById('cartDelivery');
    const grandTotalEl = document.getElementById('cartGrandTotal');
    const checkoutBtn = document.getElementById('cartCheckoutBtn');
    const footerEl = document.getElementById('cartFooter');

    if (subtotalEl) subtotalEl.textContent = formatPKR(subtotal);
    if (deliveryEl) deliveryEl.textContent = subtotal > 0 ? formatPKR(delivery) : 'Rs. 0';
    if (grandTotalEl) grandTotalEl.textContent = formatPKR(grandTotal);

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart-state">
                <i class="fa-solid fa-cart-shopping"></i>
                <h4>Your Cart is Empty</h4>
                <p>Add some beautiful items to your cart to get started!</p>
                <a href="catalog.html" class="start-shopping-btn" onclick="closeSlidingCart()">Browse Catalog</a>
            </div>
        `;
        if (checkoutBtn) {
            checkoutBtn.style.pointerEvents = 'none';
            checkoutBtn.style.opacity = '0.5';
        }
    } else {
        if (checkoutBtn) {
            checkoutBtn.style.pointerEvents = 'auto';
            checkoutBtn.style.opacity = '1';
        }

        let html = '';
        cart.forEach(item => {
            const itemSubtotal = item.price * item.quantity;
            html += `
                <div class="cart-item-row" data-id="${item.id}">
                    <img src="${item.image}" class="cart-item-img" alt="${escapeCartHtml(item.title)}" onerror="this.src='media/product_1.webp';">
                    <div class="cart-item-details">
                        <h5 class="cart-item-title" title="${escapeCartHtml(item.title)}">${escapeCartHtml(item.title)}</h5>
                        <div class="cart-item-unit-price">${formatPKR(item.price)} each</div>
                        <div class="cart-item-controls">
                            <div class="qty-control-box">
                                <button type="button" class="qty-btn" onclick="updateCartItemQty('${item.id}', -1)" title="Decrease">-</button>
                                <span class="qty-number">${item.quantity}</span>
                                <button type="button" class="qty-btn" onclick="updateCartItemQty('${item.id}', 1)" title="Increase">+</button>
                            </div>
                            <span class="item-subtotal">${formatPKR(itemSubtotal)}</span>
                        </div>
                    </div>
                    <button type="button" class="cart-delete-btn" onclick="removeCartItem('${item.id}')" title="Delete product">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
    }
}

// Drawer Toggle Functions
function toggleCart() {
    const cartEl = document.getElementById('slidingCart');
    const overlayEl = document.getElementById('cartOverlay');
    if (!cartEl) return;
    const isActive = cartEl.classList.contains('active');
    if (isActive) {
        closeSlidingCart();
    } else {
        openSlidingCart();
    }
}

function openSlidingCart() {
    const cartEl = document.getElementById('slidingCart');
    const overlayEl = document.getElementById('cartOverlay');
    if (cartEl) cartEl.classList.add('active');
    if (overlayEl) overlayEl.classList.add('active');
    renderSlidingCartUI();
}

function closeSlidingCart() {
    const cartEl = document.getElementById('slidingCart');
    const overlayEl = document.getElementById('cartOverlay');
    if (cartEl) cartEl.classList.remove('active');
    if (overlayEl) overlayEl.classList.remove('active');
}

// Sliding Mobile Navigation Menu
function toggleMenu() {
    const mobileMenu = document.querySelector('.mobile-menu');
    const overlay = document.querySelector('.mobile-menu-overlay');
    if (mobileMenu) mobileMenu.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
}

// Toast Notifications
function showMiracleToast(message, icon = 'fa-check') {
    let toast = document.getElementById('miracleToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'miracleToast';
        toast.className = 'miracle-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    toast.classList.add('active');

    if (window._miracleToastTimer) clearTimeout(window._miracleToastTimer);
    window._miracleToastTimer = setTimeout(() => {
        toast.classList.remove('active');
    }, 2800);
}

// HTML escape helper
function escapeCartHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    renderSlidingCartUI();
    updateHeaderCartBadge();

    // Link any cart toggle icons
    document.querySelectorAll('.header-cart-wrap, .fa-cart-shopping').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            toggleCart();
        });
    });
});

