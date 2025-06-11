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

// DOM Elements
const landingPage = document.getElementById('landing-page');
const hostPage = document.getElementById('host-page');
const roomCreated = document.getElementById('room-created');
const joinPage = document.getElementById('join-page');
const chatRoom = document.getElementById('chat-room');
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const participantCount = document.getElementById('participant-count');
const createRoomBtn = document.getElementById('create-room-btn');
const roomCodeDisplay = document.getElementById('room-code');
const participantsJoined = document.getElementById('participants-joined');
const startChatBtn = document.getElementById('start-chat-btn');
const codeInput = document.getElementById('code-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const participantsDiv = document.getElementById('participants');
const muteBtn = document.getElementById('mute-btn');
const leaveBtn = document.getElementById('leave-btn');
const notification = document.getElementById('notification');
const audioContainer = document.getElementById('audio-container');

// Add navigation elements
const privateModeBtn = document.getElementById('private-mode-btn');
const onlineModeBtn = document.getElementById('online-mode-btn');
const backToMainBtn = document.getElementById('back-to-main-btn');
const backFromHostBtn = document.getElementById('back-from-host-btn');
const backFromRoomBtn = document.getElementById('back-from-room-btn');
const backFromJoinBtn = document.getElementById('back-from-join-btn');
const privateMode = document.getElementById('private-mode');

// Global variables
let currentRoom = null;
let isHost = false;
let localStream = null;
let peerConnections = {};
let maxParticipants = 0;
let currentParticipants = 0;
let currentUserId = generateUserId();
let isMuted = false;
let currentParticipantCount = 0;
let roomActivityInterval = null;

// Navigation event listeners
privateModeBtn.addEventListener('click', () => {
    landingPage.classList.add('hidden');
    privateMode.classList.remove('hidden');
});

onlineModeBtn.addEventListener('click', () => {
    window.location.href = 'online.html';
});

backToMainBtn.addEventListener('click', goBackToMain);
backFromHostBtn.addEventListener('click', goBackToPrivateMode);
backFromRoomBtn.addEventListener('click', goBackToPrivateMode);
backFromJoinBtn.addEventListener('click', goBackToPrivateMode);

function goBackToMain() {
    landingPage.classList.remove('hidden');
    privateMode.classList.add('hidden');
    hostPage.classList.add('hidden');
    roomCreated.classList.add('hidden');
    joinPage.classList.add('hidden');
    chatRoom.classList.add('hidden');
}

function goBackToPrivateMode() {
    privateMode.classList.remove('hidden');
    hostPage.classList.add('hidden');
    roomCreated.classList.add('hidden');
    joinPage.classList.add('hidden');
    chatRoom.classList.add('hidden');
}

// Event Listeners
hostBtn.addEventListener('click', () => {
    privateMode.classList.add('hidden');
    hostPage.classList.remove('hidden');
});

joinBtn.addEventListener('click', () => {
    privateMode.classList.add('hidden');
    joinPage.classList.remove('hidden');
});

createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);
startChatBtn.addEventListener('click', startChat);
muteBtn.addEventListener('click', toggleMute);
leaveBtn.addEventListener('click', leaveChat);

// Functions
function generateUserId() {
    return Math.random().toString(36).substr(2, 9);
}

function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
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

function updateRoomActivity() {
    if (currentRoom) {
        database.ref(`rooms/${currentRoom}/lastActivity`).set(Date.now());
    }
}

function startInactivityCheck() {
    roomActivityInterval = setInterval(checkRoomInactivity, 30000); // Check every 30 seconds
}

async function checkRoomInactivity() {
    if (!currentRoom) return;
    
    try {
        const roomSnapshot = await database.ref(`rooms/${currentRoom}`).once('value');
        const room = roomSnapshot.val();
        
        if (room && room.lastActivity) {
            const timeSinceLastActivity = Date.now() - room.lastActivity;
            const fiveMinutes = 5 * 60 * 1000;
            
            // Check if room is empty
            const participants = room.participants || {};
            const participantCount = Object.keys(participants).length;
            
            if (participantCount === 0 && timeSinceLastActivity > fiveMinutes) {
                console.log('Deleting inactive empty room:', currentRoom);
                await database.ref(`rooms/${currentRoom}`).remove();
            }
        }
    } catch (error) {
        console.error('Error checking room inactivity:', error);
    }
}

