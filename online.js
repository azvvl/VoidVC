// Initialize Firebase (Your actual config)
const firebaseConfig = {
    apiKey: "AIzaSyCWfxgmYyRs7Ter_YycRQcJrBdEnO-uiWE",
    authDomain: "voidvc-303a9.firebaseapp.com",
    databaseURL: "https://voidvc-303a9-default-rtdb.firebaseio.com/",
    projectId: "voidvc-303a9",
    storageBucket: "voidvc-303a9.firebasestorage.app",
    messagingSenderId: "1038289803860",
    appId: "1:1038289803860:web:4f55822f712554f9a9ebc1"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// DOM Elements
const onlineLanding = document.getElementById('online-landing');
const createOnlineRoom = document.getElementById('create-online-room');
const adminLogin = document.getElementById('admin-login');
const roomsList = document.getElementById('rooms-list');
const onlineChatRoom = document.getElementById('online-chat-room');
const hostOnlineBtn = document.getElementById('host-online-btn');
const browseRoomsBtn = document.getElementById('browse-rooms-btn');
const adminLoginBtn = document.getElementById('admin-login-btn');
const backToMainOnline = document.getElementById('back-to-main-online');
const roomNameInput = document.getElementById('room-name-input');
const onlineParticipantCount = document.getElementById('online-participant-count');
const createOnlineRoomBtn = document.getElementById('create-online-room-btn');
const backFromCreateOnline = document.getElementById('back-from-create-online');
const adminEmailInput = document.getElementById('admin-email');
const adminPasswordInput = document.getElementById('admin-password');
const adminLoginSubmit = document.getElementById('admin-login-submit');
const backFromAdminLogin = document.getElementById('back-from-admin-login');
const roomsContainer = document.getElementById('rooms-container');
const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
const backFromRooms = document.getElementById('back-from-rooms');
const onlineRoomTitle = document.getElementById('online-room-title');
const onlineParticipants = document.getElementById('online-participants');
const onlineMuteBtn = document.getElementById('online-mute-btn');
const onlineLeaveBtn = document.getElementById('online-leave-btn');
const notification = document.getElementById('notification');
const audioContainer = document.getElementById('audio-container');

// Global variables
let currentRoom = null;
let isHost = false;
let isAdmin = false;
let localStream = null;
let peerConnections = {};
let currentUserId = generateUserId();
let isMuted = false;
let roomListenerRef = null;

async function checkIpBan() {
    // Get user's IP (using a simple method - you might want to use a more reliable service)
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        const userIp = data.ip;
        
        // Check if this IP is banned
        const banSnapshot = await database.ref(`ip-bans/${userIp.replace(/\./g, '-')}`).once('value');
        const banData = banSnapshot.val();
        
        if (banData && banData.until > Date.now()) {
            const minutesLeft = Math.ceil((banData.until - Date.now()) / 60000);
            alert(`You are temporarily banned from online mode. Time remaining: ${minutesLeft} minutes.`);
            window.location.href = 'index.html';
            return false;
        }
        
        // Store user's IP for reporting system
        window.currentUserIp = userIp;
        return true;
    } catch (error) {
        console.error('Error checking IP ban:', error);
        return true; // Allow access if we can't check IP
    }
}

// Event Listeners
hostOnlineBtn.addEventListener('click', async () => {
    if (await checkIpBan()) {
        onlineLanding.classList.add('hidden');
        createOnlineRoom.classList.remove('hidden');
    }
});

browseRoomsBtn.addEventListener('click', async () => {
    if (await checkIpBan()) {
        onlineLanding.classList.add('hidden');
        roomsList.classList.remove('hidden');
        loadPublicRooms();
    }
});

adminLoginBtn.addEventListener('click', () => {
    onlineLanding.classList.add('hidden');
    adminLogin.classList.remove('hidden');
});

backToMainOnline.addEventListener('click', () => {
    window.location.href = 'index.html';
});

