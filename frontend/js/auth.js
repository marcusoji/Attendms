// PRODUCTION-READY ATTENDANCE SYSTEM - AUTH.JS
// Secure, efficient, and cross-device compatible

const API_URL = '/api';
let currentUser = { type: null, token: null, info: {} };
let currentUserType = 'student';
let faceScanBlob = null;
let videoStream = null;

const pages = {
    auth: document.getElementById('authPage'),
    student: document.getElementById('studentDashboard'),
    lecturer: document.getElementById('lecturerDashboard'),
    admin: document.getElementById('adminDashboard')
};

const loginForm = document.getElementById('login-form-element');
const registerForm = document.getElementById('register-form-element');
const courseForm = document.getElementById('courseForm');
const generateCodeForm = document.getElementById('generateCodeForm');
const attendanceForm = document.getElementById('attendanceForm');
const captureCanvas = document.getElementById('captureCanvas');

// ============================================
// UTILITY FUNCTIONS
// ============================================

function navigate(page) {
    Object.values(pages).forEach(p => p.classList.remove('active'));
    if (pages[page]) pages[page].classList.add('active');
}

function displayMessage(elementId, message, isError = true) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.className = isError ? 'error-msg' : 'success-msg';
    }
}

function clearMessages() {
    document.querySelectorAll('.error-msg, .success-msg').forEach(el => el.textContent = '');
    stopCamera();
}

function clearFaceScan() {
    faceScanBlob = null;
    document.querySelectorAll('[id$="Status"]').forEach(el => {
        if (el.textContent.includes('Face Captured') || el.textContent.includes('captured')) {
            el.textContent = '';
        }
    });
}

// ============================================
// AUTHENTICATION UI FUNCTIONS
// ============================================

function switchAuthMode(mode) {
    clearMessages();
    clearFaceScan();
    
    if (mode === 'login') {
        document.getElementById('authToggleLogin').classList.add('active');
        document.getElementById('authToggleRegister').classList.remove('active');
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('registerForm').classList.add('hidden');
    } else {
        document.getElementById('authToggleLogin').classList.remove('active');
        document.getElementById('authToggleRegister').classList.add('active');
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    }
    const activeForm = document.querySelector(`#${mode}Form`);
    if (activeForm) {
        const firstTab = activeForm.querySelector('.tab-btn');
        if (firstTab) switchUserType(firstTab);
    }
}

function switchUserType(btn) {
    clearMessages();
    const newUserType = btn.dataset.userType;
    const wasStudent = currentUserType === 'student';
    const isStudent = newUserType === 'student';
    
    if (wasStudent !== isStudent) {
        clearFaceScan();
    }
    
    currentUserType = newUserType;
    
    btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const formContainer = btn.closest('div[id$="Form"]');
    
    formContainer.querySelectorAll('.form-fields').forEach(fieldSet => {
        const forTypes = fieldSet.dataset.forType.split(' ');
        const isVisible = forTypes.includes(currentUserType);
        
        fieldSet.classList.toggle('hidden', !isVisible);
        
        fieldSet.querySelectorAll('input, select').forEach(input => {
            input.required = isVisible;
            input.disabled = !isVisible;
            if (!isVisible) input.value = '';
        });
    });
}

// ============================================
// CAMERA FUNCTIONS
// ============================================

async function startCamera(videoElementId) {
    stopCamera();
    const videoPreview = document.getElementById(videoElementId);
    const statusElementId = videoElementId.includes('login') ? 'loginScanStatus' : 'registerScanStatus';
    
    videoPreview.style.display = 'block';
    
    try {
        displayMessage(statusElementId, '📷 Starting camera...', false);
        
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
                facingMode: 'user'
            }
        });
        
        videoPreview.srcObject = videoStream;
        
        await new Promise((resolve) => {
            videoPreview.onloadedmetadata = () => {
                videoPreview.play();
                resolve();
            };
        });
        
        displayMessage(statusElementId, '✅ Camera ready! Position your face centered.', false);
        
        setTimeout(() => showLightingIndicator(videoElementId), 1000);
        
    } catch (err) {
        console.error("Camera Error:", err);
        const errorMsg = videoElementId.includes('login') ? 'loginError' : 'registerError';
        displayMessage(errorMsg, 'Could not access camera. Please grant permission.');
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    document.getElementById('video-preview-login').style.display = 'none';
    document.getElementById('video-preview-register').style.display = 'none';
    
    const lightingIndicator = document.getElementById('lightingIndicator');
    if (lightingIndicator && lightingIndicator.parentElement) {
        lightingIndicator.remove();
    }
}

