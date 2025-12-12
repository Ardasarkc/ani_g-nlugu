// ========================================
// Ortak Anı Günlüğü - Arda & Asel 💖
// Firebase + LocalStorage Hybrid
// v2.0 - Login System & Live Counter
// ========================================

// Login System
const PASSWORDS = {
    arda: 'A123rda',
    asel: 'A123sel'
};
let currentUser = null; // 'arda' veya 'asel'
let selectedLoginUser = null;

// State
let currentDate = new Date();
let selectedDate = null;
let currentTab = 'arda';
let selectedMood = '💕';
let selectedAuthor = 'together';
let selectedImageFile = null; // Store selected image file
let allMemories = {}; // Tüm anıları tutacak
let unsubscribe = null; // Firebase listener
let counterInterval = null; // Canlı sayaç için interval

// İlişki başlangıç tarihi - 27 Eylül 2025
const RELATIONSHIP_START_DATE = new Date('2025-09-27T00:00:00');

// DOM Elements
const calendarDays = document.getElementById('calendarDays');
const monthYearDisplay = document.getElementById('monthYear');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const memoriesList = document.getElementById('memoriesList');
const selectedDateDisplay = document.getElementById('selectedDate');
const addMemoryBtn = document.getElementById('addMemoryBtn');
const modalOverlay = document.getElementById('modalOverlay');
const closeModalBtn = document.getElementById('closeModal');
const memoryForm = document.getElementById('memoryForm');
const heartsBg = document.getElementById('heartsBg');
const connectionStatus = document.getElementById('connectionStatus');

// Tab buttons
const tabArda = document.getElementById('tabArda');
const tabAsel = document.getElementById('tabAsel');
const tabTogether = document.getElementById('tabTogether');

// Turkish month names
const monthNames = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

// ========================================
// Connection Status
// ========================================

function updateConnectionStatus(connected, message) {
    const statusDot = connectionStatus.querySelector('.status-dot');
    const statusText = connectionStatus.querySelector('.status-text');

    if (connected) {
        statusDot.style.background = '#4ade80';
        statusText.textContent = message || '🔥 Firebase Bağlı';
        connectionStatus.classList.add('connected');
    } else {
        statusDot.style.background = '#fbbf24';
        statusText.textContent = message || '💾 Çevrimdışı Mod';
        connectionStatus.classList.remove('connected');
    }
}

// ========================================
// Storage Functions (Firebase + LocalStorage)
// ========================================

function getLocalMemories() {
    const data = localStorage.getItem('loveMemories');
    return data ? JSON.parse(data) : {};
}

function saveLocalMemories(memories) {
    localStorage.setItem('loveMemories', JSON.stringify(memories));
}

function getDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Firebase'e anı ekle
async function addMemoryToFirebase(memory) {
    if (!window.firebaseConnected || !window.firebaseDB) {
        return null;
    }

    try {
        const { collection, addDoc } = window.firebaseModules;

        // 5 Saniyelik Zaman Aşımı
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Firebase Request Timed Out')), 5000);
        });

        const addDocPromise = addDoc(collection(window.firebaseDB, 'memories'), memory);

        const docRef = await Promise.race([addDocPromise, timeoutPromise]);

        console.log('✅ Anı Firebase\'e eklendi:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Firebase ekleme hatası:', error);
        return null;
    }
}