adminLoginSubmit.addEventListener('click', () => {
    const email = adminEmailInput.value.trim();
    const password = adminPasswordInput.value.trim();
    
    if (!email || !password) {
        alert('Please enter both email and password');
        return;
    }
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Successfully signed in
            isAdmin = true;
            adminLogin.classList.add('hidden');
            onlineLanding.classList.remove('hidden');
            showNotification('Logged in as admin');
            
            // Clear form fields for security
            adminEmailInput.value = '';
            adminPasswordInput.value = '';
        })
        .catch((error) => {
            alert(`Login failed: ${error.message}`);
        });
});

backFromAdminLogin.addEventListener('click', () => {
    adminLogin.classList.add('hidden');
    onlineLanding.classList.remove('hidden');
});

createOnlineRoomBtn.addEventListener('click', createNewOnlineRoom);
backFromCreateOnline.addEventListener('click', goBackToLanding);
refreshRoomsBtn.addEventListener('click', loadPublicRooms);
backFromRooms.addEventListener('click', goBackToLanding);
onlineMuteBtn.addEventListener('click', toggleMute);
onlineLeaveBtn.addEventListener('click', leaveRoom);

// Functions
async function adminDeleteRoom(roomId) {
    if (!isAdmin) return;
    
    if (confirm('Are you sure you want to delete this room? All participants will be kicked.')) {
        await database.ref(`public-rooms/${roomId}`).remove();
        showNotification('Room deleted');
        loadPublicRooms();
    }
}

async function adminBanUserIp(userId) {
    if (!isAdmin) return;
    
    // Get the user's IP
    const userIpSnapshot = await database.ref(`user-ips/${userId}`).once('value');
    const userIp = userIpSnapshot.val();
    
    if (!userIp) {
        alert('Could not find IP address for this user.');
        return;
    }
    
    if (confirm(`Are you sure you want to ban user with IP ${userIp} for 10 minutes?`)) {
        // Set 10-minute ban
        const banEnd = Date.now() + (10 * 60 * 1000); // 10 minutes
        await database.ref(`ip-bans/${userIp.replace(/\./g, '-')}`).set({
            until: banEnd,
            reason: 'Admin ban',
            timestamp: Date.now()
        });
        
        // Kick the user from their current room
        if (currentRoom) {
            await database.ref(`public-rooms/${currentRoom}/kicked/${userId}`).set(true);
            setTimeout(async () => {
                await database.ref(`public-rooms/${currentRoom}/participants/${userId}`).remove();
            }, 100);
        }
        
        showNotification(`User banned for 10 minutes`);
    }
}

function generateUserId() {
    return Math.random().toString(36).substr(2, 9);
}

function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Bad word filter
const badWords = [
    // Common profanity
    'fuck', 'shit', 'ass', 'bitch', 'damn', 'cock', 'dick', 'pussy', 'cunt', 'whore', 'slut',
    
    // Racial slurs and offensive terms (abbreviated/censored list)
    'n***er', 'n***a', 'negro', 'chink', 'sp*c', 'towelhead', 'sandnigger', 'gook', 'kike', 'nigger', 'nigga',
    
    // Homophobic slurs
    'fag', 'faggot', 'homo', 'queer', 'dyke',
    
    // Sexual content
    'porn', 'xxx', 'sex', 'rape', 'anal', 'oral', 'fetish', 'masturbate', 'cum',
    
    // Violence and threats
    'kill', 'murder', 'genocide', 'suicide', 'bomb', 'terrorist',
    
    // Drug references
    'cocaine', 'heroin', 'meth', 'weed', 'marijuana', 'drugs',
    
    // Variants and common misspellings
    'f*ck', 'sh*t', 'b*tch', 'a$$', 'fuk', 'fck', 'sht', 'btch', 'cnt', 'dmn',
    'phuck', 'phuk', 'phuq', 'fyck', 'fack', 'fook', 'fokk', 'fugk',
    's3x', 'p0rn', 'pr0n', 'h0m0', 'f4g',
    
    // Additional offensive terms
    'retard', 'retarded', 'idiot', 'stupid', 'moron', 'imbecile', 'dumbass', 'jerk', 'asshole'
].map(word => word.toLowerCase());

