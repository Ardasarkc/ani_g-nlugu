// ========================================
// Ortak Anı Günlüğü - Arda & Asel 💖
// Firebase + LocalStorage Hybrid
// ========================================

// State
let currentDate = new Date();
let selectedDate = null;
let currentTab = 'arda';
let selectedMood = '💕';
let selectedAuthor = 'together';
let allMemories = {}; // Tüm anıları tutacak
let unsubscribe = null; // Firebase listener

// İlişki başlangıç tarihi - kendi tarihinizi buraya yazabilirsiniz
const RELATIONSHIP_START_DATE = new Date('2024-01-01');

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
        const docRef = await addDoc(collection(window.firebaseDB, 'memories'), memory);
        console.log('✅ Anı Firebase\'e eklendi:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Firebase ekleme hatası:', error);
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
            // Tüm anıları tarih bazında grupla
            allMemories = {};

            snapshot.forEach((doc) => {
                const memory = { id: doc.id, ...doc.data() };
                const dateKey = memory.dateKey;

                if (!allMemories[dateKey]) {
                    allMemories[dateKey] = [];
                }
                allMemories[dateKey].push(memory);
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
    if (currentTab === 'together') {
        return memories; // Show all memories in "together" tab
    }
    return memories.filter(m => m.author === currentTab || m.author === 'together');
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

    memoriesList.innerHTML = filteredMemories.map((memory) => `
        <div class="memory-card ${memory.author}">
            <button class="delete-memory-btn" onclick="deleteMemory('${memory.id}', '${dateKey}')">&times;</button>
            <div class="memory-header">
                <div class="memory-title">
                    <span class="memory-mood">${memory.mood}</span>
                    <span>${memory.title}</span>
                </div>
            </div>
            <p class="memory-content">${memory.content}</p>
            <div class="memory-meta">
                <div class="avatar ${memory.author}-avatar small">${memory.author === 'together' ? '💕' : memory.author.charAt(0).toUpperCase()}</div>
                <span>${memory.author === 'arda' ? 'Arda' : memory.author === 'asel' ? 'Asel' : 'Birlikte'}</span>
            </div>
        </div>
    `).join('');
}

async function addMemory(title, content, mood, author) {
    const dateKey = getDateKey(selectedDate);

    const memory = {
        dateKey,
        title,
        content,
        mood,
        author,
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
// Stats Functions
// ========================================

function updateStats() {
    // Calculate days together
    const today = new Date();
    const diffTime = Math.abs(today - RELATIONSHIP_START_DATE);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    document.querySelector('#relationshipDays .stat-number').textContent = diffDays;

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

// Create initial hearts
function initFloatingHearts() {
    for (let i = 0; i < 10; i++) {
        setTimeout(createFloatingHeart, i * 1000);
    }

    // Continue creating hearts
    setInterval(createFloatingHeart, 3000);
}

// ========================================
// Modal Functions
// ========================================

function openModal() {
    modalOverlay.classList.add('active');
    selectedMood = '💕';
    selectedAuthor = currentTab === 'together' ? 'together' : currentTab;

    // Reset form
    memoryForm.reset();
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.mood === selectedMood) {
            btn.classList.add('selected');
        }
    });
    document.querySelectorAll('.author-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.author === selectedAuthor) {
            btn.classList.add('selected');
        }
    });
}

function closeModal() {
    modalOverlay.classList.remove('active');
}

// ========================================
// Event Listeners
// ========================================

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

// Form submit
memoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('memoryTitle').value.trim();
    const content = document.getElementById('memoryContent').value.trim();

    if (title && content) {
        await addMemory(title, content, selectedMood, selectedAuthor);
        closeModal();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// ========================================
// Initialize
// ========================================

function init() {
    updateConnectionStatus(false, 'Bağlanıyor...');

    // Firebase bağlantısını bekle
    setTimeout(() => {
        listenToFirebaseMemories();
        initFloatingHearts();

        // Select today by default
        selectDate(new Date());
    }, 500);
}

// Start the app
init();

console.log('💖 Arda & Asel - Ortak Anı Günlüğü yüklendi!');