async function createRoom() {
    isHost = true;
    maxParticipants = parseInt(participantCount.value);
    
    // Create a new room code
    currentRoom = generateRoomCode();
    
    // Display the room code
    roomCodeDisplay.textContent = currentRoom;
    
    // Initialize room in Firebase
    await database.ref(`rooms/${currentRoom}`).set({
        host: currentUserId,
        maxParticipants: maxParticipants,
        status: 'waiting',
        createdAt: Date.now(),
        lastActivity: Date.now(),
        participants: {
            [currentUserId]: {
                joined: true,
                muted: false
            }
        }
    });
    
    // Start activity tracking
    updateRoomActivity();
    startInactivityCheck();
    
    // Listen for participant changes
    database.ref(`rooms/${currentRoom}/participants`).on('value', (snapshot) => {
        const participants = snapshot.val();
        if (participants) {
            currentParticipants = Object.keys(participants).length;
            participantsJoined.textContent = `Participants joined: ${currentParticipants - 1}`; // Minus host
            
            // Enable start button if at least one other participant has joined
            if (currentParticipants > 1) {
                startChatBtn.disabled = false;
            } else {
                startChatBtn.disabled = true;
            }
            
            // Update activity when participants change
            updateRoomActivity();
        }
    });
    
    hostPage.classList.add('hidden');
    roomCreated.classList.remove('hidden');
}

async function joinRoom() {
    const roomCode = codeInput.value.trim().toUpperCase();
    
    if (!roomCode) {
        alert('Please enter a room code');
        return;
    }
    
    // Check if room exists
    const roomSnapshot = await database.ref(`rooms/${roomCode}`).once('value');
    const room = roomSnapshot.val();
    
    if (!room) {
        alert('Room not found. Please check the code and try again.');
        return;
    }
    
    if (room.status === 'active') {
        alert('This chat has already started. You cannot join now.');
        return;
    }
    
    const participantsSnapshot = await database.ref(`rooms/${roomCode}/participants`).once('value');
    const participants = participantsSnapshot.val();
    
    if (participants && Object.keys(participants).length > room.maxParticipants) {
        alert('This room is full.');
        return;
    }
    
    // Join the room
    currentRoom = roomCode;
    
    // Add user to participants
    await database.ref(`rooms/${roomCode}/participants/${currentUserId}`).set({
        joined: true,
        muted: false
    });
    
    // Update activity when joining
    updateRoomActivity();
    startInactivityCheck();
    
    // Wait for host to start the chat
    database.ref(`rooms/${roomCode}/status`).on('value', (snapshot) => {
        const status = snapshot.val();
        if (status === 'active') {
            setupWebRTC();
            joinPage.classList.add('hidden');
            chatRoom.classList.remove('hidden');
        }
    });
    
    // Notify the user they're waiting for the host
    joinPage.innerHTML = '<h2>Waiting for host to start the chat...</h2>';
}

async function startChat() {
    if (!isHost) return;
    
    // Update room status
    await database.ref(`rooms/${currentRoom}/status`).set('active');
    
    // Setup WebRTC connections
    setupWebRTC();
    
    // Change UI
    roomCreated.classList.add('hidden');
    chatRoom.classList.remove('hidden');
}

async function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMuted = !audioTrack.enabled;
            muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
            muteBtn.classList.toggle('muted', isMuted);
            
            // Update mute status in database
            await database.ref(`rooms/${currentRoom}/participants/${currentUserId}/muted`).set(isMuted);
            
            showNotification(isMuted ? 'Microphone muted' : 'Microphone unmuted');
        }
    }
}

async function kickParticipant(participantId) {
    if (!isHost || participantId === currentUserId) return;
    
    if (confirm('Are you sure you want to kick this participant?')) {
        // Mark them as kicked first
        await database.ref(`rooms/${currentRoom}/kicked/${participantId}`).set(true);
        
        // Wait a moment then remove them
        setTimeout(async () => {
            await database.ref(`rooms/${currentRoom}/participants/${participantId}`).remove();
            showNotification('Participant kicked');
        }, 100);
    }
}

