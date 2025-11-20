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
// CAMERA FUNCTIONS - MOBILE OPTIMIZED
// ============================================

async function startCamera(videoElementId) {
    stopCamera();
    const videoPreview = document.getElementById(videoElementId);
    const statusElementId = videoElementId.includes('login') ? 'loginScanStatus' : 'registerScanStatus';
    
    videoPreview.style.display = 'block';
    
    try {
        displayMessage(statusElementId, '📷 Starting camera...', false);
        
        // FIX 2: Simplified constraints for mobile compatibility
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: { ideal: 'user' }
                // Removed width/height constraints - let browser decide
            }
        });
        
        videoPreview.srcObject = videoStream;
        
        // FIX 1: Wait for video dimensions to be ready (critical for mobile)
        await new Promise((resolve) => {
            if (videoPreview.videoWidth > 0 && videoPreview.videoHeight > 0) {
                console.log('Video dimensions ready immediately:', videoPreview.videoWidth, 'x', videoPreview.videoHeight);
                videoPreview.play();
                resolve();
            } else {
                videoPreview.onloadedmetadata = () => {
                    console.log('Video metadata loaded:', videoPreview.videoWidth, 'x', videoPreview.videoHeight);
                    videoPreview.play();
                    
                    // Extra safety: wait for actual dimensions
                    const checkDimensions = setInterval(() => {
                        if (videoPreview.videoWidth > 0 && videoPreview.videoHeight > 0) {
                            clearInterval(checkDimensions);
                            resolve();
                        }
                    }, 100);
                    
                    // Timeout after 5 seconds
                    setTimeout(() => {
                        clearInterval(checkDimensions);
                        if (videoPreview.videoWidth > 0) resolve();
                    }, 5000);
                };
            }
        });
        
        displayMessage(statusElementId, '✅ Camera ready! Position your face.', false);
        
        // FIX 3: Delay lighting indicator until video is actually playing
        videoPreview.onplay = () => {
            console.log('Video playing, starting lighting indicator in 2.5s');
            setTimeout(() => {
                showLightingIndicator(videoElementId);
            }, 2500); // Wait 2.5 seconds for first frame
        };
        
        // Fallback if onplay doesn't fire
        setTimeout(() => {
            if (videoPreview.readyState >= 2) { // HAVE_CURRENT_DATA
                showLightingIndicator(videoElementId);
            }
        }, 3000);
        
    } catch (err) {
        console.error("Camera Error:", err);
        // FIX 4: Clear error message for mobile
        const errorMsg = videoElementId.includes('login') ? 'loginError' : 'registerError';
        
        let userMessage = 'Camera access failed. ';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            userMessage += 'Please grant camera permission in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            userMessage += 'No camera found on this device.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            userMessage += 'Camera is being used by another app. Close other apps and try again.';
        } else {
            userMessage += 'Ensure you are using HTTPS and have granted permissions.';
        }
        
        displayMessage(errorMsg, userMessage);
        alert(userMessage + '\n\nTip: Try in Incognito mode or clear site permissions.');
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
    
    // Safety check: ensure video has valid dimensions
    if (!videoPreview || videoPreview.videoWidth === 0 || videoPreview.videoHeight === 0) {
        console.warn('Video dimensions not ready, skipping lighting indicator');
        return;
    }
    
    console.log('Starting lighting indicator with video:', videoPreview.videoWidth, 'x', videoPreview.videoHeight);
    
    const existingIndicator = document.getElementById('lightingIndicator');
    if (existingIndicator) existingIndicator.remove();
    
    const lightingIndicator = document.createElement('div');
    lightingIndicator.id = 'lightingIndicator';
    lightingIndicator.style.cssText = `
        position: absolute; top: 10px; left: 10px; padding: 10px 15px;
        background: rgba(0, 0, 0, 0.85); color: white; border-radius: 5px;
        font-size: 13px; z-index: 1000; font-weight: bold;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    `;
    
    const videoContainer = videoPreview.parentElement;
    if (!videoContainer.style.position || videoContainer.style.position === 'static') {
        videoContainer.style.position = 'relative';
    }
    videoContainer.appendChild(lightingIndicator);
    
    let consecutiveNoFace = 0;
    let lastDetectionAttempt = 0;
    let checkCount = 0;
    
    const checkLighting = setInterval(async () => {
        if (!videoStream) {
            clearInterval(checkLighting);
            if (lightingIndicator && lightingIndicator.parentElement) {
                lightingIndicator.remove();
            }
            return;
        }
        
        checkCount++;
        
        // FIX 1: Ensure dimensions are valid before processing
        if (videoPreview.videoWidth === 0 || videoPreview.videoHeight === 0) {
            console.warn(`Check ${checkCount}: Video dimensions still 0, waiting...`);
            if (checkCount > 10) {
                clearInterval(checkLighting);
                lightingIndicator.textContent = '⚠️ Camera loading issue';
            }
            return;
        }
        
        const tempCanvas = document.createElement('canvas');
        const context = tempCanvas.getContext('2d');
        tempCanvas.width = videoPreview.videoWidth;
        tempCanvas.height = videoPreview.videoHeight;
        
        try {
            context.drawImage(videoPreview, 0, 0);
            const imageData = context.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;
            
            let totalBrightness = 0;
            for (let i = 0; i < data.length; i += 4) {
                totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
            }
            const avgBrightness = totalBrightness / (data.length / 4);
            
            // Face detection - only run every 3 seconds
            let faceDetected = true; // Default optimistic
            const now = Date.now();
            
            if (faceApiLoaded && (now - lastDetectionAttempt > 3000)) {
                lastDetectionAttempt = now;
                try {
                    const detection = await faceapi.detectSingleFace(
                        videoPreview,
                        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.05 })
                    );
                    faceDetected = !!detection;
                    
                    if (faceDetected) {
                        consecutiveNoFace = 0;
                    } else {
                        consecutiveNoFace++;
                    }
                    
                    console.log(`Face detection: ${faceDetected ? 'found' : 'not found'}, consecutive fails: ${consecutiveNoFace}`);
                } catch (err) {
                    faceDetected = true; // Optimistic on error
                    consecutiveNoFace = 0;
                }
            }
            
            // Determine message based on brightness and face detection
            let message, color;
            
            if (avgBrightness < 40) {
                message = "🔴 Too Dark - Add light";
                color = "#ef4444";
            } else if (avgBrightness < 80) {
                message = "🟡 Low Light - OK to capture";
                color = "#f59e0b";
            } else if (avgBrightness > 230) { // FIX 5: Increased from 200 to 230
                message = "⚠️ Too Bright - Reduce light";
                color = "#f59e0b";
            } else {
                // Only show face warning after many consecutive failures
                if (!faceDetected && consecutiveNoFace >= 5) {
                    message = "⚠️ Ensure face visible";
                    color = "#f59e0b";
                } else {
                    message = "🟢 Ready - Tap Capture";
                    color = "#10b981";
                }
            }
            
            if (lightingIndicator && lightingIndicator.parentElement) {
                lightingIndicator.textContent = message;
                lightingIndicator.style.background = color;
            }
            
        } catch (drawError) {
            console.error('Error drawing video frame:', drawError);
        }
        
    }, 2000); // Check every 2 seconds
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

        displayMessage(statusElementId, "🔍 Checking quality...", false);
        
        // MOBILE-FRIENDLY: Be very lenient with face detection during capture
        if (faceApiLoaded) {
            try {
                const imageUrl = URL.createObjectURL(blob);
                const img = new Image();
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error('Image load failed'));
                    img.src = imageUrl;
                });
                
                // Try VERY lenient thresholds - critical for mobile
                const confidenceLevels = [0.3, 0.2, 0.1, 0.05, 0.03, 0.01];
                let testDetection = null;
                
                for (const minConfidence of confidenceLevels) {
                    testDetection = await faceapi.detectSingleFace(
                        img, 
                        new faceapi.SsdMobilenetv1Options({ minConfidence })
                    );
                    if (testDetection) {
                        console.log(`Mobile: Face detected at ${minConfidence} confidence`);
                        break;
                    }
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
                    // MOBILE FIX: Don't reject, just warn
                    console.warn('Face detection uncertain on mobile, but accepting');
                    faceScanBlob = blob;
                    displayMessage(statusElementId, 
                        "✅ Captured! Face will be verified during login.", 
                        false);
                    stopCamera();
                }
                
            } catch (error) {
                console.error('Detection error on mobile:', error);
                // ALWAYS accept on mobile errors
                faceScanBlob = blob;
                displayMessage(statusElementId, 
                    "✅ Captured successfully!", 
                    false);
                stopCamera();
            }
        } else {
            faceScanBlob = blob;
            displayMessage(statusElementId, "✅ Captured!", false);
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


// STRICTER FACIAL RECOGNITION THRESHOLDS
// Replace the validateFaceMatch function in auth.js (around line 1100)
// This makes it MUCH harder for siblings/similar faces to login
// ============================================

async function validateFaceMatch(registered, live, matNo) {
    try {
        // STRICTER THRESHOLDS - Makes it harder for similar faces to match
        const MINIMUM_THRESHOLD = 0.60;       // 40% HARD minimum (was 75% = 25%)
        const LAPTOP_TO_MOBILE = 0.50;        // 50% (was 65% = 35%) 
        const MOBILE_THRESHOLD = 0.45;        // 55% (was 60% = 40%)
        const CROSSDEVICE_THRESHOLD = 0.40;   // 60% (was 55% = 45%)
        const STANDARD_THRESHOLD = 0.35;      // 65% (was 50% = 50%)

        const distance = faceapi.euclideanDistance(registered.descriptor, live.descriptor);
        const similarity = ((1 - distance) * 100).toFixed(1);
        
        console.log(`=== STRICTER FACE MATCH for ${matNo} ===`);
        console.log(`Similarity: ${similarity}%, Distance: ${distance}`);

        // ABSOLUTE MINIMUM - Blocks truly different people AND siblings
        if (distance > MINIMUM_THRESHOLD) {
            console.log('❌ REJECTED: Below 40% minimum - different person');
            return {
                success: false,
                similarity,
                error: `Verification failed (${similarity}%).\n\nSimilarity too low (required: >40%).\n\nThis appears to be a different person.\n\nIf you are the correct person, re-register with better lighting.`
            };
        }

        // Analyze quality and device factors
        const regBox = registered.detection.box;
        const liveBox = live.detection.box;
        
        const sizeRatio = Math.max(regBox.width, regBox.height) / Math.max(liveBox.width, liveBox.height);
        const areaRatio = (regBox.width * regBox.height) / (liveBox.width * liveBox.height);
        
        const isDifferentDevice = sizeRatio < 0.65 || sizeRatio > 1.55 || areaRatio < 0.5 || areaRatio > 2.0;
        const hasLowConfidence = registered.detection.score < 0.3 || live.detection.score < 0.3;
        const isMobile = liveBox.width < 800 || liveBox.height < 600;
        const isRegisteredLaptop = regBox.width > 800 && regBox.height > 600;
        
        console.log('Device Analysis:', {
            registered: `${regBox.width}x${regBox.height}`,
            live: `${liveBox.width}x${liveBox.height}`,
            sizeRatio: sizeRatio.toFixed(2),
            isDifferentDevice,
            isMobile,
            isRegisteredLaptop
        });
        
        // Determine threshold - STRICTER
        let effectiveThreshold = STANDARD_THRESHOLD;
        let matchType = 'standard';
        
        if (isRegisteredLaptop && isMobile) {
            effectiveThreshold = LAPTOP_TO_MOBILE;
            matchType = 'laptop-to-mobile';
            console.log('📱 LAPTOP→MOBILE: Using 50% threshold (STRICTER)');
        } else if (isMobile && isDifferentDevice) {
            effectiveThreshold = MOBILE_THRESHOLD;
            matchType = 'mobile-cross-device';
            console.log('📱 Mobile cross-device: Using 55% threshold (STRICTER)');
        } else if (isDifferentDevice || hasLowConfidence) {
            effectiveThreshold = CROSSDEVICE_THRESHOLD;
            matchType = 'cross-device';
            console.log('🔄 Cross-device: Using 60% threshold (STRICTER)');
        } else {
            console.log('💻 Standard match: Using 65% threshold (STRICTER)');
        }

        // Main threshold check - NO BUFFER, NO LENIENCY
        if (distance > effectiveThreshold) {
            console.log(`❌ REJECTED: ${similarity}% below ${matchType} threshold of ${((1-effectiveThreshold)*100).toFixed(0)}%`);
            
            let errorMessage = `Verification failed (${similarity}%).\n\n`;
            errorMessage += `Required: >${((1-effectiveThreshold)*100).toFixed(0)}% for ${matchType}\n\n`;
            errorMessage += `Solutions:\n`;
            errorMessage += `• Improve lighting (face a window)\n`;
            errorMessage += `• Remove glasses/hat if different from registration\n`;
            errorMessage += `• Use the same device you registered on\n`;
            errorMessage += `• Re-register from this device if needed`;
            
            return {
                success: false,
                similarity,
                error: errorMessage
            };
        }

        // MANDATORY STRUCTURAL VALIDATION for ALL matches below 70%
        if (similarity < 70) {
            console.log('🔍 MANDATORY structural validation (similarity < 70%)');
            const structural = await checkFacialStructure(registered, live);
            
            if (!structural.passed) {
                console.log(`❌ REJECTED: Structural validation FAILED - ${structural.reason}`);
                return {
                    success: false,
                    similarity,
                    error: `Facial structure mismatch (${similarity}%).\n\n${structural.reason}\n\nThis may be a different person (possibly sibling/relative).\n\nRe-register if this is you.`
                };
            }
            
            console.log('✅ Structural validation passed');
        }

        console.log(`✅ LOGIN ACCEPTED: ${matNo} at ${similarity}% (${matchType})`);
        return { 
            success: true, 
            similarity, 
            distance,
            matchType 
        };

    } catch (error) {
        console.error('Validation error:', error);
        return { success: false, error: 'System error. Try again.' };
    }
}

// Replace checkFacialStructure function (around line 1250)
async function checkFacialStructure(registered, live) {
    try {
        const regLandmarks = registered.landmarks.positions;
        const liveLandmarks = live.landmarks.positions;
        
        if (!regLandmarks || !liveLandmarks || regLandmarks.length < 68 || liveLandmarks.length < 68) {
            console.warn('Insufficient landmarks');
            return { passed: false, reason: 'Facial features not clear enough' };
        }
        
        const getProportions = (landmarks) => {
            // Eye distance
            const eyeDistance = Math.hypot(
                landmarks[45].x - landmarks[36].x,
                landmarks[45].y - landmarks[36].y
            );
            
            // Face height (nose to chin)
            const faceHeight = Math.hypot(
                landmarks[8].x - landmarks[30].x,
                landmarks[8].y - landmarks[30].y
            );
            
            // Face width (jaw to jaw)
            const faceWidth = Math.hypot(
                landmarks[16].x - landmarks[0].x,
                landmarks[16].y - landmarks[0].y
            );
            
            // Nose width
            const noseWidth = Math.hypot(
                landmarks[35].x - landmarks[31].x,
                landmarks[35].y - landmarks[31].y
            );
            
            return {
                eyeToHeight: eyeDistance / faceHeight,
                widthToHeight: faceWidth / faceHeight,
                noseToEye: noseWidth / eyeDistance
            };
        };
        
        const regProps = getProportions(regLandmarks);
        const liveProps = getProportions(liveLandmarks);
        
        // Calculate proportional differences
        const eyeDiff = Math.abs(regProps.eyeToHeight - liveProps.eyeToHeight) / regProps.eyeToHeight;
        const widthDiff = Math.abs(regProps.widthToHeight - liveProps.widthToHeight) / regProps.widthToHeight;
        const noseDiff = Math.abs(regProps.noseToEye - liveProps.noseToEye) / regProps.noseToEye;
        
        console.log('Structural Analysis:', {
            eyeDiff: (eyeDiff * 100).toFixed(1) + '%',
            widthDiff: (widthDiff * 100).toFixed(1) + '%',
            noseDiff: (noseDiff * 100).toFixed(1) + '%'
        });
        
        // STRICTER: Reduced from 30% to 20% variance (prevents siblings)
        const MAX_VARIANCE = 0.20;  // Was 0.30
        const MAX_NOSE_VARIANCE = 0.25;  // Was 0.35
        
        if (eyeDiff > MAX_VARIANCE) {
            return {
                passed: false,
                reason: `Eye spacing differs by ${(eyeDiff * 100).toFixed(0)}% (max 20%). Likely different person.`
            };
        }
        
        if (widthDiff > MAX_VARIANCE) {
            return {
                passed: false,
                reason: `Face width differs by ${(widthDiff * 100).toFixed(0)}% (max 20%). Likely different person.`
            };
        }
        
        if (noseDiff > MAX_NOSE_VARIANCE) {
            return {
                passed: false,
                reason: `Nose proportions differ by ${(noseDiff * 100).toFixed(0)}% (max 25%). Likely different person.`
            };
        }
        
        console.log('✅ All STRICT structural checks passed');
        return { passed: true };
        
    } catch (error) {
        console.error('Structural check error:', error);
        return { passed: false, reason: 'Could not validate facial structure' };
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

// --- UPDATED: Load Session Details with Export Button ---
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
                    <button class="secondary-btn" onclick="exportSessionAttendance('${courseId}', '${date}', '${courseInfo.course_code}', '${sessionDate}')" style="background: var(--success-color); color: white;">
                        📥 Export Session CSV
                    </button>
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
// ADMIN DASHBOARD FUNCTIONS
// Add these to your auth.js file
// ============================================

let allStudents = [];
let allLecturers = [];
let allCourses = [];

// --- TAB SWITCHING ---

function switchAdminTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.admin-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Load data for the tab
    if (tabName === 'students') {
        loadStudentsData();
    } else if (tabName === 'lecturers') {
        loadLecturersData();
    } else if (tabName === 'courses') {
        loadCoursesData();
    } else if (tabName === 'system') {
        loadSystemHealth();
    }
}

// --- LOAD ADMIN DASHBOARD ---

async function loadAdminDashboard() {
    try {
        // Load overview statistics
        const stats = await apiFetch('/admin/stats', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        document.getElementById('totalStudents').textContent = stats.students;
        document.getElementById('totalLecturers').textContent = stats.lecturers;
        document.getElementById('totalCourses').textContent = stats.courses;
        document.getElementById('totalAttendance').textContent = stats.attendance;
        
        // Load initial tab data
        loadStudentsData();
        
    } catch (error) {
        console.error('Failed to load admin dashboard:', error);
        alert('Failed to load dashboard data');
    }
}

// --- STUDENTS MANAGEMENT ---

async function loadStudentsData() {
    const container = document.getElementById('studentsListContainer');
    container.innerHTML = '<div class="loading">Loading students...</div>';
    
    try {
        const students = await apiFetch('/admin/students', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        allStudents = students;
        displayStudents(students);
        
    } catch (error) {
        container.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
    }
}

function displayStudents(students) {
    const container = document.getElementById('studentsListContainer');
    
    if (students.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <h3>No Students Found</h3>
                <p>No students registered in the system</p>
            </div>
        `;
        return;
    }
    
    const tableHTML = `
        <table class="admin-data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Mat No.</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Attendance</th>
                    <th>Registered</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${students.map((student, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td><strong>${student.mat_no}</strong></td>
                        <td>${student.name}</td>
                        <td>${student.email}</td>
                        <td>${student.phone || 'N/A'}</td>
                        <td>${student.attendance_count} records</td>
                        <td>${new Date(student.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="action-btn view-btn" onclick="viewStudent(${student.id})">View</button>
                            <button class="action-btn delete-btn" onclick="confirmDeleteStudent(${student.id}, '${student.name}')">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = tableHTML;
}

function filterStudents() {
    const searchTerm = document.getElementById('studentSearch').value.toLowerCase();
    const filtered = allStudents.filter(student => 
        student.name.toLowerCase().includes(searchTerm) ||
        student.mat_no.toLowerCase().includes(searchTerm) ||
        student.email.toLowerCase().includes(searchTerm)
    );
    displayStudents(filtered);
}

// --- UPDATED: View Student with Export Button ---
async function viewStudent(studentId) {
    try {
        const data = await apiFetch(`/admin/students/${studentId}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        const student = data.student;
        const attendance = data.recentAttendance;
        
        const modalHTML = `
            <div class="modal active" id="studentModal">
                <div class="modal-content" style="max-width: 700px;">
                    <h3>📋 Student Details</h3>
                    
                    <div class="stats-display">
                        <div class="stat-box">
                            <strong>Total Attendance</strong>
                            <span>${student.total_attendance}</span>
                        </div>
                        <div class="stat-box">
                            <strong>Courses Attended</strong>
                            <span>${student.courses_attended}</span>
                        </div>
                    </div>
                    
                    <div style="margin: 20px 0;">
                        <p><strong>Mat No:</strong> ${student.mat_no}</p>
                        <p><strong>Name:</strong> ${student.name}</p>
                        <p><strong>Email:</strong> ${student.email}</p>
                        <p><strong>Phone:</strong> ${student.phone || 'N/A'}</p>
                        <p><strong>Registered:</strong> ${new Date(student.created_at).toLocaleString()}</p>
                    </div>
                    
                    <h4>Recent Attendance</h4>
                    ${attendance.length > 0 ? `
                        <table class="admin-data-table" style="margin-top: 15px;">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Course</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${attendance.map(record => `
                                    <tr>
                                        <td>${new Date(record.marked_at).toLocaleDateString()}</td>
                                        <td>${record.course_code} - ${record.course_title}</td>
                                        <td>${new Date(record.marked_at).toLocaleTimeString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p>No attendance records yet</p>'}
                    
                    <div class="modal-actions">
                        ${attendance.length > 0 ? `
                            <button class="secondary-btn" onclick="exportStudentAttendanceHistory(${student.id}, '${student.name}')" style="background: var(--success-color); color: white;">
                                📥 Export Attendance History
                            </button>
                        ` : ''}
                        <button class="secondary-btn" onclick="closeModal('studentModal')">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        alert(`Failed to load student details: ${error.message}`);
    }
}


function confirmDeleteStudent(studentId, studentName) {
    showDeleteModal(
        `Are you sure you want to delete student "${studentName}"? This will also delete all their attendance records.`,
        () => deleteStudent(studentId)
    );
}

async function deleteStudent(studentId) {
    try {
        await apiFetch(`/admin/students/${studentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        closeDeleteModal();
        loadStudentsData();
        loadAdminDashboard(); // Refresh stats
        alert('Student deleted successfully');
        
    } catch (error) {
        alert(`Failed to delete student: ${error.message}`);
    }
}

function refreshStudentsList() {
    loadStudentsData();
}

// --- LECTURERS MANAGEMENT ---

async function loadLecturersData() {
    const container = document.getElementById('lecturersListContainer');
    container.innerHTML = '<div class="loading">Loading lecturers...</div>';
    
    try {
        const lecturers = await apiFetch('/admin/lecturers', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        allLecturers = lecturers;
        displayLecturers(lecturers);
        
    } catch (error) {
        container.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
    }
}

function displayLecturers(lecturers) {
    const container = document.getElementById('lecturersListContainer');
    
    if (lecturers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👨‍🏫</div>
                <h3>No Lecturers Found</h3>
                <p>No lecturers registered in the system</p>
            </div>
        `;
        return;
    }
    
    const tableHTML = `
        <table class="admin-data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Lecturer ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Courses</th>
                    <th>Registered</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${lecturers.map((lecturer, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td><strong>${lecturer.lecturer_id}</strong></td>
                        <td>${lecturer.name}</td>
                        <td>${lecturer.email}</td>
                        <td>${lecturer.phone || 'N/A'}</td>
                        <td>${lecturer.course_count} courses</td>
                        <td>${new Date(lecturer.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="action-btn view-btn" onclick="viewLecturer(${lecturer.id})">View</button>
                            <button class="action-btn delete-btn" onclick="confirmDeleteLecturer(${lecturer.id}, '${lecturer.name}')">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = tableHTML;
}

function filterLecturers() {
    const searchTerm = document.getElementById('lecturerSearch').value.toLowerCase();
    const filtered = allLecturers.filter(lecturer => 
        lecturer.name.toLowerCase().includes(searchTerm) ||
        lecturer.lecturer_id.toLowerCase().includes(searchTerm) ||
        lecturer.email.toLowerCase().includes(searchTerm)
    );
    displayLecturers(filtered);
}

// --- UPDATED: View Lecturer with Export Button ---
async function viewLecturer(lecturerId) {
    try {
        const data = await apiFetch(`/admin/lecturers/${lecturerId}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        const lecturer = data.lecturer;
        const courses = data.courses;
        
        const modalHTML = `
            <div class="modal active" id="lecturerModal">
                <div class="modal-content" style="max-width: 700px;">
                    <h3>📋 Lecturer Details</h3>
                    
                    <div class="stats-display">
                        <div class="stat-box">
                            <strong>Total Courses</strong>
                            <span>${lecturer.total_courses}</span>
                        </div>
                    </div>
                    
                    <div style="margin: 20px 0;">
                        <p><strong>Lecturer ID:</strong> ${lecturer.lecturer_id}</p>
                        <p><strong>Name:</strong> ${lecturer.name}</p>
                        <p><strong>Email:</strong> ${lecturer.email}</p>
                        <p><strong>Phone:</strong> ${lecturer.phone || 'N/A'}</p>
                        <p><strong>Registered:</strong> ${new Date(lecturer.created_at).toLocaleString()}</p>
                    </div>
                    
                    <h4>Courses</h4>
                    ${courses.length > 0 ? `
                        <table class="admin-data-table" style="margin-top: 15px;">
                            <thead>
                                <tr>
                                    <th>Course Code</th>
                                    <th>Title</th>
                                    <th>Attendance</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${courses.map(course => `
                                    <tr>
                                        <td><strong>${course.course_code}</strong></td>
                                        <td>${course.course_title}</td>
                                        <td>${course.attendance_count} records</td>
                                        <td>${new Date(course.created_at).toLocaleDateString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p>No courses created yet</p>'}
                    
                    <div class="modal-actions">
                        ${courses.length > 0 ? `
                            <button class="secondary-btn" onclick="exportLecturerAttendance(${lecturer.id}, '${lecturer.name}')" style="background: var(--success-color); color: white;">
                                📥 Export All Attendance
                            </button>
                        ` : ''}
                        <button class="secondary-btn" onclick="closeModal('lecturerModal')">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        alert(`Failed to load lecturer details: ${error.message}`);
    }
}

// --- NEW: Export Lecturer Attendance Function ---
async function exportLecturerAttendance(lecturerId, lecturerName) {
    try {
        const records = await apiFetch(`/admin/export/lecturer-attendance/${lecturerId}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (records.length === 0) {
            alert('No attendance records to export');
            return;
        }
        
        const headers = ['student_name', 'mat_no', 'course_code', 'course_title', 'attendance_date', 'attendance_time'];
        const csvContent = convertToCSV(records, headers);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `${lecturerName.replace(/\s+/g, '_')}_all_attendance_${timestamp}.csv`;
        
        downloadCSV(csvContent, filename);
        alert('Lecturer attendance exported successfully!');
        
    } catch (error) {
        console.error('Export error:', error);
        alert(`Export failed: ${error.message}`);
    }
}
function confirmDeleteLecturer(lecturerId, lecturerName) {
    showDeleteModal(
        `Are you sure you want to delete lecturer "${lecturerName}"? This will also delete all their courses and attendance records.`,
        () => deleteLecturer(lecturerId)
    );
}

async function deleteLecturer(lecturerId) {
    try {
        await apiFetch(`/admin/lecturers/${lecturerId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        closeDeleteModal();
        loadLecturersData();
        loadAdminDashboard(); // Refresh stats
        alert('Lecturer deleted successfully');
        
    } catch (error) {
        alert(`Failed to delete lecturer: ${error.message}`);
    }
}

function refreshLecturersList() {
    loadLecturersData();
}

// --- COURSES MANAGEMENT ---

async function loadCoursesData() {
    const container = document.getElementById('coursesListContainer');
    container.innerHTML = '<div class="loading">Loading courses...</div>';
    
    try {
        const courses = await apiFetch('/admin/courses', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        allCourses = courses;
        displayCourses(courses);
        
    } catch (error) {
        container.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
    }
}

function displayCourses(courses) {
    const container = document.getElementById('coursesListContainer');
    
    if (courses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <h3>No Courses Found</h3>
                <p>No courses created in the system</p>
            </div>
        `;
        return;
    }
    
    const tableHTML = `
        <table class="admin-data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Course Code</th>
                    <th>Title</th>
                    <th>Lecturer</th>
                    <th>Students</th>
                    <th>Attendance</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${courses.map((course, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td><strong>${course.course_code}</strong></td>
                        <td>${course.course_title}</td>
                        <td>${course.lecturer_name}</td>
                        <td>${course.unique_students} students</td>
                        <td>${course.attendance_count} records</td>
                        <td>${new Date(course.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="action-btn view-btn" onclick="viewCourse(${course.id})">View</button>
                            <button class="action-btn delete-btn" onclick="confirmDeleteCourse(${course.id}, '${course.course_code}')">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = tableHTML;
}

function filterCourses() {
    const searchTerm = document.getElementById('courseSearch').value.toLowerCase();
    const filtered = allCourses.filter(course => 
        course.course_code.toLowerCase().includes(searchTerm) ||
        course.course_title.toLowerCase().includes(searchTerm) ||
        course.lecturer_name.toLowerCase().includes(searchTerm)
    );
    displayCourses(filtered);
}

async function viewCourse(courseId) {
    try {
        const data = await apiFetch(`/admin/courses/${courseId}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        const course = data.course;
        const sessions = data.recentSessions;
        
        const modalHTML = `
            <div class="modal active" id="courseModal">
                <div class="modal-content" style="max-width: 700px;">
                    <h3>📋 Course Details</h3>
                    
                    <div class="stats-display">
                        <div class="stat-box">
                            <strong>Total Students</strong>
                            <span>${course.unique_students}</span>
                        </div>
                        <div class="stat-box">
                            <strong>Total Sessions</strong>
                            <span>${course.total_sessions}</span>
                        </div>
                        <div class="stat-box">
                            <strong>Total Records</strong>
                            <span>${course.total_attendance}</span>
                        </div>
                    </div>
                    
                    <div style="margin: 20px 0;">
                        <p><strong>Course Code:</strong> ${course.course_code}</p>
                        <p><strong>Title:</strong> ${course.course_title}</p>
                        <p><strong>Lecturer:</strong> ${course.lecturer_name} (${course.lecturer_email})</p>
                        <p><strong>Created:</strong> ${new Date(course.created_at).toLocaleString()}</p>
                    </div>
                    
                    <h4>Recent Sessions</h4>
                    ${sessions.length > 0 ? `
                        <table class="admin-data-table" style="margin-top: 15px;">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Students Present</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sessions.map(session => `
                                    <tr>
                                        <td>${new Date(session.date).toLocaleDateString()}</td>
                                        <td>${session.student_count} students</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p>No sessions recorded yet</p>'}
                    
                    <div class="modal-actions">
                        <button class="secondary-btn" onclick="exportCourseAttendance(${course.id}, '${course.course_code}')" style="background: var(--success-color); color: white;">
                            📥 Export All Attendance
                        </button>
                        <button class="secondary-btn" onclick="closeModal('courseModal')">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        alert(`Failed to load course details: ${error.message}`);
    }
}

function confirmDeleteCourse(courseId, courseCode) {
    showDeleteModal(
        `Are you sure you want to delete course "${courseCode}"? This will also delete all attendance records for this course.`,
        () => deleteCourse(courseId)
    );
}

async function deleteCourse(courseId) {
    try {
        await apiFetch(`/admin/courses/${courseId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        closeDeleteModal();
        loadCoursesData();
        loadAdminDashboard(); // Refresh stats
        alert('Course deleted successfully');
        
    } catch (error) {
        alert(`Failed to delete course: ${error.message}`);
    }
}

function refreshCoursesList() {
    loadCoursesData();
}

// --- REPORTS ---

async function generateAttendanceReport() {
    const container = document.getElementById('reportResultsContainer');
    container.innerHTML = '<div class="loading">Generating report...</div>';
    
    try {
        const report = await apiFetch('/admin/reports/attendance', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (report.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No attendance data available</p></div>';
            return;
        }
        
        const tableHTML = `
            <h3>📊 Attendance Report</h3>
            <table class="admin-data-table" style="margin-top: 20px;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Course</th>
                        <th>Attendance</th>
                        <th>Unique Students</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.map(row => `
                        <tr>
                            <td>${new Date(row.date).toLocaleDateString()}</td>
                            <td><strong>${row.course_code}</strong> - ${row.course_title}</td>
                            <td>${row.attendance_count} records</td>
                            <td>${row.unique_students} students</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = tableHTML;
        
    } catch (error) {
        container.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
    }
}

async function generateActivityReport() {
    const container = document.getElementById('reportResultsContainer');
    container.innerHTML = '<div class="loading">Generating report...</div>';
    
    try {
        const report = await apiFetch('/admin/reports/activity', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        const activityHTML = `
            <h3>📅 System Activity Report</h3>
            
            <h4 style="margin-top: 30px;">Recent Attendance Codes</h4>
            <table class="admin-data-table">
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Course</th>
                        <th>Lecturer</th>
                        <th>Created</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.codes.map(code => `
                        <tr>
                            <td><strong>${code.code}</strong></td>
                            <td>${code.course_code} - ${code.course_title}</td>
                            <td>${code.lecturer_name}</td>
                            <td>${new Date(code.created_at).toLocaleString()}</td>
                            <td>
                                <span class="badge ${code.status === 'Active' ? 'badge-active' : 'badge-expired'}">
                                    ${code.status}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <h4 style="margin-top: 30px;">Recent Attendance</h4>
            <table class="admin-data-table">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Mat No.</th>
                        <th>Course</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.recentAttendance.map(record => `
                        <tr>
                            <td>${record.student_name}</td>
                            <td>${record.mat_no}</td>
                            <td><strong>${record.course_code}</strong></td>
                            <td>${new Date(record.marked_at).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = activityHTML;
        
    } catch (error) {
        container.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
    }
}



// --- SYSTEM MANAGEMENT ---

async function loadSystemHealth() {
    const container = document.getElementById('systemHealthStatus');
    
    try {
        const health = await apiFetch('/health/db', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        const healthHTML = `
            <div class="system-health-item">
                <span>Database Status</span>
                <span class="health-status status-ok">${health.database}</span>
            </div>
            <div class="system-health-item">
                <span>Server Uptime</span>
                <span>${Math.floor(health.uptime / 60)} minutes</span>
            </div>
            <div class="system-health-item">
                <span>Server Time</span>
                <span>${new Date(health.serverTime).toLocaleString()}</span>
            </div>
        `;
        
        container.innerHTML = healthHTML;
        
    } catch (error) {
        container.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
    }
}

async function testDatabaseConnection() {
    const container = document.getElementById('dbManagementResults');
    container.innerHTML = '<div class="loading">Testing connection...</div>';
    
    try {
        const result = await apiFetch('/health/db', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        container.innerHTML = `
            <div class="success-msg" style="margin-top: 15px;">
                ✅ Database connection successful!<br>
                Server Time: ${new Date(result.serverTime).toLocaleString()}<br>
                DB Time: ${new Date(result.databaseTime).toLocaleString()}
            </div>
        `;
        
    } catch (error) {
        container.innerHTML = `<div class="error-msg">❌ Connection failed: ${error.message}</div>`;
    }
}

async function viewActiveCodes() {
    const container = document.getElementById('dbManagementResults');
    container.innerHTML = '<div class="loading">Loading active codes...</div>';
    
    try {
        const codes = await apiFetch('/admin/system/active-codes', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (codes.length === 0) {
            container.innerHTML = '<div class="success-msg" style="margin-top: 15px;">No active codes at the moment</div>';
            return;
        }
        
        const tableHTML = `
            <h4 style="margin-top: 20px;">🎫 Active Attendance Codes</h4>
            <table class="admin-data-table">
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Course</th>
                        <th>Lecturer</th>
                        <th>Expires</th>
                        <th>Time Left</th>
                    </tr>
                </thead>
                <tbody>
                    ${codes.map(code => {
                        const minutes = Math.floor(code.seconds_remaining / 60);
                        const seconds = code.seconds_remaining % 60;
                        return `
                            <tr>
                                <td><strong>${code.code}</strong></td>
                                <td>${code.course_code} - ${code.course_title}</td>
                                <td>${code.lecturer_name}</td>
                                <td>${new Date(code.expires_at).toLocaleString()}</td>
                                <td>${minutes}m ${seconds}s</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = tableHTML;
        
    } catch (error) {
        container.innerHTML = `<div class="error-msg">Error: ${error.message}</div>`;
    }
}

function confirmClearExpiredCodes() {
    if (confirm('Are you sure you want to clear all expired attendance codes? This action cannot be undone.')) {
        clearExpiredCodes();
    }
}

async function clearExpiredCodes() {
    const container = document.getElementById('dbManagementResults');
    
    try {
        const result = await apiFetch('/admin/system/clear-expired-codes', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        container.innerHTML = `
            <div class="success-msg" style="margin-top: 15px;">
                ✅ ${result.message}<br>
                Deleted ${result.deletedCount} expired codes
            </div>
        `;
        
    } catch (error) {
        container.innerHTML = `<div class="error-msg">Error: ${error.message}</div>`;
    }
}

// --- MODAL HELPERS ---

function showDeleteModal(message, onConfirm) {
    const modal = document.getElementById('deleteModal');
    document.getElementById('deleteModalMessage').textContent = message;
    
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    // Remove old listeners by cloning
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.onclick = onConfirm;
    modal.classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
    }
}

// ============================================
// CSV EXPORT FUNCTIONALITY
// Add these functions to your auth.js file
// ============================================

// --- UTILITY: Convert JSON to CSV ---
function convertToCSV(data, headers) {
    if (!data || data.length === 0) {
        return '';
    }
    
    // Create header row
    const headerRow = headers.join(',');
    
    // Create data rows
    const dataRows = data.map(row => {
        return headers.map(header => {
            let value = row[header] || '';
            
            // Handle dates
            if (value instanceof Date) {
                value = value.toISOString();
            }
            
            // Escape quotes and wrap in quotes if contains comma or quote
            if (typeof value === 'string') {
                value = value.replace(/"/g, '""');
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = `"${value}"`;
                }
            }
            
            return value;
        }).join(',');
    });
    
    return headerRow + '\n' + dataRows.join('\n');
}

// --- UTILITY: Download CSV File ---
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

// ============================================
// ENHANCED CSV EXPORT WITH ADVANCED OPTIONS
// Replace the exportAllData() function in auth.js with this version
// ============================================

async function exportAllData() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'exportModal';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
            <h3>📥 Export Data to CSV</h3>
            
            <div class="export-tabs" style="display: flex; gap: 10px; margin: 20px 0; border-bottom: 2px solid var(--light-bg);">
                <button class="export-tab-btn active" onclick="switchExportTab('basic')">
                    Basic Export
                </button>
                <button class="export-tab-btn" onclick="switchExportTab('advanced')">
                    Advanced Reports
                </button>
                <button class="export-tab-btn" onclick="switchExportTab('custom')">
                    Custom Export
                </button>
            </div>
            
            <!-- BASIC EXPORT TAB -->
            <div id="basicExportTab" class="export-tab-content active">
                <p>Select basic data to export:</p>
                <div style="margin: 25px 0;">
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportStudents" checked class="export-checkbox">
                        <strong>👥 Students</strong> - All student records with attendance counts
                    </label>
                    
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportLecturers" checked class="export-checkbox">
                        <strong>👨‍🏫 Lecturers</strong> - All lecturer records with course counts
                    </label>
                    
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportCourses" checked class="export-checkbox">
                        <strong>📚 Courses</strong> - All courses with statistics
                    </label>
                    
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportAttendance" checked class="export-checkbox">
                        <strong>✅ Attendance Records</strong> - All attendance records (detailed)
                    </label>
                    
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportSummary" checked class="export-checkbox">
                        <strong>📊 Summary Report</strong> - Attendance summary by course and date
                    </label>
                </div>
            </div>
            
            <!-- ADVANCED REPORTS TAB -->
            <div id="advancedExportTab" class="export-tab-content" style="display: none;">
                <p>Export advanced analytics and reports:</p>
                <div style="margin: 25px 0;">
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportStudentStats" class="export-checkbox">
                        <strong>📈 Student Statistics</strong> - Detailed stats per student (attendance, courses, days)
                    </label>
                    
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportCourseStats" class="export-checkbox">
                        <strong>📊 Course Statistics</strong> - Detailed stats per course (students, sessions)
                    </label>
                    
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportDailySummary" class="export-checkbox">
                        <strong>📅 Daily Summary</strong> - Attendance summary by date and course
                    </label>
                    
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportLecturerPerformance" class="export-checkbox">
                        <strong>🎯 Lecturer Performance</strong> - Teaching statistics and metrics
                    </label>
                    
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportCodesHistory" class="export-checkbox">
                        <strong>🎫 Codes History</strong> - All generated attendance codes
                    </label>
                </div>
            </div>
            
            <!-- CUSTOM EXPORT TAB -->
            <div id="customExportTab" class="export-tab-content" style="display: none;">
                <p>Customize your export with filters:</p>
                
                <div style="margin: 20px 0;">
                    <h4>Date Range Filter</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-size: 0.9em;">Start Date:</label>
                            <input type="date" id="exportStartDate" style="width: 100%; padding: 8px;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-size: 0.9em;">End Date:</label>
                            <input type="date" id="exportEndDate" style="width: 100%; padding: 8px;">
                        </div>
                    </div>
                    
                    <h4>Course Filter (Optional)</h4>
                    <select id="exportCourseFilter" style="width: 100%; padding: 10px; margin-bottom: 15px;">
                        <option value="">All Courses</option>
                    </select>
                    
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="exportCustomRange" checked class="export-checkbox">
                        <strong>📊 Export Filtered Data</strong> - Export with applied filters
                    </label>
                </div>
                
                <div style="background: #374151; padding: 15px; border-radius: 8px; margin-top: 15px;">
                    <p style="margin: 0; font-size: 0.9em; color: var(--text-dark);">
                        💡 <strong>Tip:</strong> Leave date fields empty to export all data, or select a course to filter by specific course.
                    </p>
                </div>
            </div>
            
            <!-- PROGRESS SECTION -->
            <div id="exportProgress" class="hidden">
                <div style="background: #374151; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <div id="exportProgressText" style="text-align: center; margin-bottom: 10px; color: var(--text-light);">
                        Preparing export...
                    </div>
                    <div style="background: #1f2937; height: 10px; border-radius: 5px; overflow: hidden;">
                        <div id="exportProgressBar" style="background: linear-gradient(90deg, #4f46e5, #6366f1); height: 100%; width: 0%; transition: width 0.3s;"></div>
                    </div>
                    <div id="exportFilesList" style="margin-top: 15px; font-size: 0.9em; color: var(--text-dark);"></div>
                </div>
            </div>
            
            <div id="exportError" class="error-msg hidden"></div>
            <div id="exportSuccess" class="success-msg hidden"></div>
            
            <div class="modal-actions" style="margin-top: 25px;">
                <button class="secondary-btn" onclick="processEnhancedExport()" id="exportBtn" style="background: var(--primary-color); color: white;">
                    📥 Export Selected Data
                </button>
                <button class="secondary-btn" onclick="closeModal('exportModal')">
                    ❌ Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load courses for filter
    loadCoursesForExport();
    
    // Add CSS for export checkboxes
    const style = document.createElement('style');
    style.textContent = `
        .export-checkbox-label {
            display: flex;
            align-items: flex-start;
            margin: 15px 0;
            padding: 12px;
            background: var(--light-bg);
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .export-checkbox-label:hover {
            background: var(--medium-bg);
        }
        .export-checkbox {
            width: 20px !important;
            height: 20px !important;
            margin-right: 12px !important;
            margin-top: 2px;
            cursor: pointer;
        }
        .export-tab-btn {
            padding: 10px 20px;
            background: var(--light-bg);
            border: none;
            border-bottom: 3px solid transparent;
            cursor: pointer;
            color: var(--text-dark);
            font-weight: 600;
            transition: all 0.2s;
        }
        .export-tab-btn:hover {
            background: var(--medium-bg);
            color: var(--text-light);
        }
        .export-tab-btn.active {
            border-bottom-color: var(--primary-color);
            color: var(--primary-color);
        }
        .export-tab-content {
            display: none;
            animation: fadeIn 0.3s;
        }
        .export-tab-content.active {
            display: block;
        }
    `;
    document.head.appendChild(style);
}

function switchExportTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.export-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active from buttons
    document.querySelectorAll('.export-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}ExportTab`).classList.add('active');
    event.target.classList.add('active');
}

async function loadCoursesForExport() {
    try {
        const courses = await apiFetch('/admin/courses', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        const select = document.getElementById('exportCourseFilter');
        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = `${course.course_code} - ${course.course_title}`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load courses for export:', error);
    }
}

async function processEnhancedExport() {
    // Basic exports
    const exportStudents = document.getElementById('exportStudents')?.checked || false;
    const exportLecturers = document.getElementById('exportLecturers')?.checked || false;
    const exportCourses = document.getElementById('exportCourses')?.checked || false;
    const exportAttendance = document.getElementById('exportAttendance')?.checked || false;
    const exportSummary = document.getElementById('exportSummary')?.checked || false;
    
    // Advanced reports
    const exportStudentStats = document.getElementById('exportStudentStats')?.checked || false;
    const exportCourseStats = document.getElementById('exportCourseStats')?.checked || false;
    const exportDailySummary = document.getElementById('exportDailySummary')?.checked || false;
    const exportLecturerPerformance = document.getElementById('exportLecturerPerformance')?.checked || false;
    const exportCodesHistory = document.getElementById('exportCodesHistory')?.checked || false;
    
    // Custom export
    const exportCustomRange = document.getElementById('exportCustomRange')?.checked || false;
    const startDate = document.getElementById('exportStartDate')?.value || '';
    const endDate = document.getElementById('exportEndDate')?.value || '';
    const courseId = document.getElementById('exportCourseFilter')?.value || '';
    
    const selectedExports = [
        exportStudents, exportLecturers, exportCourses, exportAttendance, exportSummary,
        exportStudentStats, exportCourseStats, exportDailySummary, exportLecturerPerformance,
        exportCodesHistory, exportCustomRange
    ];
    
    if (!selectedExports.some(Boolean)) {
        showExportError('Please select at least one data type to export');
        return;
    }
    
    // Show progress
    document.getElementById('exportProgress').classList.remove('hidden');
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('exportError').classList.add('hidden');
    document.getElementById('exportSuccess').classList.add('hidden');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    let exportCount = 0;
    const totalExports = selectedExports.filter(Boolean).length;
    const exportedFiles = [];
    
    try {
        // Basic Exports
        if (exportStudents) {
            updateExportProgress(`Exporting students... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportStudentsCSV(timestamp);
            exportedFiles.push('✅ students.csv');
            updateFilesList(exportedFiles);
        }
        
        if (exportLecturers) {
            updateExportProgress(`Exporting lecturers... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportLecturersCSV(timestamp);
            exportedFiles.push('✅ lecturers.csv');
            updateFilesList(exportedFiles);
        }
        
        if (exportCourses) {
            updateExportProgress(`Exporting courses... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportCoursesCSV(timestamp);
            exportedFiles.push('✅ courses.csv');
            updateFilesList(exportedFiles);
        }
        
        if (exportAttendance) {
            updateExportProgress(`Exporting attendance records... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportAttendanceRecordsCSV(timestamp);
            exportedFiles.push('✅ attendance_records.csv');
            updateFilesList(exportedFiles);
        }
        
        if (exportSummary) {
            updateExportProgress(`Exporting summary report... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportSummaryReportCSV(timestamp);
            exportedFiles.push('✅ attendance_summary.csv');
            updateFilesList(exportedFiles);
        }
        
        // Advanced Reports
        if (exportStudentStats) {
            updateExportProgress(`Exporting student statistics... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportStudentStatsCSV(timestamp);
            exportedFiles.push('✅ student_statistics.csv');
            updateFilesList(exportedFiles);
        }
        
        if (exportCourseStats) {
            updateExportProgress(`Exporting course statistics... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportCourseStatsCSV(timestamp);
            exportedFiles.push('✅ course_statistics.csv');
            updateFilesList(exportedFiles);
        }
        
        if (exportDailySummary) {
            updateExportProgress(`Exporting daily summary... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportDailySummaryCSV(timestamp);
            exportedFiles.push('✅ daily_summary.csv');
            updateFilesList(exportedFiles);
        }
        
        if (exportLecturerPerformance) {
            updateExportProgress(`Exporting lecturer performance... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportLecturerPerformanceCSV(timestamp);
            exportedFiles.push('✅ lecturer_performance.csv');
            updateFilesList(exportedFiles);
        }
        
        if (exportCodesHistory) {
            updateExportProgress(`Exporting codes history... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportCodesHistoryCSV(timestamp);
            exportedFiles.push('✅ codes_history.csv');
            updateFilesList(exportedFiles);
        }
        
        // Custom Range Export
        if (exportCustomRange) {
            updateExportProgress(`Exporting custom filtered data... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportCustomRangeCSV(timestamp, startDate, endDate, courseId);
            exportedFiles.push('✅ custom_filtered_data.csv');
            updateFilesList(exportedFiles);
        }
        
        updateExportProgress('✅ Export complete!', 100);
        document.getElementById('exportSuccess').textContent = `🎉 Successfully exported ${exportCount} file(s)!`;
        document.getElementById('exportSuccess').classList.remove('hidden');
        document.getElementById('exportBtn').disabled = false;
        document.getElementById('exportBtn').textContent = '✅ Export Complete';
        
        setTimeout(() => {
            closeModal('exportModal');
        }, 3000);
        
    } catch (error) {
        console.error('Export error:', error);
        showExportError(`Export failed: ${error.message}`);
        document.getElementById('exportBtn').disabled = false;
    }
}

function updateFilesList(files) {
    const container = document.getElementById('exportFilesList');
    container.innerHTML = '<strong>Downloaded files:</strong><br>' + files.join('<br>');
}

// Advanced export functions
async function exportStudentStatsCSV(timestamp) {
    const stats = await apiFetch('/admin/export/student-stats', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    const headers = ['id', 'mat_no', 'name', 'email', 'phone', 'total_attendance', 'courses_attended', 'days_attended', 'first_attendance', 'last_attendance', 'registration_date'];
    const csvContent = convertToCSV(stats, headers);
    downloadCSV(csvContent, `student_statistics_${timestamp}.csv`);
}

async function exportCourseStatsCSV(timestamp) {
    const stats = await apiFetch('/admin/export/course-stats', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    const headers = ['id', 'course_code', 'course_title', 'lecturer_name', 'lecturer_id', 'lecturer_email', 'unique_students', 'total_attendance', 'total_sessions', 'first_session', 'last_session', 'course_created'];
    const csvContent = convertToCSV(stats, headers);
    downloadCSV(csvContent, `course_statistics_${timestamp}.csv`);
}

async function exportDailySummaryCSV(timestamp) {
    const summary = await apiFetch('/admin/export/daily-summary', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    const headers = ['date', 'course_code', 'course_title', 'lecturer_name', 'attendance_count', 'unique_students', 'first_marked', 'last_marked'];
    const csvContent = convertToCSV(summary, headers);
    downloadCSV(csvContent, `daily_summary_${timestamp}.csv`);
}

async function exportLecturerPerformanceCSV(timestamp) {
    const performance = await apiFetch('/admin/export/lecturer-performance', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    const headers = ['id', 'lecturer_id', 'lecturer_name', 'email', 'total_courses', 'total_students_taught', 'total_attendance_records', 'total_sessions_held', 'first_session', 'last_session', 'joined_date'];
    const csvContent = convertToCSV(performance, headers);
    downloadCSV(csvContent, `lecturer_performance_${timestamp}.csv`);
}

async function exportCodesHistoryCSV(timestamp) {
    const codes = await apiFetch('/admin/export/codes-history', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    const headers = ['id', 'code', 'course_code', 'course_title', 'lecturer_name', 'generated_at', 'expires_at', 'status', 'validity_minutes', 'students_marked'];
    const csvContent = convertToCSV(codes, headers);
    downloadCSV(csvContent, `codes_history_${timestamp}.csv`);
}

async function exportCustomRangeCSV(timestamp, startDate, endDate, courseId) {
    let url = '/admin/export/attendance-range?';
    if (startDate) url += `startDate=${startDate}&`;
    if (endDate) url += `endDate=${endDate}&`;
    if (courseId) url += `courseId=${courseId}`;
    
    const records = await apiFetch(url, {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    
    const headers = ['id', 'student_name', 'mat_no', 'course_code', 'course_title', 'lecturer_name', 'marked_at', 'attendance_date', 'attendance_time'];
    const csvContent = convertToCSV(records, headers);
    
    let filename = `custom_export_${timestamp}`;
    if (startDate && endDate) filename += `_${startDate}_to_${endDate}`;
    downloadCSV(csvContent, `${filename}.csv`);
}
// --- PROCESS EXPORT ---
async function processExport() {
    const exportStudents = document.getElementById('exportStudents').checked;
    const exportLecturers = document.getElementById('exportLecturers').checked;
    const exportCourses = document.getElementById('exportCourses').checked;
    const exportAttendance = document.getElementById('exportAttendance').checked;
    const exportSummary = document.getElementById('exportSummary').checked;
    
    if (!exportStudents && !exportLecturers && !exportCourses && !exportAttendance && !exportSummary) {
        showExportError('Please select at least one data type to export');
        return;
    }
    
    // Show progress
    document.getElementById('exportProgress').classList.remove('hidden');
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('exportError').classList.add('hidden');
    document.getElementById('exportSuccess').classList.add('hidden');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    let exportCount = 0;
    const totalExports = [exportStudents, exportLecturers, exportCourses, exportAttendance, exportSummary].filter(Boolean).length;
    
    try {
        // Export Students
        if (exportStudents) {
            updateExportProgress(`Exporting students... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportStudentsCSV(timestamp);
        }
        
        // Export Lecturers
        if (exportLecturers) {
            updateExportProgress(`Exporting lecturers... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportLecturersCSV(timestamp);
        }
        
        // Export Courses
        if (exportCourses) {
            updateExportProgress(`Exporting courses... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportCoursesCSV(timestamp);
        }
        
        // Export Attendance Records
        if (exportAttendance) {
            updateExportProgress(`Exporting attendance records... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportAttendanceRecordsCSV(timestamp);
        }
        
        // Export Summary
        if (exportSummary) {
            updateExportProgress(`Exporting summary report... (${++exportCount}/${totalExports})`, (exportCount / totalExports) * 100);
            await exportSummaryReportCSV(timestamp);
        }
        
        updateExportProgress('✅ Export complete!', 100);
        document.getElementById('exportSuccess').textContent = `Successfully exported ${exportCount} file(s)!`;
        document.getElementById('exportSuccess').classList.remove('hidden');
        document.getElementById('exportBtn').disabled = false;
        
        setTimeout(() => {
            closeModal('exportModal');
        }, 2000);
        
    } catch (error) {
        console.error('Export error:', error);
        showExportError(`Export failed: ${error.message}`);
        document.getElementById('exportBtn').disabled = false;
    }
}

function updateExportProgress(text, percent) {
    document.getElementById('exportProgressText').textContent = text;
    document.getElementById('exportProgressBar').style.width = `${percent}%`;
}

function showExportError(message) {
    const errorEl = document.getElementById('exportError');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

// --- EXPORT STUDENTS TO CSV ---
async function exportStudentsCSV(timestamp) {
    const students = await apiFetch('/admin/students', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    
    const headers = ['id', 'mat_no', 'name', 'email', 'phone', 'attendance_count', 'created_at'];
    const csvContent = convertToCSV(students, headers);
    downloadCSV(csvContent, `students_${timestamp}.csv`);
}

// --- EXPORT LECTURERS TO CSV ---
async function exportLecturersCSV(timestamp) {
    const lecturers = await apiFetch('/admin/lecturers', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    
    const headers = ['id', 'lecturer_id', 'name', 'email', 'phone', 'course_count', 'created_at'];
    const csvContent = convertToCSV(lecturers, headers);
    downloadCSV(csvContent, `lecturers_${timestamp}.csv`);
}

// --- EXPORT COURSES TO CSV ---
async function exportCoursesCSV(timestamp) {
    const courses = await apiFetch('/admin/courses', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    
    const headers = ['id', 'course_code', 'course_title', 'lecturer_name', 'lecturer_id', 'unique_students', 'attendance_count', 'created_at'];
    const csvContent = convertToCSV(courses, headers);
    downloadCSV(csvContent, `courses_${timestamp}.csv`);
}

// --- EXPORT ATTENDANCE RECORDS TO CSV ---
async function exportAttendanceRecordsCSV(timestamp) {
    // Use the attendance report endpoint with no filters to get all records
    const records = await apiFetch('/admin/export/attendance-records', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    
    const headers = ['id', 'student_name', 'mat_no', 'course_code', 'course_title', 'lecturer_name', 'marked_at', 'attendance_date', 'attendance_time'];
    const csvContent = convertToCSV(records, headers);
    downloadCSV(csvContent, `attendance_records_${timestamp}.csv`);
}

// --- EXPORT SUMMARY REPORT TO CSV ---
async function exportSummaryReportCSV(timestamp) {
    const summary = await apiFetch('/admin/reports/attendance', {
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    
    const headers = ['date', 'course_code', 'course_title', 'attendance_count', 'unique_students'];
    const csvContent = convertToCSV(summary, headers);
    downloadCSV(csvContent, `attendance_summary_${timestamp}.csv`);
}

// --- EXPORT INDIVIDUAL COURSE ---
// ============================================
// FIXED EXPORT FUNCTIONS WITH ADMIN ACCESS
// Replace these functions in your auth.js
// ============================================

// --- EXPORT INDIVIDUAL COURSE (FIXED FOR ADMIN) ---
async function exportCourseAttendance(courseId, courseName) {
    try {
        // Use the admin endpoint instead of the lecturer endpoint
        const records = await apiFetch(`/admin/export/course-attendance/${courseId}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (records.length === 0) {
            alert('No attendance records to export');
            return;
        }
        
        const headers = ['student_name', 'mat_no', 'attendance_date', 'attendance_time', 'course_code', 'course_title'];
        const csvContent = convertToCSV(records, headers);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `${courseName.replace(/\s+/g, '_')}_attendance_${timestamp}.csv`;
        
        downloadCSV(csvContent, filename);
        alert('Export successful!');
        
    } catch (error) {
        console.error('Export error:', error);
        alert(`Export failed: ${error.message}`);
    }
}

// --- EXPORT STUDENT ATTENDANCE HISTORY (ALREADY CORRECT - ADMIN ENDPOINT) ---
async function exportStudentAttendanceHistory(studentId, studentName) {
    try {
        const data = await apiFetch(`/admin/students/${studentId}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (data.recentAttendance.length === 0) {
            alert('No attendance records to export');
            return;
        }
        
        const headers = ['marked_at', 'course_code', 'course_title'];
        const csvContent = convertToCSV(data.recentAttendance, headers);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `${studentName.replace(/\s+/g, '_')}_attendance_${timestamp}.csv`;
        
        downloadCSV(csvContent, filename);
        alert('Export successful!');
        
    } catch (error) {
        alert(`Export failed: ${error.message}`);
    }
}

// --- ADD EXPORT SESSION ATTENDANCE (NEW FUNCTION) ---
async function exportSessionAttendance(courseId, date, courseName, formattedDate) {
    try {
        const records = await apiFetch(`/admin/export/session-attendance/${courseId}/${date}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (records.length === 0) {
            alert('No attendance records for this session');
            return;
        }
        
        const headers = ['student_name', 'mat_no', 'attendance_time', 'course_code', 'course_title'];
        const csvContent = convertToCSV(records, headers);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `${courseName.replace(/\s+/g, '_')}_${formattedDate}_attendance_${timestamp}.csv`;
        
        downloadCSV(csvContent, filename);
        alert('Session attendance exported successfully!');
        
    } catch (error) {
        console.error('Export error:', error);
        alert(`Export failed: ${error.message}`);
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
            } else if (currentUser.type === 'admin') {
    loadAdminDashboard();
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