async function uploadImageToFirebase(file) {
    if (!window.firebaseConnected || !window.firebaseStorage) {
        return null;
    }

    try {
        const { ref, uploadBytes, getDownloadURL } = window.firebaseModules;

        // Create a unique filename
        const filename = `memories/${getDateKey(selectedDate)}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const storageRef = ref(window.firebaseStorage, filename);

        console.log('📤 Fotoğraf yükleniyor:', filename);

        // 15 Saniyelik Zaman Aşımı (Resimler büyük olabilir)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Upload Request Timed Out')), 15000);
        });

        const uploadPromise = uploadBytes(storageRef, file);

        // Upload with timeout
        const snapshot = await Promise.race([uploadPromise, timeoutPromise]);

        // Get URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log('✅ Fotoğraf URL alındı:', downloadURL);

        return downloadURL;
    } catch (error) {
        console.error('Firebase fotoğraf yükleme hatası:', error);
        // alert kaldırıldı - sessizce null döndür ve fallback (Base64) kullan
        return null;
    }
}

// Firebase'den anı sil
async function deleteMemoryFromFirebase(memoryId) {
    if (!window.firebaseConnected || !window.firebaseDB) {
        return false;
    }

    try {
        const { doc, deleteDoc } = window.firebaseModules;
        await deleteDoc(doc(window.firebaseDB, 'memories', memoryId));
        console.log('🗑️ Anı Firebase\'den silindi:', memoryId);
        return true;
    } catch (error) {
        console.error('Firebase silme hatası:', error);
        return false;
    }
}

// Firebase'den anıları dinle (real-time)
function listenToFirebaseMemories() {
    if (!window.firebaseConnected || !window.firebaseDB) {
        // Firebase yoksa localStorage kullan
        allMemories = getLocalMemories();
        updateConnectionStatus(false, '💾 Yerel Depolama');
        generateCalendar();
        updateStats();
        return;
    }

    try {
        const { collection, onSnapshot, query, orderBy } = window.firebaseModules;
        const memoriesRef = collection(window.firebaseDB, 'memories');
        const q = query(memoriesRef, orderBy('createdAt', 'desc'));

        unsubscribe = onSnapshot(q, (snapshot) => {
            // 1. Mevcut 'local_' anıları yedekle (Firebase'den silinmesini önle)
            const localMemories = [];
            Object.values(allMemories).forEach(dayList => {
                dayList.forEach(mem => {
                    if (mem.id && mem.id.startsWith('local_')) {
                        localMemories.push(mem);
                    }
                });
            });

            // 2. Tüm anıları sıfırla ve Firebase'den gelenleri işle
            allMemories = {};

            snapshot.forEach((doc) => {
                const memory = { id: doc.id, ...doc.data() };
                const dateKey = memory.dateKey;

                if (!allMemories[dateKey]) {
                    allMemories[dateKey] = [];
                }
                allMemories[dateKey].push(memory);
            });

            // 3. Yerel anıları geri ekle
            localMemories.forEach(mem => {
                if (!allMemories[mem.dateKey]) {
                    allMemories[mem.dateKey] = [];
                }
                // Tekrar eklemeyi önlemek için kontrol et (gerçi sıfırladık ama olsun)
                if (!allMemories[mem.dateKey].find(m => m.id === mem.id)) {
                    allMemories[mem.dateKey].push(mem);
                }
            });

            // Ayrıca localStorage'a da kaydet (çevrimdışı yedek)
            saveLocalMemories(allMemories);

            updateConnectionStatus(true, '🔥 Firebase Bağlı');
            generateCalendar();
            displayMemories();
            updateStats();

            console.log('📥 Anılar güncellendi:', Object.keys(allMemories).length, 'gün');
        }, (error) => {
            console.error('Firebase dinleme hatası:', error);
            updateConnectionStatus(false, '⚠️ Bağlantı Hatası');
            // Hata durumunda localStorage'ı kullan
            allMemories = getLocalMemories();
            generateCalendar();
            updateStats();
        });

    } catch (error) {
        console.error('Firebase başlatma hatası:', error);
        updateConnectionStatus(false, '⚠️ Firebase Hatası');
        allMemories = getLocalMemories();
    }
}

// ========================================
// Calendar Functions
// ========================================

function generateCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Update header
    monthYearDisplay.textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and total days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    // Get starting day (Monday = 0)
    let startingDay = firstDay.getDay() - 1;
    if (startingDay < 0) startingDay = 6;

    // Clear calendar
    calendarDays.innerHTML = '';

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDay - 1; i >= 0; i--) {
        const day = document.createElement('div');
        day.className = 'day other-month';
        day.textContent = prevMonthLastDay - i;
        calendarDays.appendChild(day);
    }

    // Current month days
    const today = new Date();
    for (let i = 1; i <= totalDays; i++) {
        const day = document.createElement('div');
        day.className = 'day';
        day.textContent = i;

        const dateObj = new Date(year, month, i);
        const dateKey = getDateKey(dateObj);

        // Check if today
        if (dateObj.toDateString() === today.toDateString()) {
            day.classList.add('today');
        }

        // Check if selected
        if (selectedDate && dateObj.toDateString() === selectedDate.toDateString()) {
            day.classList.add('selected');
        }

        // Check if has memories (filtered by current tab)
        if (allMemories[dateKey]) {
            const filteredMemories = filterMemoriesByTab(allMemories[dateKey]);
            if (filteredMemories.length > 0) {
                day.classList.add('has-memory');
            }
        }

        day.addEventListener('click', () => selectDate(dateObj));
        calendarDays.appendChild(day);
    }

    // Next month days
    const remainingCells = 42 - (startingDay + totalDays);
    for (let i = 1; i <= remainingCells && i <= 14; i++) {
        const day = document.createElement('div');
        day.className = 'day other-month';
        day.textContent = i;
        calendarDays.appendChild(day);
    }
}

function selectDate(date) {
    selectedDate = date;
    generateCalendar();
    displayMemories();
    addMemoryBtn.style.display = 'flex';

    const formattedDate = `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    selectedDateDisplay.textContent = formattedDate;
}

// ========================================
// Memory Functions
// ========================================

function filterMemoriesByTab(memories) {
    // Tüm anıları göster - herkes birbirinin yazdığını görebilsin
    return memories;
}

function displayMemories() {
    if (!selectedDate) {
        memoriesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <p>Takvimden bir tarih seçerek anılarınızı görüntüleyin</p>
            </div>
        `;
        return;
    }

    const dateKey = getDateKey(selectedDate);
    const dayMemories = allMemories[dateKey] || [];
    const filteredMemories = filterMemoriesByTab(dayMemories);

    if (filteredMemories.length === 0) {
        memoriesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💭</div>
                <p>Bu tarihte henüz anı yok.<br>Yeni bir anı eklemek için butona tıklayın!</p>
            </div>
        `;
        return;
    }

    // Store memories globally for click access
    window.currentFilteredMemories = filteredMemories;

    memoriesList.innerHTML = filteredMemories.map((memory, index) => {
        const imageHtml = memory.imageUrl
            ? `<div class="memory-image"><img src="${memory.imageUrl}" loading="lazy"></div>`
            : '';

        return `
        <div class="memory-card ${memory.author}" onclick="openDetailModal(window.currentFilteredMemories[${index}])">
            <button class="delete-memory-btn" onclick="event.stopPropagation(); deleteMemory('${memory.id}', '${dateKey}')">×</button>
            <div class="memory-header">
                <div class="memory-title">
                    <span class="memory-mood">${memory.mood}</span>
                    <span>${memory.title}</span>
                </div>
            </div>
            ${imageHtml}
            <p class="memory-content">${memory.content}</p>
            <div class="memory-meta">
                <div class="avatar ${memory.author}-avatar small">
                    ${memory.author === 'together' ? '💕' : `<img src="images/${memory.author}_avatar.png" alt="${memory.author}">`}
                </div>
                <span>${memory.author === 'arda' ? 'Arda' : memory.author === 'asel' ? 'Asel' : 'Birlikte'}</span>
            </div>
        </div>
    `}).join('');
}

async function addMemory(title, content, mood, author) {
    const dateKey = getDateKey(selectedDate);

    let imageUrl = null;

    // Upload image if selected
    if (selectedImageFile) {
        // Try Firebase Upload
        imageUrl = await uploadImageToFirebase(selectedImageFile);

        // If offline or firebase fail, use Base64 (Local fallback)
        if (!imageUrl) {
            console.warn('⚠️ Firebase yüklemesi başarısız, Base64 kullanılıyor.');

            // Convert to Base64 specifically for storage
            const base64Image = document.getElementById('imagePreview').src;

            // Check size (Approx limit for localStorage is 5MB total, so be careful with > 500KB)
            if (base64Image.length > 1000000) { // ~750KB
                alert('⚠️ Uyarı: Fotoğraf boyutu çok yüksek! Yerel hafıza dolabilir. İnternet bağlantınızı kontrol edin.');
            }

            imageUrl = base64Image;
        }
    }

    const memory = {
        dateKey,
        title,
        content,
        mood,
        author,
        imageUrl,
        createdAt: new Date().toISOString()
    };

    // Firebase'e eklemeyi dene
    const firebaseId = await addMemoryToFirebase(memory);

    if (!firebaseId) {
        // Firebase başarısızsa localStorage'a ekle
        if (!allMemories[dateKey]) {
            allMemories[dateKey] = [];
        }

        memory.id = 'local_' + Date.now();
        allMemories[dateKey].push(memory);
        saveLocalMemories(allMemories);

        displayMemories();
        generateCalendar();
        updateStats();
    }
    // Firebase başarılıysa onSnapshot otomatik güncelleyecek
}

async function deleteMemory(memoryId, dateKey) {
    if (!confirm('Bu anıyı silmek istediğinize emin misiniz?')) return;

    // Firebase'den silmeyi dene
    if (memoryId.startsWith('local_') || !await deleteMemoryFromFirebase(memoryId)) {
        // Yerel silme
        if (allMemories[dateKey]) {
            allMemories[dateKey] = allMemories[dateKey].filter(m => m.id !== memoryId);
            if (allMemories[dateKey].length === 0) {
                delete allMemories[dateKey];
            }
            saveLocalMemories(allMemories);
            displayMemories();
            generateCalendar();
            updateStats();
        }
    }
    // Firebase başarılıysa onSnapshot otomatik güncelleyecek
}

// Make deleteMemory available globally
window.deleteMemory = deleteMemory;

// ========================================
// Tab Functions
// ========================================

function switchTab(tab) {
    currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    if (tab === 'arda') tabArda.classList.add('active');
    else if (tab === 'asel') tabAsel.classList.add('active');
    else tabTogether.classList.add('active');

    generateCalendar();
    displayMemories();
}

// ========================================
// Stats & Live Counter Functions
// ========================================

function updateLiveCounter() {
    const now = new Date();
    const diff = now - RELATIONSHIP_START_DATE;

    // Eğer tarih gelecekte ise
    if (diff < 0) {
        document.getElementById('counterDays').textContent = '0';
        document.getElementById('counterHours').textContent = '0';
        document.getElementById('counterMinutes').textContent = '0';
        document.getElementById('counterSeconds').textContent = '0';
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('counterDays').textContent = days;
    document.getElementById('counterHours').textContent = String(hours).padStart(2, '0');
    document.getElementById('counterMinutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('counterSeconds').textContent = String(seconds).padStart(2, '0');
}

function startLiveCounter() {
    updateLiveCounter();
    counterInterval = setInterval(updateLiveCounter, 1000);
}

function updateStats() {
    // Calculate total memories
    let totalCount = 0;
    Object.values(allMemories).forEach(dayMemories => {
        totalCount += dayMemories.length;
    });

    document.querySelector('#totalMemories .stat-number').textContent = totalCount;
}

// ========================================
// Floating Hearts Background
// ========================================

function createFloatingHeart() {
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.innerHTML = ['💖', '💕', '💗', '💓', '❤️', '🩷'][Math.floor(Math.random() * 6)];
    heart.style.left = Math.random() * 100 + '%';
    heart.style.animationDuration = (Math.random() * 10 + 10) + 's';
    heart.style.animationDelay = Math.random() * 5 + 's';
    heartsBg.appendChild(heart);

    // Remove after animation
    setTimeout(() => {
        heart.remove();
    }, 25000);
}

// Create initial hearts - reduced for minimal aesthetic
function initFloatingHearts() {
    for (let i = 0; i < 5; i++) {
        setTimeout(createFloatingHeart, i * 2000);
    }

    // Continue creating hearts - less frequent
    setInterval(createFloatingHeart, 8000);
}

// ========================================
// Modal Functions
// ========================================

function openModal() {
    modalOverlay.classList.add('active');
    selectedMood = '💕';
    selectedAuthor = currentUser; // Her zaman giriş yapan kullanıcı

    // Reset form
    memoryForm.reset();
    removeSelectedImage(); // Clear image state

    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.mood === selectedMood) {
            btn.classList.add('selected');
        }
    });

    // Yazar seçeneklerini kısıtla - sadece kendi adını göster
    document.querySelectorAll('.author-btn').forEach(btn => {
        btn.classList.remove('selected');
        const author = btn.dataset.author;

        if (author === currentUser) {
            btn.style.display = 'flex';
            btn.classList.add('selected');
        } else {
            btn.style.display = 'none';
        }
    });
}