// Check for kicked status when joining room
async function checkForKicked() {
    if (currentRoom) {
        database.ref(`rooms/${currentRoom}/kicked/${currentUserId}`).on('value', (snapshot) => {
            if (snapshot.val() === true) {
                showNotification('You have been kicked from the room');
                leaveChat();
            }
        });
    }
}

async function setupWebRTC() {
    try {
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
        
        // Start activity tracking
        updateRoomActivity();
        startInactivityCheck();
        
        // Check for kicked status
        checkForKicked();
        
        // Set up signaling listeners
        setupSignalingListeners();
        
        // Set up participant tracking
        setupParticipantTracking();
        
        // Update activity when chat starts
        updateRoomActivity();
    } catch (error) {
        console.error('Error setting up WebRTC:', error);
        alert('Could not access microphone. Please ensure you have given permission.');
    }
}

function setupParticipantTracking() {
    // Listen for participants
    database.ref(`rooms/${currentRoom}/participants`).on('child_added', async (snapshot) => {
        const participantId = snapshot.key;
        if (participantId !== currentUserId) {
            
            // Check if we already have a connection
            if (!peerConnections[participantId]) {
                // Wait a bit to ensure both parties are ready
                setTimeout(() => {
                    createPeerConnection(participantId);
                    showNotification('Someone joined the chat');
                }, 500);
            }
        }
    });
    
    // Listen for participants leaving
    database.ref(`rooms/${currentRoom}/participants`).on('child_removed', (snapshot) => {
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
            
            showNotification('Someone left the chat');
        }
    });
    
    // Listen for mute status changes
    database.ref(`rooms/${currentRoom}/participants`).on('value', (snapshot) => {
        const participants = snapshot.val();
        if (participants) {
            Object.keys(participants).forEach(participantId => {
                updateMuteIndicator(participantId, participants[participantId].muted);
            });
        }
    });
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