function containsBadWord(text) {
    // Convert text to lowercase for comparison
    const lowerText = text.toLowerCase();
    
    // Check for exact matches
    const words = lowerText.split(/\s+/);
    for (const word of words) {
        if (badWords.includes(word)) {
            return true;
        }
    }
    
    // Check for bad words as substrings (to catch variations)
    for (const badWord of badWords) {
        // Skip short words (2 letters or less) to avoid false positives
        if (badWord.length <= 2) continue;
        
        // Create regex to match word boundaries or common variations
        const pattern = new RegExp(`\\b${badWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b|${badWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
        
        if (pattern.test(lowerText)) {
            return true;
        }
    }
    
    // Check for numbers replacing letters (l33t speak)
    const textWith133t = lowerText
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't')
        .replace(/8/g, 'b');
    
    if (textWith133t !== lowerText && containsBadWord(textWith133t)) {
        return true;
    }
    
    // Check for common character substitutions
    const textWithSubstitutions = lowerText
        .replace(/\*/g, '')
        .replace(/@/g, 'a')
        .replace(/\$/g, 's')
        .replace(/!/g, 'i')
        .replace(/\+/g, 't')
        .replace(/&/g, 'and');
    
    if (textWithSubstitutions !== lowerText && containsBadWord(textWithSubstitutions)) {
        return true;
    }
    
    return false;
}

function filterBadWords(text) {
    // This function replaces bad words with asterisks
    let filteredText = text;
    
    for (const badWord of badWords) {
        const pattern = new RegExp(`\\b${badWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        filteredText = filteredText.replace(pattern, '*'.repeat(badWord.length));
    }
    
    return filteredText;
}

async function reportUser(reportedUserId) {
    if (!window.currentUserIp) {
        alert('Unable to submit report. Please try again.');
        return;
    }
    
    // Check if user is trying to report themselves
    if (reportedUserId === currentUserId) {
        alert('You cannot report yourself.');
        return;
    }
    
    // Check if this IP has already reported this user
    const reportKey = `${reportedUserId}_${window.currentUserIp.replace(/\./g, '-')}`;
    const existingReport = await database.ref(`reports/${reportKey}`).once('value');
    
    if (existingReport.val()) {
        alert('You have already reported this user.');
        return;
    }
    
    // Show confirmation dialog
    const confirmed = confirm('Are you sure you want to report this user?\n\nFalse reports may result in a ban from the reporting system.');
    
    if (!confirmed) return;
    
    // Record the report
    await database.ref(`reports/${reportKey}`).set({
        reportedUser: reportedUserId,
        reporterIp: window.currentUserIp,
        timestamp: Date.now(),
        room: currentRoom
    });
    
    // Count total reports for this user from different IPs
    const allReportsSnapshot = await database.ref('reports').orderByChild('reportedUser').equalTo(reportedUserId).once('value');
    const allReports = allReportsSnapshot.val();
    
    if (allReports) {
        const uniqueReporters = new Set();
        Object.values(allReports).forEach(report => {
            uniqueReporters.add(report.reporterIp);
        });
        
        // If 5 or more different IPs have reported this user, implement temp ban
        if (uniqueReporters.size >= 5) {
            // Get the reported user's IP
            const reportedUserSnapshot = await database.ref(`user-ips/${reportedUserId}`).once('value');
            const reportedUserIp = reportedUserSnapshot.val();
            
            if (reportedUserIp) {
                // Set 10-minute ban
                const banEnd = Date.now() + (10 * 60 * 1000); // 10 minutes
                await database.ref(`ip-bans/${reportedUserIp.replace(/\./g, '-')}`).set({
                    until: banEnd,
                    reason: 'Multiple user reports',
                    reportCount: uniqueReporters.size
                });
                
                // Kick the user from their current room
                if (currentRoom) {
                    await database.ref(`public-rooms/${currentRoom}/kicked/${reportedUserId}`).set(true);
                    setTimeout(async () => {
                        await database.ref(`public-rooms/${currentRoom}/participants/${reportedUserId}`).remove();
                    }, 100);
                }
                
                showNotification('User has been temporarily banned due to multiple reports.');
            }
        }
    }
    
    showNotification('Report submitted successfully.');
}

function showNotification(message) {
    notification.textContent = message;
    notification.classList.remove('hidden', 'hiding');
    
    setTimeout(() => {
        notification.classList.add('hiding');
        setTimeout(() => {
            notification.classList.add('hidden');
            notification.classList.remove('hiding');
        }, 300);
    }, 2000);
}

function goBackToLanding() {
    onlineLanding.classList.remove('hidden');
    createOnlineRoom.classList.add('hidden');
    roomsList.classList.add('hidden');
    onlineChatRoom.classList.add('hidden');
}

async function createNewOnlineRoom() {
    const roomName = roomNameInput.value.trim();
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }
    
    // Check for bad words in room name
    if (containsBadWord(roomName)) {
        alert('Room name contains inappropriate content. Please choose a different name.');
        return;
    }
    
    // Sanitize room name (remove special characters that could cause issues)
    const sanitizedRoomName = roomName.replace(/[<>\"\'\\]/g, '');
    
    if (sanitizedRoomName.length < 3) {
        alert('Room name must be at least 3 characters long.');
        return;
    }
    
    if (sanitizedRoomName.length > 30) {
        alert('Room name must be 30 characters or less.');
        return;
    }
    
    isHost = true;
    const maxParticipants = parseInt(onlineParticipantCount.value);
    currentRoom = generateRoomCode();
    
    // Create public room
    await database.ref(`public-rooms/${currentRoom}`).set({
        name: sanitizedRoomName,
        host: currentUserId,
        maxParticipants: maxParticipants,
        currentParticipants: 1,
        status: 'active',
        createdAt: Date.now(),
        lastActivity: Date.now(),
        participants: {
            [currentUserId]: {
                joined: true,
                muted: false,
                isAdmin: isAdmin
            }
        }
    });
    
    // Start the room immediately
    setupWebRTC();
    createOnlineRoom.classList.add('hidden');
    onlineChatRoom.classList.remove('hidden');
    onlineRoomTitle.textContent = sanitizedRoomName;
    
    // Start tracking room activity
    startActivityTracking();
}

async function joinOnlineRoom(roomId, roomName) {
    currentRoom = roomId;
    
    // Check if room still exists and has participants
    const roomSnapshot = await database.ref(`public-rooms/${roomId}`).once('value');
    const room = roomSnapshot.val();
    
    if (!room || room.currentParticipants === 0) {
        alert('Room no longer exists or is empty');
        loadPublicRooms();
        return;
    }
    
    // Check if room is full (admins can bypass this check)
    if (!isAdmin && room.currentParticipants >= room.maxParticipants) {
        alert('Room is full');
        return;
    }
    
    // Join the room
    await database.ref(`public-rooms/${roomId}/participants/${currentUserId}`).set({
        joined: true,
        muted: false,
        isAdmin: isAdmin // Mark this participant as admin
    });
    
    // Update participant count
    await database.ref(`public-rooms/${roomId}/currentParticipants`).set(room.currentParticipants + 1);
    
    // Setup WebRTC and enter room
    setupWebRTC();
    
    // Hide all screens and show chat room
    adminLogin.classList.add('hidden');
    roomsList.classList.add('hidden');
    onlineChatRoom.classList.remove('hidden');
    onlineRoomTitle.textContent = roomName;
    
    // Start tracking room activity
    startActivityTracking();
}

async function loadPublicRooms() {
    roomsContainer.innerHTML = '<div class="loading">Loading rooms...</div>';
    
    const roomsSnapshot = await database.ref('public-rooms').once('value');
    const rooms = roomsSnapshot.val();
    
    roomsContainer.innerHTML = '';
    
    if (!rooms || Object.keys(rooms).length === 0) {
        roomsContainer.innerHTML = '<div class="no-rooms">No public rooms available</div>';
        return;
    }
    
    Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId];
        // Only show rooms that are active AND have participants
        if (room.status === 'active' && room.currentParticipants > 0) {
            const roomElement = document.createElement('div');
            roomElement.className = 'room-item';
            
            let buttons = `<button class="join-room-btn" onclick="joinOnlineRoom('${roomId}', '${filterBadWords(room.name).replace(/'/g, "\\'")}')">Join</button>`;
            
            // Add delete button for admins
            if (isAdmin) {
                buttons += `<button class="delete-room-btn" onclick="adminDeleteRoom('${roomId}')">×</button>`;
            }
            
            roomElement.innerHTML = `
                <div class="room-info">
                    <h3>${filterBadWords(room.name)}</h3>
                    <p>${room.currentParticipants}/${room.maxParticipants} participants</p>
                </div>
                <div class="room-buttons">
                    ${buttons}
                </div>
            `;
            roomsContainer.appendChild(roomElement);
        }
    });
    
    if (roomsContainer.children.length === 0) {
        roomsContainer.innerHTML = '<div class="no-rooms">No active rooms available</div>';
    }
}