function closeModal() {
    modalOverlay.classList.remove('active');
}

// Memory Detail Modal Functions
function openDetailModal(memory) {
    const modal = document.getElementById('memoryDetailModal');

    // Fill in the details
    document.getElementById('detailTitle').textContent = memory.mood + ' ' + memory.title;
    document.getElementById('detailMood').textContent = memory.mood;
    document.getElementById('detailContent').textContent = memory.content;

    // Image Detail
    let detailImageContainer = document.getElementById('detailImageContainer');
    if (!detailImageContainer) {
        // Create if doesn't exist (it should be in HTML ideally)
        detailImageContainer = document.createElement('div');
        detailImageContainer.id = 'detailImageContainer';
        detailImageContainer.className = 'detail-image';
        document.querySelector('.memory-detail-content').insertBefore(detailImageContainer, document.querySelector('.detail-text'));
    }

    if (memory.imageUrl) {
        detailImageContainer.innerHTML = `<img src="${memory.imageUrl}" alt="Anı Fotoğrafı">`;
        detailImageContainer.style.display = 'block';
    } else {
        detailImageContainer.style.display = 'none';
        detailImageContainer.innerHTML = '';
    }

    // Author info
    const authorName = memory.author === 'arda' ? 'Arda' : (memory.author === 'asel' ? 'Asel' : 'Birlikte');
    const authorClass = memory.author === 'arda' ? 'arda-avatar' : (memory.author === 'asel' ? 'asel-avatar' : 'together-avatar');

    const authorContent = memory.author === 'together'
        ? '💕'
        : `<img src="images/${memory.author}_avatar.png" alt="${memory.author}">`;

    document.getElementById('detailAuthor').innerHTML = `
        <div class="avatar ${authorClass} small">${authorContent}</div>
        ${authorName}
    `;

    // Date
    const date = new Date(memory.createdAt);
    document.getElementById('detailDate').textContent = date.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    modal.classList.add('active');
}