function showLightingIndicator(videoElementId) {
    const videoPreview = document.getElementById(videoElementId);
    
    const existingIndicator = document.getElementById('lightingIndicator');
    if (existingIndicator) existingIndicator.remove();
    
    const lightingIndicator = document.createElement('div');
    lightingIndicator.id = 'lightingIndicator';
    lightingIndicator.style.cssText = `
        position: absolute; top: 10px; left: 10px; padding: 10px 15px;
        background: rgba(0, 0, 0, 0.8); color: white; border-radius: 5px;
        font-size: 13px; z-index: 1000; font-weight: bold;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    `;
    
    const videoContainer = videoPreview.parentElement;
    if (!videoContainer.style.position || videoContainer.style.position === 'static') {
        videoContainer.style.position = 'relative';
    }
    videoContainer.appendChild(lightingIndicator);
    
    let consecutiveNoFace = 0;
    
    const checkLighting = setInterval(async () => {
        if (!videoStream) {
            clearInterval(checkLighting);
            if (lightingIndicator && lightingIndicator.parentElement) {
                lightingIndicator.remove();
            }
            return;
        }
        
        const tempCanvas = document.createElement('canvas');
        const context = tempCanvas.getContext('2d');
        tempCanvas.width = videoPreview.videoWidth;
        tempCanvas.height = videoPreview.videoHeight;
        
        if (tempCanvas.width === 0) return;
        
        context.drawImage(videoPreview, 0, 0);
        const imageData = context.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
            totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (data.length / 4);
        
        let faceDetected = false;
        if (faceApiLoaded) {
            try {
                const detection = await faceapi.detectSingleFace(
                    videoPreview,
                    new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })
                );
                faceDetected = !!detection;
                consecutiveNoFace = faceDetected ? 0 : consecutiveNoFace + 1;
            } catch (err) {
                // Ignore
            }
        }
        
        let message, color;
        if (avgBrightness < 50) {
            message = "🔴 Very Dark - Add light";
            color = "#ef4444";
        } else if (!faceDetected && consecutiveNoFace > 2) {
            message = "⚠️ Position face in center";
            color = "#f59e0b";
        } else if (avgBrightness < 100) {
            message = "🟡 Low Light - Will enhance";
            color = "#f59e0b";
        } else if (avgBrightness > 200) {
            message = "🔴 Too Bright";
            color = "#ef4444";
        } else {
            message = "🟢 Ready to Capture";
            color = "#10b981";
        }
        
        if (lightingIndicator && lightingIndicator.parentElement) {
            lightingIndicator.textContent = message;
            lightingIndicator.style.background = color;
        }
    }, 1500);
}

// ============================================
// FACE CAPTURE WITH ENHANCEMENT
// ============================================