function startActivityTracking() {
    // Update activity every 30 seconds
    setInterval(() => {
        if (currentRoom) {
            database.ref(`public-rooms/${currentRoom}/lastActivity`).set(Date.now());
        }
    }, 30000);
    
    // Clean up inactive rooms frequently - every 1 minute
    setInterval(cleanupInactiveRooms, 60000);
    
    // Also run cleanup immediately
    cleanupInactiveRooms();
}

async function cleanupInactiveRooms() {
    const roomsSnapshot = await database.ref('public-rooms').once('value');
    const rooms = roomsSnapshot.val();
    
    if (rooms) {
        const now = Date.now();
        const deletePromises = [];
        
        Object.keys(rooms).forEach(async (roomId) => {
            const room = rooms[roomId];
            
            // Delete empty rooms immediately
            if (room.currentParticipants === 0) {
                console.log('Deleting empty room:', roomId);
                deletePromises.push(database.ref(`public-rooms/${roomId}`).remove());
            }
            // Delete inactive rooms after 5 minutes
            else if (room.lastActivity && (now - room.lastActivity > 300000)) {
                console.log('Deleting inactive room:', roomId);
                deletePromises.push(database.ref(`public-rooms/${roomId}`).remove());
            }
        });
        
        // Wait for all deletions to complete
        await Promise.all(deletePromises);
    }
}