function closeDetailModal() {
    document.getElementById('memoryDetailModal').classList.remove('active');
}

// Make functions globally available
window.openDetailModal = openDetailModal;
window.closeDetailModal = closeDetailModal;

// Settings Functions
function openSettingsModal() {
    document.getElementById('settingsModal').classList.add('active');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
}

function setMenuTheme(themeName) {
    // Save to localStorage - User specific if logged in
    if (currentUser) {
        localStorage.setItem(`menu_theme_${currentUser}`, themeName);
    } else {
        localStorage.setItem('selectedMenuTheme', themeName);
    }

    // Remove all theme classes
    document.documentElement.removeAttribute('data-theme');

    // Apply new theme
    if (themeName !== 'default') {
        document.documentElement.setAttribute('data-theme', themeName);
    }

    // Update active button state
    document.querySelectorAll('.settings-section:first-child .theme-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`theme-${themeName}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

function setBackgroundTheme(bgName) {
    // Save to localStorage - User specific if logged in
    if (currentUser) {
        localStorage.setItem(`bg_theme_${currentUser}`, bgName);
    } else {
        localStorage.setItem('selectedBgTheme', bgName);
    }

    // Apply new background
    document.body.setAttribute('data-bg', bgName);

    // Update active button state
    document.querySelectorAll('.settings-section:last-child .theme-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`bg-${bgName}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

function loadTheme() {
    let savedMenuTheme = 'default';
    let savedBgTheme = 'purple-hearts';

    if (currentUser) {
        // Load user specific themes
        savedMenuTheme = localStorage.getItem(`menu_theme_${currentUser}`);
        savedBgTheme = localStorage.getItem(`bg_theme_${currentUser}`);

        // Backwards compatibility
        if (!savedMenuTheme) {
            const oldTheme = localStorage.getItem(`theme_${currentUser}`);
            if (oldTheme) savedMenuTheme = oldTheme;
        }

        // Defaults
        if (!savedMenuTheme) {
            if (currentUser === 'arda') savedMenuTheme = 'dark-blue';
            else if (currentUser === 'asel') savedMenuTheme = 'default';
        }

        if (!savedBgTheme) savedBgTheme = 'purple-hearts';

    } else {
        savedMenuTheme = localStorage.getItem('selectedMenuTheme') || 'default';
        savedBgTheme = localStorage.getItem('selectedBgTheme') || 'purple-hearts';
    }

    setMenuTheme(savedMenuTheme);
    setBackgroundTheme(savedBgTheme);
}

window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.setMenuTheme = setMenuTheme;
window.setBackgroundTheme = setBackgroundTheme;


// ========================================
// Event Listeners
// ========================================

function handleFileSelect(event) {
    const file = event.target.files[0];

    if (file) {
        if (!file.type.startsWith('image/')) {
            alert('Lütfen sadece fotoğraf dosyası seçin!');
            return;
        }

        selectedImageFile = file;

        // Preview
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('imagePreview').src = e.target.result;
            document.getElementById('imagePreviewContainer').style.display = 'block';
            document.getElementById('fileName').textContent = file.name;
        };
        reader.readAsDataURL(file);
    }
}

function removeSelectedImage() {
    selectedImageFile = null;
    document.getElementById('memoryPhoto').value = '';
    document.getElementById('imagePreviewContainer').style.display = 'none';
    document.getElementById('fileName').textContent = '';
}

// Make globally available
window.handleFileSelect = handleFileSelect;
window.removeSelectedImage = removeSelectedImage;
document.getElementById('memoryPhoto').addEventListener('change', handleFileSelect);

// Navigation
prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    generateCalendar();
});

nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    generateCalendar();
});