async function captureFace(videoElementId, statusElementId) {
    const videoPreview = document.getElementById(videoElementId);
    
    if (!videoStream) {
        displayMessage(statusElementId, "Start camera first.", true);
        return;
    }

    if (videoPreview.videoWidth === 0 || videoPreview.videoHeight === 0) {
        displayMessage(statusElementId, "Camera loading, wait...", true);
        return;
    }

    displayMessage(statusElementId, "📸 Capturing...", false);

    const context = captureCanvas.getContext('2d');
    const width = Math.max(videoPreview.videoWidth, 640);
    const height = Math.max(videoPreview.videoHeight, 480);
    
    captureCanvas.width = width;
    captureCanvas.height = height;
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(videoPreview, 0, 0, width, height);
    
    enhanceLighting(context, width, height);
    
    captureCanvas.toBlob(async (blob) => {
        if (!blob || blob.size < 1000) {
            displayMessage(statusElementId, "❌ Capture failed, retry.", true);
            return;
        }

        displayMessage(statusElementId, "🔍 Analyzing...", false);
        
        if (faceApiLoaded) {
            try {
                const imageUrl = URL.createObjectURL(blob);
                const img = new Image();
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error('Image load failed'));
                    img.src = imageUrl;
                });
                
                const confidenceLevels = [0.5, 0.3, 0.2, 0.1, 0.05];
                let testDetection = null;
                
                for (const minConfidence of confidenceLevels) {
                    testDetection = await faceapi.detectSingleFace(
                        img, 
                        new faceapi.SsdMobilenetv1Options({ minConfidence })
                    );
                    if (testDetection) break;
                }
                
                URL.revokeObjectURL(imageUrl);
                
                if (testDetection) {
                    const quality = testDetection.score;
                    faceScanBlob = blob;
                    displayMessage(statusElementId, 
                        `✅ Captured! (${(quality * 100).toFixed(1)}%)`, 
                        false);
                    stopCamera();
                } else {
                    faceScanBlob = blob;
                    displayMessage(statusElementId, 
                        "⚠️ Face unclear but captured. Recapture if unsure.", 
                        false);
                    stopCamera();
                }
                
            } catch (error) {
                faceScanBlob = blob;
                displayMessage(statusElementId, 
                    "✓ Captured (detection skipped)", 
                    false);
                stopCamera();
            }
        } else {
            faceScanBlob = blob;
            displayMessage(statusElementId, "✓ Captured", false);
            stopCamera();
        }
    }, 'image/jpeg', 0.95);
}

function enhanceLighting(context, width, height) {
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (data.length / 4);
    
    let adjustment = 0;
    if (avgBrightness < 100) {
        adjustment = Math.min(120, (100 - avgBrightness) * 1.2);
    } else if (avgBrightness > 180) {
        adjustment = (180 - avgBrightness) * 0.4;
    }
    
    if (adjustment !== 0) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, data[i] + adjustment));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + adjustment));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + adjustment));
        }
    }
    
    const contrast = avgBrightness < 80 ? 1.3 : 1.1;
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
    
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
        data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
        data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
    }
    
    context.putImageData(imageData, 0, 0);
}

// ============================================
// API FUNCTIONS
// ============================================

async function apiFetch(endpoint, options = {}) {
    try {
        const response = await fetch(API_URL + endpoint, options);
        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.message || `HTTP error! status: ${response.status}`);
        }
        return responseData;
    } catch (error) {
        console.error(`API call to ${endpoint} failed:`, error);
        throw new Error(error.message || 'Network error. Please try again.');
    }
}

// ============================================
// FACE RECOGNITION - BALANCED SECURITY
// ============================================

async function handleStudentFaceLogin() {
    if (!faceApiLoaded) throw new Error("Face recognition loading...");
    if (!faceScanBlob) throw new Error("Capture your face first.");

    const matNo = loginForm.elements.matNo.value;
    if (!matNo) throw new Error("Mat number required.");

    displayMessage('loginError', 'Verifying...', false);

    try {
        const studentData = await apiFetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userType: 'student', matNo })
        });

        if (!studentData.faceScanData) {
            throw new Error("No registered face found.");
        }

        displayMessage('loginError', 'Analyzing faces...', false);

        const registeredImage = await createImageFromBase64(studentData.faceScanData);
        const liveImage = await faceapi.bufferToImage(faceScanBlob);

        const registeredDetection = await detectFaceFlexible(registeredImage, 'registered');
        const liveDetection = await detectFaceFlexible(liveImage, 'live');

        if (!registeredDetection) {
            throw new Error("Registered photo unclear. Re-register with better lighting.");
        }
        
        if (!liveDetection) {
            throw new Error("Face not detected. Improve lighting and try again.");
        }

        const isValidMatch = await validateFaceMatch(registeredDetection, liveDetection, matNo);
        
        if (isValidMatch.success) {
            displayMessage('loginError', `✅ Verified! (${isValidMatch.similarity}%)`, false);
            loginSuccess(studentData.token, studentData.user);
        } else {
            throw new Error(isValidMatch.error);
        }

    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