async function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMuted = !audioTrack.enabled;
            onlineMuteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
            onlineMuteBtn.classList.toggle('muted', isMuted);
            
            // Update mute status in database
            await database.ref(`public-rooms/${currentRoom}/participants/${currentUserId}/muted`).set(isMuted);
            
            showNotification(isMuted ? 'Microphone muted' : 'Microphone unmuted');
        }
    }
}

async function kickParticipant(participantId) {
    // Allow host or admin to kick
    if ((!isHost && !isAdmin) || participantId === currentUserId) return;
    
    if (confirm('Are you sure you want to kick this participant?')) {
        // Mark them as kicked first
        await database.ref(`public-rooms/${currentRoom}/kicked/${participantId}`).set(true);
        
        // Update participant count
        const roomSnapshot = await database.ref(`public-rooms/${currentRoom}`).once('value');
        const room = roomSnapshot.val();
        if (room) {
            await database.ref(`public-rooms/${currentRoom}/currentParticipants`).set(
                Math.max(0, room.currentParticipants - 1)
            );
        }
        
        // Wait a moment then remove them
        setTimeout(async () => {
            await database.ref(`public-rooms/${currentRoom}/participants/${participantId}`).remove();
            showNotification('Participant kicked');
        }, 100);
    }
}

async function checkForKicked() {
    if (currentRoom) {
        database.ref(`public-rooms/${currentRoom}/kicked/${currentUserId}`).on('value', (snapshot) => {
            if (snapshot.val() === true) {
                showNotification('You have been kicked from the room');
                leaveRoom();
            }
        });
    }
}

async function setupWebRTC() {
    try {
        // Store user's IP for the reporting system
        if (!window.currentUserIp) {
            await checkIpBan();
        }
        
        // Store IP in database for the reporting system
        if (window.currentUserIp) {
            await database.ref(`user-ips/${currentUserId}`).set(window.currentUserIp);
        }
        
        // Get audio stream
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }, 
            video: false 
        });
        
        // Add visualization for the local user
        addParticipantUI(currentUserId, true);
        
        // Setup local audio visualization
        setupAudioVisualization(localStream, currentUserId);
        
        // Check for kicked status
        checkForKicked();
        
        // Set up signaling listeners
        setupSignalingListeners();
        
        // Set up participant tracking
        setupParticipantTracking();
    } catch (error) {
        console.error('Error setting up WebRTC:', error);
        alert('Could not access microphone. Please ensure you have given permission.');
    }
}