function setupSignalingListeners() {
    // Listen for offers
    database.ref(`rooms/${currentRoom}/signaling/offers`).on('child_added', async (snapshot) => {
        const message = snapshot.val();
        if (message.recipient === currentUserId && message.sender !== currentUserId) {
            await handleOffer(message.sender, message.description);
            snapshot.ref.remove();
        }
    });
    
    // Listen for answers
    database.ref(`rooms/${currentRoom}/signaling/answers`).on('child_added', async (snapshot) => {
        const message = snapshot.val();
        if (message.recipient === currentUserId && message.sender !== currentUserId) {
            await handleAnswer(message.sender, message.description);
            snapshot.ref.remove();
        }
    });
    
    // Listen for ICE candidates
    database.ref(`rooms/${currentRoom}/signaling/candidates`).on('child_added', async (snapshot) => {
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
                urls: 'turn:relay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:relay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
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
            // Ensure audio plays through speakers
            if (audioElement.setSinkId && typeof audioElement.setSinkId === 'function') {
                audioElement.setSinkId('default').catch(console.error);
            }
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
                // Retry after user interaction
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
            // Ensure audio is playing after connection is established
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
        // Create a new connection if it doesn't exist
        let pc = peerConnections[senderId];
        if (!pc) {
            pc = createPeerConnection(senderId);
        }
        
        // Only set remote description if we're in the correct state
        if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
            const sessionDescription = new RTCSessionDescription({
                type: description.type,
                sdp: description.sdp
            });
            
            await pc.setRemoteDescription(sessionDescription);
            
            // Create and send answer
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
            // Ensure we have the required fields
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
    database.ref(`rooms/${currentRoom}/signaling/${type}`).push(message);
}

function addParticipantUI(participantId, isLocal) {
    // Create participant element if it doesn't exist
    if (!document.getElementById(`participant-${participantId}`)) {
        const participantEl = document.createElement('div');
        participantEl.className = 'participant';
        participantEl.id = `participant-${participantId}`;
        
        // Add participant label
        const nameLabel = document.createElement('div');
        nameLabel.className = 'participant-name';
        nameLabel.textContent = isLocal ? 'You' : 'User';
        
        participantEl.appendChild(nameLabel);
        
        // Add kick button for host (except for own participant)
        if (isHost && !isLocal) {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'kick-btn';
            kickBtn.innerHTML = '×';
            kickBtn.onclick = () => kickParticipant(participantId);
            participantEl.appendChild(kickBtn);
        }
        
        participantsDiv.appendChild(participantEl);
        
        // Update mute status
        database.ref(`rooms/${currentRoom}/participants/${participantId}/muted`).once('value', (snapshot) => {
            updateMuteIndicator(participantId, snapshot.val() || false);
        });
    }
}

function setupAudioVisualization(stream, participantId) {
    try {
        // Create audio analyzer for the stream
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        
        // Resume audio context if suspended
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        source.connect(analyser);
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // Track last speaking state to reduce flicker
        let isSpeaking = false;
        let speakingTimeout = null;
        
        // Function to check if participant is speaking
        function checkVoiceActivity() {
            analyser.getByteFrequencyData(dataArray);
            
            // Calculate average volume
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            
            // Update UI based on voice activity
            const participantEl = document.getElementById(`participant-${participantId}`);
            if (participantEl) {
                // Use a higher threshold and add debouncing
                const threshold = 35;
                
                if (average > threshold) {
                    // Clear any existing timeout
                    if (speakingTimeout) {
                        clearTimeout(speakingTimeout);
                    }
                    
                    // Set speaking state
                    isSpeaking = true;
                    participantEl.classList.add('speaking');
                    
                    // Set timeout to remove speaking indicator
                    speakingTimeout = setTimeout(() => {
                        isSpeaking = false;
                        participantEl.classList.remove('speaking');
                    }, 200); // Keep indicator for 200ms after speaking stops
                }
            }
            
            // Continue checking
            requestAnimationFrame(checkVoiceActivity);
        }
        
        // Start checking voice activity
        checkVoiceActivity();
    } catch (error) {
        console.error('Error setting up audio visualization:', error);
    }
}

async function leaveChat() {
    // Clear intervals
    if (roomActivityInterval) {
        clearInterval(roomActivityInterval);
        roomActivityInterval = null;
    }
    
    // Stop all media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close all peer connections
    for (const id in peerConnections) {
        peerConnections[id].close();
    }
    
    // Remove from room in Firebase
    if (currentRoom) {
        if (isHost) {
            // If host leaves, close the room
            await database.ref(`rooms/${currentRoom}`).remove();
        } else {
            // If participant leaves, just remove them
            await database.ref(`rooms/${currentRoom}/participants/${currentUserId}`).remove();
        }
        
        // Remove signaling listeners
        database.ref(`rooms/${currentRoom}/signaling`).off();
        database.ref(`rooms/${currentRoom}/participants`).off();
    }
    
    // Reset state
    currentRoom = null;
    isHost = false;
    localStream = null;
    peerConnections = {};
    isMuted = false;
    
    // Reset UI
    muteBtn.textContent = 'Mute';
    muteBtn.classList.remove('muted');
    
    // Back to private mode
    chatRoom.classList.add('hidden');
    privateMode.classList.remove('hidden');
    
    // Clear UI
    participantsDiv.innerHTML = '';
    
    // Remove all audio elements
    audioContainer.innerHTML = '';
}

// Check for inactive rooms when page loads
checkRoomInactivity();

// Periodic cleanup every 5 minutes
setInterval(async () => {
    try {
        const roomsSnapshot = await database.ref('rooms').once('value');
        const rooms = roomsSnapshot.val();
        
        if (rooms) {
            Object.keys(rooms).forEach(async (roomId) => {
                const room = rooms[roomId];
                if (room.lastActivity) {
                    const timeSinceLastActivity = Date.now() - room.lastActivity;
                    const fiveMinutes = 5 * 60 * 1000;
                    
                    // Check if room is empty
                    const participants = room.participants || {};
                    const participantCount = Object.keys(participants).length;
                    
                    if (participantCount === 0 && timeSinceLastActivity > fiveMinutes) {
                        console.log('Deleting inactive empty room:', roomId);
                        await database.ref(`rooms/${roomId}`).remove();
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error during periodic cleanup:', error);
    }
}, 5 * 60 * 1000); // Run every 5 minutes