// Tabs
tabArda.addEventListener('click', () => switchTab('arda'));
tabAsel.addEventListener('click', () => switchTab('asel'));
tabTogether.addEventListener('click', () => switchTab('together'));

// Modal
addMemoryBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});

// Mood selector
document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedMood = btn.dataset.mood;
    });
});

// Author selector
document.querySelectorAll('.author-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.author-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedAuthor = btn.dataset.author;
    });
});

// Save Memory Function (onclick handler)
async function saveMemory() {
    console.log('💾 saveMemory çağrıldı!');

    const title = document.getElementById('memoryTitle').value.trim();
    const content = document.getElementById('memoryContent').value.trim();

    console.log('📝 Title:', title);
    console.log('📝 Content:', content);

    if (!title || !content) {
        alert('Lütfen başlık ve anı alanlarını doldurun!');
        return;
    }

    // Butonu deaktif et (Çift tıklamayı önle)
    const submitBtn = document.querySelector('.submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Kaydediliyor...';
    }

    try {
        // Anıyı ekle
        await addMemory(title, content, selectedMood, selectedAuthor);
        console.log('✅ addMemory tamamlandı!');

        // Hemen modal'ı kapat
        closeModal();
        console.log('✅ closeModal çağrıldı!');

        // Toast göster
        setTimeout(function () {
            showSuccessToast();
            console.log('✅ showSuccessToast çağrıldı!');
        }, 100);
    } catch (error) {
        console.error('❌ Anı kaydetme hatası:', error);
        alert('Anı kaydedilirken bir hata oluştu: ' + error.message);
    } finally {
        // Butonu tekrar aktif et
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '💖 Anıyı Kaydet';
        }
    }
}