function setupParticipantTracking() {
    // Listen for participants
    database.ref(`public-rooms/${currentRoom}/participants`).on('child_added', async (snapshot) => {
        const participantId = snapshot.key;
        if (participantId !== currentUserId) {
            if (!peerConnections[participantId]) {
                setTimeout(() => {
                    createPeerConnection(participantId);
                    showNotification('Someone joined the room');
                }, 500);
            }
        }
    });
    
    // Listen for participants leaving
    database.ref(`public-rooms/${currentRoom}/participants`).on('child_removed', async (snapshot) => {
        const participantId = snapshot.key;
        if (participantId !== currentUserId && peerConnections[participantId]) {
            peerConnections[participantId].close();
            delete peerConnections[participantId];
            
            // Remove participant UI
            const participantEl = document.getElementById(`participant-${participantId}`);
            if (participantEl) {
                participantEl.remove();
            }
            
            // Remove audio element
            const audioEl = document.getElementById(`audio-${participantId}`);
            if (audioEl) {
                audioEl.remove();
            }
            
            showNotification('Someone left the room');
        }
    });
    
    // Listen for mute status changes
    database.ref(`public-rooms/${currentRoom}/participants`).on('value', (snapshot) => {
        const participants = snapshot.val();
        if (participants) {
            Object.keys(participants).forEach(participantId => {
                updateMuteIndicator(participantId, participants[participantId].muted);
            });
        }
    });
    
    // Listen for room deletion
    database.ref(`public-rooms/${currentRoom}`).on('value', (snapshot) => {
        if (!snapshot.val()) {
            showNotification('Room has been closed');
            leaveRoom();
        }
    });
}

function setupSignalingListeners() {
    // Listen for offers
    database.ref(`public-rooms/${currentRoom}/signaling/offers`).on('child_added', async (snapshot) => {
        const message = snapshot.val();
        if (message.recipient === currentUserId && message.sender !== currentUserId) {
            await handleOffer(message.sender, message.description);
            snapshot.ref.remove();
        }
    });
    
    // Listen for answers
    database.ref(`public-rooms/${currentRoom}/signaling/answers`).on('child_added', async (snapshot) => {
        const message = snapshot.val();
        if (message.recipient === currentUserId && message.sender !== currentUserId) {
            await handleAnswer(message.sender, message.description);
            snapshot.ref.remove();
        }
    });
    
    // Listen for ICE candidates
    database.ref(`public-rooms/${currentRoom}/signaling/candidates`).on('child_added', async (snapshot) => {
        const message = snapshot.val();
        if (message.recipient === currentUserId && message.sender !== currentUserId) {
            await handleCandidate(message.sender, message.candidate);
            snapshot.ref.remove();
        }
    });
}

function createPeerConnection(participantId) {
    // Create new RTCPeerConnection with enhanced configuration for cross-device/region compatibility
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.services.mozilla.com' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            {
                urls: ['turn:relay.metered.ca:80', 'turn:relay.metered.ca:443'],
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:turnserver.stunprotocol.org:3478',
                username: 'free',
                credential: 'free'
            }
        ],
        sdpSemantics: 'unified-plan',
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        iceCandidatePoolSize: 10
    });
    
    // Add local stream
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });
    
    // Handle ICE candidates
    pc.onicecandidate = event => {
        if (event.candidate) {
            sendSignalingMessage('candidates', {
                sender: currentUserId,
                recipient: participantId,
                candidate: {
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    usernameFragment: event.candidate.usernameFragment
                }
            });
        }
    };
    
