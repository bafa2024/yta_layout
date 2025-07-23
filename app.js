// AI Video Tool Web Application
// Main JavaScript file for the web interface

// Global state
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let uploadedFiles = {
    script: null,
    voice: null,
    brollVoice: null,
    brollClips: [],
    introClips: []
};
let ws = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkAuthentication();
});

function initializeApp() {
    // Setup tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    // Setup dropzones
    setupDropzone('script-dropzone', 'script-file', handleScriptUpload);
    setupDropzone('voice-dropzone', 'voice-file', handleVoiceUpload);
    setupDropzone('broll-dropzone', 'broll-files', handleBrollUpload);
    setupDropzone('intro-dropzone', 'intro-files', handleIntroUpload);
    setupDropzone('broll-voice-dropzone', 'broll-voice-file', handleBrollVoiceUpload);
}

function setupEventListeners() {
    // Auth buttons
    document.getElementById('login-btn').addEventListener('click', () => showModal('login-modal'));
    document.getElementById('register-btn').addEventListener('click', () => showModal('register-modal'));
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('api-key-btn').addEventListener('click', () => showModal('api-key-modal'));

    // Form submissions
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('api-key-form').addEventListener('submit', handleApiKey);

    // Generation buttons
    document.getElementById('generate-btn').addEventListener('click', generateAIImages);
    document.getElementById('organize-btn').addEventListener('click', organizeBroll);
}

// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'border-blue-500', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-600');
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    activeBtn.classList.add('active', 'border-blue-500', 'text-blue-600');
    activeBtn.classList.remove('border-transparent', 'text-gray-600');
    
    document.getElementById(tabName).classList.add('active');
    
    if (tabName === 'jobs') {
        loadJobs();
    }
}

// Authentication
async function checkAuthentication() {
    if (authToken) {
        try {
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (response.ok) {
                currentUser = await response.json();
                updateUIForAuth(true);
                connectWebSocket();
            } else {
                logout();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            logout();
        }
    }
}

function updateUIForAuth(isAuthenticated) {
    if (isAuthenticated) {
        document.getElementById('auth-buttons').classList.add('hidden');
        document.getElementById('user-menu').classList.remove('hidden');
        document.getElementById('username').textContent = currentUser.username;
        checkApiKey();
    } else {
        document.getElementById('auth-buttons').classList.remove('hidden');
        document.getElementById('user-menu').classList.add('hidden');
    }
    
    updateGenerateButtons();
}

async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
        const response = await fetch('/api/auth/token', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            authToken = data.access_token;
            localStorage.setItem('authToken', authToken);
            closeModal('login-modal');
            checkAuthentication();
            showNotification('Login successful!', 'success');
        } else {
            showNotification('Invalid username or password', 'error');
        }
    } catch (error) {
        showNotification('Login failed: ' + error.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: formData.get('email'),
                username: formData.get('username'),
                password: formData.get('password')
            })
        });
        
        if (response.ok) {
            closeModal('register-modal');
            showNotification('Registration successful! Please login.', 'success');
            showModal('login-modal');
        } else {
            const error = await response.json();
            showNotification(error.detail || 'Registration failed', 'error');
        }
    } catch (error) {
        showNotification('Registration failed: ' + error.message, 'error');
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    updateUIForAuth(false);
    if (ws) ws.close();
    showNotification('Logged out successfully', 'info');
}

// API Key Management
async function checkApiKey() {
    try {
        const response = await fetch('/api/settings/api-key', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            updateApiKeyStatus(data.has_api_key);
        }
    } catch (error) {
        console.error('Failed to check API key:', error);
    }
}

function updateApiKeyStatus(hasKey) {
    const btn = document.getElementById('api-key-btn');
    if (hasKey) {
        btn.innerHTML = '<i class="fas fa-key mr-2"></i>API Key ✓';
        btn.classList.add('bg-green-200');
        btn.classList.remove('bg-gray-200');
    } else {
        btn.innerHTML = '<i class="fas fa-key mr-2"></i>Set API Key';
        btn.classList.add('bg-gray-200');
        btn.classList.remove('bg-green-200');
    }
}

