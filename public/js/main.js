function getToken() { return localStorage.getItem('token'); }
function getAdminToken() { return localStorage.getItem('adminToken'); }

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + getToken()
  };
}

function getAdminHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + getAdminToken()
  };
}

function requireLogin() {
  if (!getToken()) {
    window.location.href = '/login';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  window.location.href = '/login';
}

function checkLoginStatus() {
  const token = getToken();
  const navAuth = document.getElementById('nav-auth');
  if (!navAuth) return;

  if (token) {
    navAuth.innerHTML = `
      <a href="/profile" class="text-gray-600 hover:text-sky-500"><i class="fas fa-user mr-1"></i>Profile</a>
      <a href="/cart" class="text-gray-600 hover:text-sky-500 relative">
        <i class="fas fa-shopping-cart"></i>
        <span id="cart-badge" class="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center hidden">0</span>
      </a>
      <button onclick="logout()" class="text-red-400 hover:text-red-500 text-sm">Logout</button>
    `;
    loadCartCount();
  } else {
    navAuth.innerHTML = `
      <a href="/login" class="text-gray-600 hover:text-sky-500">Login</a>
      <a href="/register" class="gradient-bg text-white px-5 py-2 rounded-full font-medium hover:opacity-90">Sign Up</a>
    `;
  }
}

async function loadCartCount() {
  try {
    const res = await fetch('/api/shop/cart', { headers: getAuthHeaders() });
    const data = await res.json();
    if (data.success) {
      const badge = document.getElementById('cart-badge');
      if (badge) {
        const count = data.data.reduce((sum, item) => sum + item.quantity, 0);
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);
      }
    }
  } catch (e) {}
}

function getOrderStatusText(status) {
  const map = {
    1: 'Pending',
    2: 'Paid',
    3: 'Shipped',
    4: 'Completed',
    5: 'Cancelled'
  };
  return map[status] || 'Unknown';
}

function getOrderStatusColor(status) {
  const map = {
    1: 'text-blue-500',
    2: 'text-yellow-500',
    3: 'text-purple-500',
    4: 'text-green-500',
    5: 'text-gray-400'
  };
  return map[status] || 'text-gray-500';
}

function formatPrice(price) {
  return '$' + parseFloat(price).toFixed(2);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-xl text-white font-medium z-50 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}