// Handle incoming streams
    pc.ontrack = event => {
        // Add participant to UI if not already added
        addParticipantUI(participantId, false);
        
        // Create and configure audio element
        let audioElement = document.getElementById(`audio-${participantId}`);
        if (!audioElement) {
            audioElement = document.createElement('audio');
            audioElement.id = `audio-${participantId}`;
            audioElement.autoplay = true;
            audioElement.controls = false;
            audioElement.volume = 1.0;
            audioContainer.appendChild(audioElement);
        }
        
        // Set the source stream
        audioElement.srcObject = event.streams[0];
        
        // Force audio to play
        const playPromise = audioElement.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log('Audio started playing for participant:', participantId);
            }).catch(error => {
                console.error('Error playing audio:', error);
                document.addEventListener('click', () => {
                    audioElement.play().catch(console.error);
                }, { once: true });
            });
        }
        
        // Setup audio visualization
        if (event.track.kind === 'audio') {
            setupAudioVisualization(event.streams[0], participantId);
        }
    };
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${participantId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
            const audioEl = document.getElementById(`audio-${participantId}`);
            if (audioEl && audioEl.paused) {
                audioEl.play().catch(console.error);
            }
        }
    };
    
    // Store the connection
    peerConnections[participantId] = pc;
    
    // Create and send offer if we are the initiator
    if (currentUserId > participantId) {
        createAndSendOffer(pc, participantId);
    }
    
    return pc;
}

async function createAndSendOffer(pc, participantId) {
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        sendSignalingMessage('offers', {
            sender: currentUserId,
            recipient: participantId,
            description: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp
            }
        });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