async function detectFaceFlexible(imageElement, imageName) {
    const confidenceLevels = [0.5, 0.3, 0.2, 0.1, 0.05];

    for (const minConfidence of confidenceLevels) {
        try {
            const detection = await faceapi
                .detectSingleFace(imageElement, new faceapi.SsdMobilenetv1Options({ minConfidence }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                console.log(`${imageName}: detected at ${minConfidence} confidence`);
                return detection;
            }
        } catch (error) {
            console.warn(`${imageName} detection failed at ${minConfidence}`);
        }
    }

    try {
        const allDetections = await faceapi
            .detectAllFaces(imageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.05 }))
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (allDetections.length > 0) {
            return allDetections.reduce((best, current) => 
                current.detection.score > best.detection.score ? current : best
            );
        }
    } catch (error) {
        console.warn(`Multi-face detection failed for ${imageName}`);
    }

    return null;
}

async function validateFaceMatch(registered, live, matNo) {
    try {
        // SECURITY THRESHOLDS - Balanced for real-world use
        const MINIMUM_THRESHOLD = 0.65;  // 35% minimum (blocks random people)
        const STANDARD_THRESHOLD = 0.50;  // 50% standard (same device)
        const CROSSDEVICE_THRESHOLD = 0.60; // 40% (different devices)

        const distance = faceapi.euclideanDistance(registered.descriptor, live.descriptor);
        const similarity = ((1 - distance) * 100).toFixed(1);
        
        console.log(`Match for ${matNo}: ${similarity}% (distance: ${distance})`);

        // HARD REJECT - Completely different person
        if (distance > MINIMUM_THRESHOLD) {
            return {
                success: false,
                similarity,
                error: `Verification failed (${similarity}%). Different person detected.\n\nImprove lighting and try again, or re-register.`
            };
        }

        // Detect cross-device scenario
        const regBox = registered.detection.box;
        const liveBox = live.detection.box;
        const sizeRatio = Math.max(regBox.width, regBox.height) / Math.max(liveBox.width, liveBox.height);
        const isDifferentDevice = sizeRatio < 0.6 || sizeRatio > 1.7;
        const hasLowConfidence = registered.detection.score < 0.4 || live.detection.score < 0.4;

        let effectiveThreshold = STANDARD_THRESHOLD;
        if (isDifferentDevice || hasLowConfidence) {
            effectiveThreshold = CROSSDEVICE_THRESHOLD;
        }

        if (distance > effectiveThreshold) {
            // Close to threshold - check facial structure
            if (distance - effectiveThreshold < 0.08) {
                const structural = await checkFacialStructure(registered, live);
                if (structural.passed) {
                    console.log('Accepted via structural validation');
                    return { success: true, similarity, distance };
                }
            }
            
            return {
                success: false,
                similarity,
                error: `Verification failed (${similarity}%). Required: >${((1-effectiveThreshold)*100).toFixed(1)}%\n\nTips:\n• Use similar lighting\n• Same angle as registration\n• Or re-register from this device`
            };
        }

        // Additional check for low similarity (35-45%)
        if (similarity < 55) {
            const structural = await checkFacialStructure(registered, live);
            if (!structural.passed) {
                return {
                    success: false,
                    similarity,
                    error: `Facial structure mismatch (${similarity}%). ${structural.reason}`
                };
            }
        }

        console.log(`LOGIN SUCCESS: ${matNo} at ${similarity}%`);
        return { success: true, similarity, distance };

    } catch (error) {
        console.error('Validation error:', error);
        return { success: false, error: 'System error. Try again.' };
    }
}

async function checkFacialStructure(registered, live) {
    try {
        const regLandmarks = registered.landmarks.positions;
        const liveLandmarks = live.landmarks.positions;
        
        if (!regLandmarks || !liveLandmarks || regLandmarks.length < 68 || liveLandmarks.length < 68) {
            return { passed: false, reason: 'Facial features unclear' };
        }
        
        const getProportions = (landmarks) => {
            const eyeDistance = Math.hypot(
                landmarks[45].x - landmarks[36].x,
                landmarks[45].y - landmarks[36].y
            );
            const faceHeight = Math.hypot(
                landmarks[8].x - landmarks[30].x,
                landmarks[8].y - landmarks[30].y
            );
            const faceWidth = Math.hypot(
                landmarks[16].x - landmarks[0].x,
                landmarks[16].y - landmarks[0].y
            );
            
            return {
                eyeToHeight: eyeDistance / faceHeight,
                widthToHeight: faceWidth / faceHeight
            };
        };
        
        const regProps = getProportions(regLandmarks);
        const liveProps = getProportions(liveLandmarks);
        
        const eyeDiff = Math.abs(regProps.eyeToHeight - liveProps.eyeToHeight) / regProps.eyeToHeight;
        const widthDiff = Math.abs(regProps.widthToHeight - liveProps.widthToHeight) / regProps.widthToHeight;
        
        if (eyeDiff > 0.25 || widthDiff > 0.25) {
            return { passed: false, reason: 'Face proportions too different' };
        }
        
        return { passed: true };
        
    } catch (error) {
        return { passed: false, reason: 'Structure check failed' };
    }
}