async function handleApiKey(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
        const response = await fetch('/api/settings/api-key', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            closeModal('api-key-modal');
            showNotification('API key saved successfully!', 'success');
            checkApiKey();
        } else {
            showNotification('Failed to save API key', 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

// File Upload Handling
function setupDropzone(dropzoneId, inputId, handler) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    
    if (!dropzone || !input) return;
    
    dropzone.addEventListener('click', () => input.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        handler(e.dataTransfer.files);
    });
    
    input.addEventListener('change', (e) => {
        handler(e.target.files);
    });
}

async function handleScriptUpload(files) {
    if (!authToken) {
        showNotification('Please login to upload files', 'error');
        return;
    }
    
    const file = files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/upload/script', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            uploadedFiles.script = data;
            document.getElementById('script-info').classList.remove('hidden');
            document.getElementById('script-filename').textContent = data.filename;
            updateGenerateButtons();
            showNotification('Script uploaded successfully!', 'success');
        } else {
            showNotification('Failed to upload script', 'error');
        }
    } catch (error) {
        showNotification('Upload error: ' + error.message, 'error');
    }
}

async function handleVoiceUpload(files) {
    if (!authToken) {
        showNotification('Please login to upload files', 'error');
        return;
    }
    
    const file = files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/upload/audio', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            uploadedFiles.voice = data;
            document.getElementById('voice-info').classList.remove('hidden');
            document.getElementById('voice-filename').textContent = data.filename;
            updateGenerateButtons();
            showNotification('Voiceover uploaded successfully!', 'success');
        } else {
            showNotification('Failed to upload voiceover', 'error');
        }
    } catch (error) {
        showNotification('Upload error: ' + error.message, 'error');
    }
}

async function handleBrollUpload(files) {
    if (!authToken) {
        showNotification('Please login to upload files', 'error');
        return;
    }
    
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('video_type', 'broll');
        
        try {
            const response = await fetch('/api/upload/video', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                uploadedFiles.brollClips.push(data);
                updateBrollList();
            }
        } catch (error) {
            console.error('Upload error:', error);
        }
    }
    
    updateOrganizeButton();
    showNotification(`Uploaded ${files.length} B-roll clips`, 'success');
}

async function handleIntroUpload(files) {
    if (!authToken) {
        showNotification('Please login to upload files', 'error');
        return;
    }
    
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('video_type', 'intro');
        
        try {
            const response = await fetch('/api/upload/video', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                uploadedFiles.introClips.push(data);
                updateIntroList();
            }
        } catch (error) {
            console.error('Upload error:', error);
        }
    }
    
    showNotification(`Uploaded ${files.length} intro clips`, 'success');
}

async function handleBrollVoiceUpload(files) {
    if (!authToken) {
        showNotification('Please login to upload files', 'error');
        return;
    }
    
    const file = files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/upload/audio', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            uploadedFiles.brollVoice = data;
            document.getElementById('broll-voice-info').classList.remove('hidden');
            document.getElementById('broll-voice-filename').textContent = data.filename;
            showNotification('Voiceover uploaded successfully!', 'success');
        } else {
            showNotification('Failed to upload voiceover', 'error');
        }
    } catch (error) {
        showNotification('Upload error: ' + error.message, 'error');
    }
}

// UI Updates
function updateGenerateButtons() {
    const generateBtn = document.getElementById('generate-btn');
    const canGenerate = authToken && uploadedFiles.script && uploadedFiles.voice;
    generateBtn.disabled = !canGenerate;
}

function updateOrganizeButton() {
    const organizeBtn = document.getElementById('organize-btn');
    const canOrganize = authToken && uploadedFiles.brollClips.length > 0;
    organizeBtn.disabled = !canOrganize;
}