// Make saveMemory available globally
window.saveMemory = saveMemory;

// Success Toast
function showSuccessToast() {
    console.log('🎉 showSuccessToast çağrıldı!');
    const toast = document.getElementById('successToast');

    if (toast) {
        // Direct style manipulation for guaranteed visibility
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
        toast.style.visibility = 'visible';
        console.log('Toast gösteriliyor!');

        // 3 saniye sonra gizle
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(-100px)';
            toast.style.opacity = '0';
            console.log('Toast gizlendi!');
        }, 3000);
    } else {
        console.error('Toast element bulunamadı!');
        // Fallback: alert göster
        alert('✅ Anı başarıyla kaydedildi! 💕');
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// ========================================
// Login System
// ========================================

function showPasswordInput(user) {
    selectedLoginUser = user;
    document.getElementById('passwordSection').style.display = 'block';
    document.getElementById('loginUserLabel').textContent =
        `${user === 'arda' ? 'Arda' : 'Asel'} olarak giriş yap`;
    document.getElementById('passwordInput').value = '';
    document.getElementById('errorMessage').textContent = '';
    document.getElementById('passwordInput').focus();
}

function handlePasswordKeypress(event) {
    if (event.key === 'Enter') {
        submitPassword();
    }
}

function submitPassword() {
    const password = document.getElementById('passwordInput').value;

    if (password === PASSWORDS[selectedLoginUser]) {
        // Başarılı giriş
        currentUser = selectedLoginUser;
        localStorage.setItem('currentUser', currentUser);

        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';

        // Kullanıcıya göre tab ve author ayarla
        currentTab = currentUser;
        selectedAuthor = currentUser;

        // Uygulamayı başlat
        startApp();
        loadTheme(); // Load user's theme preference
    } else {
        document.getElementById('errorMessage').textContent = 'Yanlış şifre! Tekrar deneyin.';
        document.getElementById('passwordInput').value = '';
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');

    if (counterInterval) {
        clearInterval(counterInterval);
    }

    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('passwordSection').style.display = 'none';
    selectedLoginUser = null;
}

// Make logout available globally
window.logout = logout;
window.showPasswordInput = showPasswordInput;
window.submitPassword = submitPassword;
window.handlePasswordKeypress = handlePasswordKeypress;

function restrictAuthorOptions() {
    // Kullanıcıya göre yazar seçeneklerini kısıtla
    // Arda girince → sadece Arda, Asel girince → sadece Asel
    const authorBtns = document.querySelectorAll('.author-btn');

    authorBtns.forEach(btn => {
        const author = btn.dataset.author;

        if (author === currentUser) {
            // Sadece kendi adı görünsün
            btn.style.display = 'flex';
            btn.classList.add('selected'); // Otomatik seçili yap
        } else {
            // Diğer tüm seçenekler gizli (Birlikte dahil)
            btn.style.display = 'none';
        }
    });

    // Varsayılan yazar olarak kendini ayarla
    selectedAuthor = currentUser;

    // ÜST SEKMELERİ DE GİZLE
    // Arda girince sadece Arda sekmesi, Asel girince sadece Asel sekmesi
    const tabArda = document.getElementById('tabArda');
    const tabAsel = document.getElementById('tabAsel');
    const tabTogether = document.getElementById('tabTogether');

    if (currentUser === 'arda') {
        tabArda.style.display = 'flex';
        tabAsel.style.display = 'none';
        tabTogether.style.display = 'none';
    } else if (currentUser === 'asel') {
        tabArda.style.display = 'none';
        tabAsel.style.display = 'flex';
        tabTogether.style.display = 'none';
    }
}

// ========================================
// Initialize
// ========================================

function startApp() {
    updateConnectionStatus(false, 'Bağlanıyor...');

    // Firebase bağlantısını bekle
    setTimeout(() => {
        listenToFirebaseMemories();
        initFloatingHearts();
        startLiveCounter();
        restrictAuthorOptions();

        // Kullanıcının sekmesini aktif et
        switchTab(currentUser);

        // Select today by default
        selectDate(new Date());
    }, 500);
}

function init() {
    // Tema yükle
    loadTheme();

    // Daha önce giriş yapılmış mı kontrol et
    const savedUser = localStorage.getItem('currentUser');

    if (savedUser && (savedUser === 'arda' || savedUser === 'asel')) {
        currentUser = savedUser;
        currentTab = savedUser;
        selectedAuthor = savedUser;

        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        startApp();
    } else {
        // Login ekranını göster
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
    }
}

// Start the app
init();

console.log('💖 Arda & Asel - Ortak Anı Günlüğü v2.0 yüklendi!');