async function handleOffer(senderId, description) {
    try {
        let pc = peerConnections[senderId];
        if (!pc) {
            pc = createPeerConnection(senderId);
        }
        
        if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
            const sessionDescription = new RTCSessionDescription({
                type: description.type,
                sdp: description.sdp
            });
            
            await pc.setRemoteDescription(sessionDescription);
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            sendSignalingMessage('answers', {
                sender: currentUserId,
                recipient: senderId,
                description: {
                    type: pc.localDescription.type,
                    sdp: pc.localDescription.sdp
                }
            });
        }
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

async function handleAnswer(senderId, description) {
    try {
        const pc = peerConnections[senderId];
        if (pc && pc.signalingState === 'have-local-offer') {
            const sessionDescription = new RTCSessionDescription({
                type: description.type,
                sdp: description.sdp
            });
            
            await pc.setRemoteDescription(sessionDescription);
        }
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

async function handleCandidate(senderId, candidateData) {
    try {
        const pc = peerConnections[senderId];
        if (pc && candidateData.candidate) {
            if (typeof candidateData.sdpMid === 'string' && 
                typeof candidateData.sdpMLineIndex === 'number') {
                
                const candidate = new RTCIceCandidate({
                    candidate: candidateData.candidate,
                    sdpMid: candidateData.sdpMid,
                    sdpMLineIndex: candidateData.sdpMLineIndex,
                    usernameFragment: candidateData.usernameFragment
                });
                
                await pc.addIceCandidate(candidate);
            }
        }
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
}

function sendSignalingMessage(type, message) {
    database.ref(`public-rooms/${currentRoom}/signaling/${type}`).push(message);
}

function addParticipantUI(participantId, isLocal) {
    if (!document.getElementById(`participant-${participantId}`)) {
        const participantEl = document.createElement('div');
        participantEl.className = 'participant';
        participantEl.id = `participant-${participantId}`;
        
        const nameLabel = document.createElement('div');
        nameLabel.className = 'participant-name';
        nameLabel.textContent = isLocal ? 'You' : 'User';
        
        participantEl.appendChild(nameLabel);
        
        // Add kick button for host or admin (except for own participant)
        if ((isHost || isAdmin) && !isLocal) {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'kick-btn';
            kickBtn.innerHTML = '×';
            kickBtn.title = 'Kick user';
            kickBtn.onclick = () => kickParticipant(participantId);
            participantEl.appendChild(kickBtn);
        }
        
        // Add ban button for admins (except for own participant)
        if (isAdmin && !isLocal) {
            const banBtn = document.createElement('button');
            banBtn.className = 'ban-btn';
            banBtn.innerHTML = '🔨';
            banBtn.title = 'Ban user for 10 minutes';
            banBtn.onclick = () => adminBanUserIp(participantId);
            participantEl.appendChild(banBtn);
        }
        
        // Add report button for all users (except for own participant)
        if (!isLocal) {
            const reportBtn = document.createElement('button');
            reportBtn.className = 'report-btn';
            reportBtn.innerHTML = '🚩';
            reportBtn.title = 'Report User';
            reportBtn.onclick = () => reportUser(participantId);
            participantEl.appendChild(reportBtn);
        }
        
        onlineParticipants.appendChild(participantEl);
        
        // Update mute status
        database.ref(`public-rooms/${currentRoom}/participants/${participantId}/muted`).once('value', (snapshot) => {
            updateMuteIndicator(participantId, snapshot.val() || false);
        });
    }
}

function updateMuteIndicator(participantId, isMuted) {
    const participantEl = document.getElementById(`participant-${participantId}`);
    if (participantEl) {
        let muteIcon = participantEl.querySelector('.mute-indicator');
        if (isMuted) {
            if (!muteIcon) {
                muteIcon = document.createElement('div');
                muteIcon.className = 'mute-indicator';
                muteIcon.innerHTML = '🔇';
                participantEl.appendChild(muteIcon);
            }
        } else {
            if (muteIcon) {
                muteIcon.remove();
            }
        }
    }
}

function setupAudioVisualization(stream, participantId) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        source.connect(analyser);
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        let isSpeaking = false;
        let speakingTimeout = null;
        
        function checkVoiceActivity() {
            analyser.getByteFrequencyData(dataArray);
            
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            
            const participantEl = document.getElementById(`participant-${participantId}`);
            if (participantEl) {
                const threshold = 35;
                
                if (average > threshold) {
                    if (speakingTimeout) {
                        clearTimeout(speakingTimeout);
                    }
                    
                    isSpeaking = true;
                    participantEl.classList.add('speaking');
                    
                    speakingTimeout = setTimeout(() => {
                        isSpeaking = false;
                        participantEl.classList.remove('speaking');
                    }, 200);
                }
            }
            
            requestAnimationFrame(checkVoiceActivity);
        }
        
        checkVoiceActivity();
    } catch (error) {
        console.error('Error setting up audio visualization:', error);
    }
}

async function leaveRoom() {
    // Stop all media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close all peer connections
    for (const id in peerConnections) {
        peerConnections[id].close();
    }
    
    // Update participant count and remove from room
    if (currentRoom) {
        const roomSnapshot = await database.ref(`public-rooms/${currentRoom}`).once('value');
        const room = roomSnapshot.val();
        
        if (room) {
            // Update participant count
            const newCount = Math.max(0, room.currentParticipants - 1);
            
            if (newCount === 0) {
                // If this is the last person leaving, delete the room
                await database.ref(`public-rooms/${currentRoom}`).remove();
            } else if (isHost) {
                // If host leaves, close the room
                await database.ref(`public-rooms/${currentRoom}`).remove();
            } else {
                // If participant leaves, just remove them and update count
                await database.ref(`public-rooms/${currentRoom}/currentParticipants`).set(newCount);
                await database.ref(`public-rooms/${currentRoom}/participants/${currentUserId}`).remove();
            }
        }
        
        // Remove signaling listeners
        database.ref(`public-rooms/${currentRoom}/signaling`).off();
        database.ref(`public-rooms/${currentRoom}/participants`).off();
        database.ref(`public-rooms/${currentRoom}`).off();
    }
    
    // Reset state
    currentRoom = null;
    isHost = false;
    localStream = null;
    peerConnections = {};
    isMuted = false;
    
    // Reset UI
    onlineMuteBtn.textContent = 'Mute';
    onlineMuteBtn.classList.remove('muted');
    
    // Go back to rooms list
    onlineChatRoom.classList.add('hidden');
    roomsList.classList.remove('hidden');
    
    // Clear UI
    onlineParticipants.innerHTML = '';
    
    // Remove all audio elements
    audioContainer.innerHTML = '';
    
    // Refresh rooms list
    loadPublicRooms();
}

// Make functions globally accessible
window.joinOnlineRoom = joinOnlineRoom;
window.adminDeleteRoom = adminDeleteRoom;
window.adminBanUserIp = adminBanUserIp;