async function createImageFromBase64(base64Data) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = `data:image/jpeg;base64,${base64Data}`;
    });
}

async function handleLecturerAdminLogin() {
    const email = loginForm.elements.email.value;
    const password = loginForm.elements.password.value;
    if (!email || !password) throw new Error('Email and Password required.');
    
    const result = await apiFetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userType: currentUserType, email, password })
    });
    
    loginSuccess(result.token, result.user);
}

function loginSuccess(token, userInfo) {
    currentUser.token = token;
    currentUser.info = userInfo;
    currentUser.type = currentUserType;
    localStorage.setItem('attendanceUser', JSON.stringify(currentUser));

    if (currentUser.type === 'student') {
        document.getElementById('studentWelcome').textContent = `Welcome, ${currentUser.info.name}!`;
        navigate('student');
    } else if (currentUser.type === 'lecturer') {
        document.getElementById('lecturerWelcome').textContent = `Welcome, ${currentUser.info.name}!`;
        loadLecturerData();
        navigate('lecturer');
    } else if (currentUser.type === 'admin') {
        navigate('admin');
    }
}

// ============================================
// REGISTRATION HANDLER
// ============================================

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    try {
        if (currentUserType === 'student') {
            if (!faceScanBlob) throw new Error('Capture your face first.');
            const formData = new FormData(registerForm);
            formData.append('userType', currentUserType);
            formData.append('faceScan', faceScanBlob, 'face.jpg');
            const response = await fetch(`${API_URL}/register`, { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
        } else if (currentUserType === 'lecturer') {
            const lecturerSection = registerForm.querySelector('.form-fields[data-for-type="lecturer"]:not(.hidden)');
            if (!lecturerSection) throw new Error('Form error');
            
            const lecturerInputs = lecturerSection.querySelectorAll('input');
            const lecturerData = { userType: 'lecturer' };
            
            lecturerInputs.forEach(input => {
                lecturerData[input.name] = input.value;
            });
            
            const response = await fetch(`${API_URL}/register/lecturer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lecturerData)
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
        }
        
        displayMessage('registerSuccess', 'Registration successful! Login now.', false);
        clearFaceScan();
        setTimeout(() => switchAuthMode('login'), 2000);
    } catch (error) {
        displayMessage('registerError', error.message);
    }
});

// ============================================
// LOGIN HANDLER
// ============================================

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    try {
        if (currentUserType === 'student') {
            await handleStudentFaceLogin();
        } else {
            await handleLecturerAdminLogin();
        }
    } catch (error) {
        displayMessage('loginError', error.message);
    }
});

// ============================================
// LECTURER FUNCTIONS
// ============================================

async function loadLecturerData() {
    try {
        const courses = await apiFetch('/courses', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        const listEl = document.getElementById('coursesList');
        const selectCodeEl = document.getElementById('courseSelectForCode');
        const selectReportEl = document.getElementById('courseSelectForReport');
        
        listEl.innerHTML = '';
        selectCodeEl.innerHTML = '<option value="">-- Select Course --</option>';
        selectReportEl.innerHTML = '<option value="">-- Select Course --</option>';

        courses.forEach(course => {
            listEl.innerHTML += `<p><b>${course.course_code}:</b> ${course.course_title}</p>`;
            selectCodeEl.innerHTML += `<option value="${course.id}">${course.course_code} - ${course.course_title}</option>`;
            selectReportEl.innerHTML += `<option value="${course.id}">${course.course_code} - ${course.course_title}</option>`;
        });
    } catch (error) {
        displayMessage('lecturerError', error.message);
    }
}

function showAttendanceReportUI() {
    document.getElementById('attendanceReportCard').classList.remove('hidden');
    document.getElementById('sessionsContainer').innerHTML = '';
    document.getElementById('attendanceDetailsContainer').innerHTML = '';
}

// [Include all your existing lecturer report functions here - loadSessionDetails, printSessionReport, etc.]
// They remain unchanged from your original code

// ============================================
// OTHER EVENT HANDLERS
// ============================================

courseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const courseCode = e.target.courseCode.value;
    const courseTitle = e.target.courseTitle.value;
    try {
        await apiFetch('/courses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
            body: JSON.stringify({ courseCode, courseTitle })
        });
        courseForm.reset();
        document.getElementById('createCourseCard').classList.add('hidden');
        loadLecturerData();
        displayMessage('lecturerError', 'Course created! 🎉', false);
    } catch (error) {
        displayMessage('lecturerError', error.message);
    }
});

generateCodeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearMessages();
    const courseId = parseInt(document.getElementById('courseSelectForCode').value, 10);
    if (!courseId) {
        displayMessage('lecturerError', 'Select course first.');
        return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
            const result = await apiFetch('/generate-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}`},
                body: JSON.stringify({ courseId, lat: latitude, lon: longitude })
            });
            document.getElementById('generatedCodeDisplay').textContent = `🎫 Code: ${result.code}`;
        } catch (error) { 
            displayMessage('lecturerError', error.message); 
        }
    }, () => { 
        displayMessage('lecturerError', 'Location required.'); 
    });
});

attendanceForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearMessages();
    const code = e.target.code.value;
    if (!code) {
        displayMessage('studentError', 'Enter code.');
        return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
            const result = await apiFetch('/mark-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}`},
                body: JSON.stringify({ code, lat: latitude, lon: longitude })
            });
            displayMessage('studentSuccess', `✅ ${result.message}`, false);
            attendanceForm.reset();
        } catch (error) { 
            displayMessage('studentError', error.message); 
        }
    }, () => { 
        displayMessage('studentError', 'Location required.'); 
    });
});

// ============================================
// COURSE REPORT FUNCTIONS
// ============================================

document.getElementById('courseSelectForReport').addEventListener('change', async (e) => {
    const courseId = e.target.value;
    const sessionsContainer = document.getElementById('sessionsContainer');
    const detailsContainer = document.getElementById('attendanceDetailsContainer');
    
    sessionsContainer.innerHTML = '';
    detailsContainer.innerHTML = '';
    
    if (!courseId) return;

    try {
        sessionsContainer.innerHTML = '<div class="loading">Loading...</div>';
        
        const [stats, sessions] = await Promise.all([
            apiFetch(`/courses/${courseId}/stats`, {
                headers: { 'Authorization': `Bearer ${currentUser.token}` }
            }),
            apiFetch(`/attendance/${courseId}/sessions`, {
                headers: { 'Authorization': `Bearer ${currentUser.token}` }
            })
        ]);
        
        if (sessions.length === 0) {
            sessionsContainer.innerHTML = `
                <div class="no-sessions">
                    <h3>No Sessions Found</h3>
                    <p>No attendance recorded yet.</p>
                </div>
            `;
            return;
        }

        const statsHTML = `
            <div class="course-stats">
                <h3>📚 ${stats.course.course_code} - ${stats.course.course_title}</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Sessions</span>
                        <span class="stat-value">${stats.statistics.total_sessions || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Students</span>
                        <span class="stat-value">${stats.statistics.unique_students || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Records</span>
                        <span class="stat-value">${stats.statistics.total_attendance_records || 0}</span>
                    </div>
                </div>
            </div>
        `;

        const sessionsHTML = sessions.map((session, index) => {
            const sessionDate = new Date(session.attendance_date).toLocaleDateString();
            const sessionStart = new Date(session.session_start).toLocaleTimeString();
            const sessionEnd = new Date(session.session_end).toLocaleTimeString();
            
            return `
                <div class="session-card">
                    <div class="session-info">
                        <h4>📅 Session ${index + 1}: ${sessionDate}</h4>
                        <p><strong>👥 Present:</strong> ${session.total_students}</p>
                        <p><strong>⏰ Time:</strong> ${sessionStart} - ${sessionEnd}</p>
                    </div>
                    <div class="session-actions">
                        <button class="secondary-btn" onclick="loadSessionDetails('${courseId}', '${session.attendance_date}')">
                            View Details
                        </button>
                        <button class="secondary-btn" onclick="printSessionReport('${courseId}', '${session.attendance_date}', '${session.course_code}', '${sessionDate}')">
                            Print
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        sessionsContainer.innerHTML = statsHTML + '<h3>📊 Sessions</h3>' + sessionsHTML;
        
    } catch (error) { 
        sessionsContainer.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
    }
});

async function loadSessionDetails(courseId, date) {
    const detailsContainer = document.getElementById('attendanceDetailsContainer');
    
    try {
        detailsContainer.innerHTML = '<div class="loading">Loading...</div>';
        
        const records = await apiFetch(`/attendance/${courseId}/date/${date}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (records.length === 0) {
            detailsContainer.innerHTML = '<div class="no-records"><h3>No records found.</h3></div>';
            return;
        }
        
        const sessionDate = new Date(date).toLocaleDateString();
        const courseInfo = records[0];
        
        const tableHTML = `
            <div class="session-details">
                <div class="session-header">
                    <h3>📋 ${sessionDate}</h3>
                    <p><strong>Course:</strong> ${courseInfo.course_code} - ${courseInfo.course_title}</p>
                    <p><strong>Total:</strong> ${records.length} students</p>
                </div>
                
                <table class="attendance-details-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Student Name</th>
                            <th>Mat No.</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map((record, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${record.student_name}</td>
                                <td>${record.mat_no}</td>
                                <td>${new Date(record.marked_at).toLocaleTimeString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="session-actions" style="margin-top: 20px;">
                    <button class="secondary-btn" onclick="printSessionReport('${courseId}', '${date}', '${courseInfo.course_code}', '${sessionDate}')">
                        🖨️ Print
                    </button>
                </div>
            </div>
        `;
        
        detailsContainer.innerHTML = tableHTML;
        
    } catch (error) {
        detailsContainer.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
    }
}

async function printSessionReport(courseId, date, courseCode, formattedDate) {
    try {
        const records = await apiFetch(`/attendance/${courseId}/date/${date}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (records.length === 0) {
            alert('No records found.');
            return;
        }
        
        const courseInfo = records[0];
        const printWindow = window.open('', '_blank');
        
        const tableHTML = `
            <table style="width:100%; border-collapse:collapse; margin-top: 20px;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white;">
                        <th style="border: 1px solid #ddd; padding: 12px;">#</th>
                        <th style="border: 1px solid #ddd; padding: 12px;">Student</th>
                        <th style="border: 1px solid #ddd; padding: 12px;">Mat No.</th>
                        <th style="border: 1px solid #ddd; padding: 12px;">Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map((record, index) => `
                        <tr${index % 2 === 1 ? ' style="background-color: #f9f9f9;"' : ''}>
                            <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
                            <td style="border: 1px solid #ddd; padding: 8px;">${record.student_name}</td>
                            <td style="border: 1px solid #ddd; padding: 8px;">${record.mat_no}</td>
                            <td style="border: 1px solid #ddd; padding: 8px;">${new Date(record.marked_at).toLocaleTimeString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Report - ${courseCode} - ${formattedDate}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                        .header { text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
                        .course-info { margin-bottom: 20px; background-color: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #4f46e5; }
                        .summary { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
                        @media print { body { margin: 0; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>🏫 School Attendance System</h1>
                        <h2>📊 Session Report</h2>
                    </div>
                    
                    <div class="course-info">
                        <h3>📚 ${courseInfo.course_code} - ${courseInfo.course_title}</h3>
                        <p><strong>📅 Date:</strong> ${formattedDate}</p>
                        <p><strong>🕒 Generated:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    
                    <div class="summary">
                        <h4>📈 Summary</h4>
                        <p><strong>👥 Total Present:</strong> ${records.length}</p>
                        <p><strong>⏰ Time Range:</strong> ${new Date(records[0].marked_at).toLocaleTimeString()} - ${new Date(records[records.length - 1].marked_at).toLocaleTimeString()}</p>
                    </div>
                    
                    <h4>📋 Attendance Records</h4>
                    ${tableHTML}
                    
                    <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 20px;">
                        <p>Generated by School Attendance System | ${new Date().toLocaleString()}</p>
                    </div>
                </body>
            </html>
        `);
        
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
        
    } catch (error) {
        alert(`Print failed: ${error.message}`);
    }
}

async function printCourseReport() {
    const courseId = document.getElementById('courseSelectForReport').value;
    if (!courseId) {
        alert('Select course first.');
        return;
    }
    
    try {
        const [stats, sessions] = await Promise.all([
            apiFetch(`/courses/${courseId}/stats`, {
                headers: { 'Authorization': `Bearer ${currentUser.token}` }
            }),
            apiFetch(`/attendance/${courseId}/sessions`, {
                headers: { 'Authorization': `Bearer ${currentUser.token}` }
            })
        ]);
        
        const printWindow = window.open('', '_blank');
        
        const sessionsHTML = sessions.map((session, index) => `
            <tr${index % 2 === 1 ? ' style="background-color: #f9f9f9;"' : ''}>
                <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">${index + 1}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">${new Date(session.attendance_date).toLocaleDateString()}</td>
                <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">${session.total_students}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">${new Date(session.session_start).toLocaleTimeString()}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">${new Date(session.session_end).toLocaleTimeString()}</td>
            </tr>
        `).join('');
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Course Report - ${stats.course.course_code}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                        .header { text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
                        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
                        .stat-card { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 20px; border-radius: 8px; text-align: center; }
                        .stat-card .value { font-size: 2.5em; font-weight: bold; color: #fbbf24; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; padding: 15px; }
                        @media print { body { margin: 0; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>🏫 School Attendance System</h1>
                        <h2>📚 Course Report</h2>
                        <h3>${stats.course.course_code} - ${stats.course.course_title}</h3>
                        <p>Generated: ${new Date().toLocaleString()}</p>
                    </div>
                    
                    <div class="stats-grid">
                        <div class="stat-card">
                            <h4>📅 Sessions</h4>
                            <p class="value">${stats.statistics.total_sessions || 0}</p>
                        </div>
                        <div class="stat-card">
                            <h4>👥 Students</h4>
                            <p class="value">${stats.statistics.unique_students || 0}</p>
                        </div>
                        <div class="stat-card">
                            <h4>📊 Records</h4>
                            <p class="value">${stats.statistics.total_attendance_records || 0}</p>
                        </div>
                    </div>
                    
                    <h3>📋 Session History</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Date</th>
                                <th>Present</th>
                                <th>Start</th>
                                <th>End</th>
                            </tr>
                        </thead>
                        <tbody>${sessionsHTML}</tbody>
                    </table>
                    
                    <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 20px;">
                        <p>Report for ${stats.course.course_code}</p>
                        <p>Period: ${stats.statistics.first_session ? new Date(stats.statistics.first_session).toLocaleDateString() : 'N/A'} - ${stats.statistics.latest_session ? new Date(stats.statistics.latest_session).toLocaleDateString() : 'N/A'}</p>
                        <p>Generated: ${new Date().toLocaleString()}</p>
                    </div>
                </body>
            </html>
        `);
        
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
        
    } catch (error) {
        alert(`Print failed: ${error.message}`);
    }
}

// ============================================
// INITIALIZATION & LOGOUT
// ============================================

function logout() {
    localStorage.removeItem('attendanceUser');
    currentUser = { type: null, token: null, info: {} };
    clearFaceScan();
    navigate('auth');
}

function init() {
    const storedUser = localStorage.getItem('attendanceUser');
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            if (currentUser.type === 'student') {
                document.getElementById('studentWelcome').textContent = `Welcome, ${currentUser.info.name}!`;
                navigate('student');
            } else if (currentUser.type === 'lecturer') {
                document.getElementById('lecturerWelcome').textContent = `Welcome, ${currentUser.info.name}!`;
                loadLecturerData();
                navigate('lecturer');
            } else if(currentUser.type === 'admin') {
                navigate('admin');
            } else {
                logout();
            }
        } catch (e) {
            logout();
        }
    } else {
        navigate('auth');
    }
    switchAuthMode('login');
}

init();