function updateBrollList() {
    const listEl = document.getElementById('broll-list');
    listEl.innerHTML = uploadedFiles.brollClips.map(clip => `
        <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
            <span class="text-sm"><i class="fas fa-video mr-2"></i>${clip.filename}</span>
            <button class="text-red-500 hover:text-red-700" onclick="removeClip('broll', '${clip.file_id}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function updateIntroList() {
    const listEl = document.getElementById('intro-list');
    listEl.innerHTML = uploadedFiles.introClips.map(clip => `
        <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
            <span class="text-sm"><i class="fas fa-film mr-2"></i>${clip.filename}</span>
            <button class="text-red-500 hover:text-red-700" onclick="removeClip('intro', '${clip.file_id}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function removeClip(type, fileId) {
    if (type === 'broll') {
        uploadedFiles.brollClips = uploadedFiles.brollClips.filter(c => c.file_id !== fileId);
        updateBrollList();
    } else {
        uploadedFiles.introClips = uploadedFiles.introClips.filter(c => c.file_id !== fileId);
        updateIntroList();
    }
    updateOrganizeButton();
}

// Job Processing
async function generateAIImages() {
    if (!authToken) {
        showNotification('Please login first', 'error');
        return;
    }
    
    const scriptText = await readScriptFile();
    if (!scriptText) {
        showNotification('Failed to read script file', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('script_file_id', uploadedFiles.script.file_id);
    formData.append('voice_file_id', uploadedFiles.voice.file_id);
    formData.append('request', JSON.stringify({
        script_text: scriptText,
        image_count: parseInt(document.getElementById('image-count').value),
        style: document.getElementById('image-style').value,
        character_description: document.getElementById('character-desc').value,
        voice_duration: 60, // Will be calculated server-side
        export_options: {
            images: document.getElementById('export-images').checked,
            clips: document.getElementById('export-clips').checked,
            full_video: document.getElementById('export-full-video').checked
        }
    }));
    
    try {
        const response = await fetch('/api/generate/ai-images', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification('AI image generation started!', 'success');
            trackJob(data.job_id, 'ai');
        } else {
            const error = await response.json();
            showNotification(error.detail || 'Failed to start generation', 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function organizeBroll() {
    if (!authToken) {
        showNotification('Please login first', 'error');
        return;
    }
    
    const requestData = {
        intro_clip_ids: uploadedFiles.introClips.map(c => c.file_id),
        broll_clip_ids: uploadedFiles.brollClips.map(c => c.file_id),
        voiceover_id: uploadedFiles.brollVoice?.file_id || null,
        sync_to_voiceover: document.getElementById('sync-duration').checked,
        overlay_audio: document.getElementById('overlay-audio').checked
    };
    
    try {
        const response = await fetch('/api/generate/broll', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification('B-roll organization started!', 'success');
            trackJob(data.job_id, 'broll');
        } else {
            const error = await response.json();
            showNotification(error.detail || 'Failed to start organization', 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function readScriptFile() {
    // In a real implementation, you would read the file content
    // For now, return placeholder text
    return "This is the script content that will be used for image generation.";
}

function trackJob(jobId, type) {
    const progressSection = document.getElementById(`${type}-progress-section`);
    const progressBar = document.getElementById(`${type}-progress-bar`);
    const progressPercent = document.getElementById(`${type}-progress-percent`);
    const statusEl = document.getElementById(`${type}-status`);
    
    progressSection.classList.remove('hidden');
    
    // Poll for job status
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/jobs/${jobId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (response.ok) {
                const job = await response.json();
                
                progressBar.style.width = `${job.progress}%`;
                progressPercent.textContent = job.progress;
                statusEl.textContent = job.message;
                
                if (job.status === 'completed') {
                    clearInterval(pollInterval);
                    showNotification('Job completed successfully!', 'success');
                    if (job.result_url) {
                        showDownloadLink(job.result_url, type);
                    }
                } else if (job.status === 'failed') {
                    clearInterval(pollInterval);
                    showNotification('Job failed: ' + job.message, 'error');
                }
            }
        } catch (error) {
            console.error('Failed to poll job status:', error);
        }
    }, 2000);
}

function showDownloadLink(url, type) {
    const link = document.createElement('a');
    link.href = url;
    link.className = 'inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700';
    link.innerHTML = '<i class="fas fa-download mr-2"></i>Download Result';
    link.download = true;
    
    const progressSection = document.getElementById(`${type}-progress-section`);
    progressSection.appendChild(link);
}

// Jobs Management
async function loadJobs() {
    if (!authToken) return;
    
    try {
        const response = await fetch('/api/jobs', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const jobs = await response.json();
            displayJobs(jobs);
        }
    } catch (error) {
        console.error('Failed to load jobs:', error);
    }
}

function displayJobs(jobs) {
    const jobsList = document.getElementById('jobs-list');
    
    if (jobs.length === 0) {
        jobsList.innerHTML = '<p class="text-gray-500">No jobs found</p>';
        return;
    }
    
    jobsList.innerHTML = jobs.map(job => `
        <div class="border rounded-lg p-4">
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-semibold">${job.job_type === 'ai_image_generation' ? 'AI Image Generation' : 'B-Roll Organization'}</h4>
                    <p class="text-sm text-gray-600">${new Date(job.created_at).toLocaleString()}</p>
                    <p class="text-sm mt-2">Status: <span class="font-semibold ${getStatusColor(job.status)}">${job.status}</span></p>
                    ${job.message ? `<p class="text-sm text-gray-600">${job.message}</p>` : ''}
                </div>
                <div class="flex space-x-2">
                    ${job.result_url ? `<a href="${job.result_url}" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700" download><i class="fas fa-download mr-1"></i>Download</a>` : ''}
                    ${job.status === 'processing' || job.status === 'pending' ? `<button class="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700" onclick="cancelJob('${job.job_id}')"><i class="fas fa-times mr-1"></i>Cancel</button>` : ''}
                </div>
            </div>
            ${job.progress > 0 ? `
                <div class="mt-3">
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full" style="width: ${job.progress}%"></div>
                    </div>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function getStatusColor(status) {
    const colors = {
        'pending': 'text-yellow-600',
        'processing': 'text-blue-600',
        'completed': 'text-green-600',
        'failed': 'text-red-600',
        'cancelled': 'text-gray-600'
    };
    return colors[status] || 'text-gray-600';
}

async function cancelJob(jobId) {
    if (!confirm('Are you sure you want to cancel this job?')) return;
    
    try {
        const response = await fetch(`/api/jobs/${jobId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            showNotification('Job cancelled', 'info');
            loadJobs();
        }
    } catch (error) {
        showNotification('Failed to cancel job', 'error');
    }
}

// WebSocket for real-time updates
function connectWebSocket() {
    if (!currentUser) return;
    
    const wsUrl = `ws://${window.location.host}/ws/${currentUser.id}`;
    ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleJobUpdate(data);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        // Reconnect after 5 seconds
        setTimeout(connectWebSocket, 5000);
    };
}

function handleJobUpdate(data) {
    // Update progress if tracking this job
    const progressBar = document.querySelector(`[data-job-id="${data.job_id}"]`);
    if (progressBar) {
        progressBar.style.width = `${data.progress}%`;
    }
    
    // Refresh jobs list if on jobs tab
    if (document.getElementById('jobs').classList.contains('active')) {
        loadJobs();
    }
}

// Utility functions
function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function showNotification(message, type = 'info') {
    const colors = {
        'success': 'bg-green-500',
        'error': 'bg-red-500',
        'info': 'bg-blue-500',
        'warning': 'bg-yellow-500'
    };
    
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg text-white ${colors[type]} shadow-lg z-50`;
    notification.innerHTML = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Make closeModal available globally
window.closeModal = closeModal;