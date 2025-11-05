 // Enhanced JavaScript for organized attendance reports
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

        // Utility Functions
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
                if (el.textContent.includes('Face Captured')) {
                    el.textContent = '';
                }
            });
        }

        // Authentication Functions
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
            switchUserType(activeForm.querySelector('.tab-btn'));
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
                
                if (isVisible) {
                    fieldSet.classList.remove('hidden');
                } else {
                    fieldSet.classList.add('hidden');
                }
                
                fieldSet.querySelectorAll('input, select').forEach(input => {
                    if (isVisible) {
                        input.required = true;
                        input.disabled = false;
                    } else {
                        input.required = false;
                        input.disabled = true;
                        input.value = '';
                    }
                });
            });
        }

      // 3. UPDATED: Start camera with better video constraints
async function startCamera(videoElementId) {
    stopCamera();
    const videoPreview = document.getElementById(videoElementId);
    const statusElementId = videoElementId.includes('login') ? 'loginScanStatus' : 'registerScanStatus';
    
    videoPreview.style.display = 'block';
    
    try {
        displayMessage(statusElementId, '📷 Starting camera...', false);
        
        // Request higher resolution and better lighting optimization
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
                facingMode: 'user'
            }
        });
        
        videoPreview.srcObject = videoStream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            videoPreview.onloadedmetadata = () => {
                videoPreview.play();
                resolve();
            };
        });
        
        displayMessage(statusElementId, '✅ Camera ready! Position your face in the center.', false);
        
        // Show lighting quality indicator after camera starts
        setTimeout(() => {
            showLightingTips(videoElementId);
        }, 1000);
        
    } catch (err) {
        console.error("Camera Error:", err);
        const errorMsg = videoElementId.includes('login') ? 'loginError' : 'registerError';
        displayMessage(errorMsg, 'Could not access camera. Please grant permission and try again.');
    }
}

// Helper function to stop camera (add this if not in your auth.js)
function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    // Hide video elements
    document.getElementById('video-preview-login').style.display = 'none';
    document.getElementById('video-preview-register').style.display = 'none';
    
    // Remove lighting indicator
    const lightingIndicator = document.getElementById('lightingIndicator');
    if (lightingIndicator && lightingIndicator.parentElement) {
        lightingIndicator.remove();
    }
}


// 4. UPDATED: Show lighting quality indicator (less strict for dark conditions)
function showLightingTips(videoElementId) {
    const videoPreview = document.getElementById(videoElementId);
    const statusElementId = videoElementId.includes('login') ? 'loginScanStatus' : 'registerScanStatus';
    
    // Remove existing indicator if any
    const existingIndicator = document.getElementById('lightingIndicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Create lighting indicator
    const lightingIndicator = document.createElement('div');
    lightingIndicator.id = 'lightingIndicator';
    lightingIndicator.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        padding: 10px 15px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border-radius: 5px;
        font-size: 13px;
        z-index: 1000;
        font-weight: bold;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    `;
    
    const videoContainer = videoPreview.parentElement;
    if (!videoContainer.style.position || videoContainer.style.position === 'static') {
        videoContainer.style.position = 'relative';
    }
    videoContainer.appendChild(lightingIndicator);
    
    let consecutiveNoFace = 0;
    
    // Monitor lighting quality AND face detection (less strict)
    const checkLighting = setInterval(async () => {
        if (!videoStream) {
            clearInterval(checkLighting);
            if (lightingIndicator && lightingIndicator.parentElement) {
                lightingIndicator.remove();
            }
            return;
        }
        
        // Create temporary canvas to analyze lighting
        const tempCanvas = document.createElement('canvas');
        const context = tempCanvas.getContext('2d');
        tempCanvas.width = videoPreview.videoWidth;
        tempCanvas.height = videoPreview.videoHeight;
        
        if (tempCanvas.width === 0) return;
        
        context.drawImage(videoPreview, 0, 0);
        const imageData = context.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        // Calculate brightness
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
            totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (data.length / 4);
        
        // Try to detect face in live video (VERY lenient)
        let faceDetected = false;
        if (faceApiLoaded) {
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
            } catch (err) {
                // Ignore detection errors during monitoring
            }
        }
        
        // Update indicator - ONLY warn after consecutive failures
        let message, color;
        
        if (avgBrightness < 50) {
            message = "🔴 Very Dark - Turn on lights";
            color = "#ef4444";
        } else if (!faceDetected && consecutiveNoFace > 2) {
            // Only show "no face" after multiple consecutive failures
            message = "⚠️ Position face in center";
            color = "#f59e0b";
        } else if (avgBrightness < 80) {
            message = "🟡 Low Light - Image will be enhanced";
            color = "#f59e0b";
        } else if (avgBrightness > 200) {
            message = "🔴 Too Bright - Reduce light";
            color = "#ef4444";
        } else {
            message = "🟢 Ready to Capture";
            color = "#10b981";
        }
        
        if (lightingIndicator && lightingIndicator.parentElement) {
            lightingIndicator.textContent = message;
            lightingIndicator.style.background = color;
        }
        
    }, 1500); // Check every 1.5 seconds (less frequent)
}
// 3. UPDATED: Start camera with better video constraints
async function startCamera(videoElementId) {
    stopCamera();
    const videoPreview = document.getElementById(videoElementId);
    const statusElementId = videoElementId.includes('login') ? 'loginScanStatus' : 'registerScanStatus';
    
    videoPreview.style.display = 'block';
    
    try {
        displayMessage(statusElementId, '📷 Starting camera...', false);
        
        // Request higher resolution and better lighting optimization
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
                facingMode: 'user'
            }
        });
        
        videoPreview.srcObject = videoStream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            videoPreview.onloadedmetadata = () => {
                videoPreview.play();
                resolve();
            };
        });
        
        displayMessage(statusElementId, '✅ Camera ready! Position your face in the center.', false);
        
        // Show lighting quality indicator after camera starts
        setTimeout(() => {
            showLightingTips(videoElementId);
        }, 1000);
        
    } catch (err) {
        console.error("Camera Error:", err);
        const errorMsg = videoElementId.includes('login') ? 'loginError' : 'registerError';
        displayMessage(errorMsg, 'Could not access camera. Please grant permission and try again.');
    }
}

// 5. NEW: Add lighting tips to UI
function displayLightingGuidance(statusElementId) {
    const tips = `
        💡 Lighting Tips:
        • Face a window or light source
        • Avoid backlighting (light behind you)
        • Use indoor lighting if outdoors is too bright
        • Remove glasses or hats if possible
        • Keep face centered in frame
    `;
    
    displayMessage(statusElementId, tips, false);
}

        
        
   // ENHANCED FACE CAPTURE WITH LIGHTING IMPROVEMENTS
// Replace your existing captureFace and related functions with these

// 1. IMPROVED captureFace with VERY lenient detection for poor lighting
async function captureFace(videoElementId, statusElementId) {
    const videoPreview = document.getElementById(videoElementId);
    
    if (!videoStream) {
        displayMessage(statusElementId, "Camera not started. Please start the camera first.", true);
        return;
    }

    // Ensure video is ready and has dimensions
    if (videoPreview.videoWidth === 0 || videoPreview.videoHeight === 0) {
        displayMessage(statusElementId, "Camera is loading. Please wait a moment and try again.", true);
        return;
    }

    displayMessage(statusElementId, "📸 Capturing image...", false);

    const context = captureCanvas.getContext('2d');
    
    // Set canvas size to match video
    const width = Math.max(videoPreview.videoWidth, 640);
    const height = Math.max(videoPreview.videoHeight, 480);
    
    captureCanvas.width = width;
    captureCanvas.height = height;
    
    // Clear canvas first
    context.clearRect(0, 0, width, height);
    
    // Draw video frame
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(videoPreview, 0, 0, width, height);
    
    // CRITICAL: Apply aggressive lighting enhancement
    enhanceLighting(context, width, height);
    
    // Convert to blob with high quality
    captureCanvas.toBlob(async (blob) => {
        if (!blob || blob.size < 1000) {
            displayMessage(statusElementId, "❌ Failed to capture image. Please try again.", true);
            return;
        }

        displayMessage(statusElementId, "🔍 Analyzing image...", false);
        
        // Try face detection but be VERY lenient
        let faceDetected = false;
        
        if (faceApiLoaded) {
            try {
                // Create image from blob for face detection
                const imageUrl = URL.createObjectURL(blob);
                const img = new Image();
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error('Image load failed'));
                    img.src = imageUrl;
                });
                
                console.log('Image loaded for detection:', img.width, 'x', img.height);
                
                // Try VERY lenient detection thresholds
                const confidenceLevels = [0.1, 0.08, 0.05, 0.03, 0.01];
                let testDetection = null;
                
                for (const minConfidence of confidenceLevels) {
                    console.log(`Trying detection with confidence ${minConfidence}...`);
                    
                    testDetection = await faceapi.detectSingleFace(
                        img, 
                        new faceapi.SsdMobilenetv1Options({ minConfidence })
                    );
                    
                    if (testDetection) {
                        console.log(`Face detected with confidence ${minConfidence}:`, testDetection.score);
                        faceDetected = true;
                        break;
                    }
                }
                
                // Clean up
                URL.revokeObjectURL(imageUrl);
                
                if (faceDetected && testDetection) {
                    const quality = testDetection.score;
                    faceScanBlob = blob;
                    
                    displayMessage(statusElementId, 
                        `✅ Face captured! (${(quality * 100).toFixed(1)}% confidence)`, 
                        false);
                    
                    stopCamera();
                } else {
                    // NO REJECTION - Accept anyway with warning
                    console.warn('Face detection failed, but accepting capture anyway');
                    faceScanBlob = blob;
                    
                    displayMessage(statusElementId, 
                        "⚠️ Face detection uncertain. Image captured - please ensure it shows your face clearly. Click again if unsure.", 
                        false);
                    
                    stopCamera();
                }
                
            } catch (error) {
                console.error('Face detection error:', error);
                // ALWAYS accept capture on error
                faceScanBlob = blob;
                displayMessage(statusElementId, 
                    "✓ Image captured (detection skipped due to poor lighting - you can proceed)", 
                    false);
                stopCamera();
            }
        } else {
            // Face API not loaded - accept capture anyway
            faceScanBlob = blob;
            displayMessage(statusElementId, 
                "✓ Image captured (face recognition loading - you can proceed)", 
                false);
            stopCamera();
        }
    }, 'image/jpeg', 0.95);
}


// 2. ENHANCED: Aggressive lighting enhancement for dark environments
function enhanceLighting(context, width, height) {
    // Get image data
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Calculate average brightness
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        totalBrightness += brightness;
    }
    const avgBrightness = totalBrightness / (data.length / 4);
    
    console.log('Original brightness:', avgBrightness);
    
    // AGGRESSIVE brightness adjustment for very dark images
    let adjustment = 0;
    if (avgBrightness < 120) {
        // Very aggressive brightening for dark images
        adjustment = Math.min(150, (120 - avgBrightness) * 1.5);
        console.log('Applying brightness boost:', adjustment);
    } else if (avgBrightness > 180) {
        // Darken if too bright
        adjustment = (180 - avgBrightness) * 0.5;
    }
    
    // Apply brightness adjustment
    if (adjustment !== 0) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, data[i] + adjustment));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + adjustment));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + adjustment));
        }
    }
    
    // Apply stronger contrast for dark images
    const contrast = avgBrightness < 100 ? 1.5 : 1.2;
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
    
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
        data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
        data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
    }
    
    // Apply gamma correction for very dark images
    if (avgBrightness < 80) {
        const gamma = 0.5; // Brighten shadows
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 * Math.pow(data[i] / 255, gamma);
            data[i + 1] = 255 * Math.pow(data[i + 1] / 255, gamma);
            data[i + 2] = 255 * Math.pow(data[i + 2] / 255, gamma);
        }
    }
    
    // Put enhanced image back
    context.putImageData(imageData, 0, 0);
    
    // Log final brightness
    const finalData = context.getImageData(0, 0, width, height).data;
    let finalBrightness = 0;
    for (let i = 0; i < finalData.length; i += 4) {
        finalBrightness += (finalData[i] + finalData[i + 1] + finalData[i + 2]) / 3;
    }
    console.log('Enhanced brightness:', finalBrightness / (finalData.length / 4));
}



// Add this function to test face detection capability
async function testFaceDetectionCapability() {
    console.log('Testing face detection capability...');
    try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 300;
        testCanvas.height = 300;
        const ctx = testCanvas.getContext('2d');
        
        // Draw a simple face-like pattern
        ctx.fillStyle = '#ffdbac';
        ctx.fillRect(50, 50, 200, 250);
        ctx.fillStyle = '#000';
        ctx.fillRect(100, 120, 20, 20); // left eye
        ctx.fillRect(180, 120, 20, 20); // right eye
        ctx.fillRect(140, 180, 20, 40); // nose
        ctx.fillRect(120, 230, 60, 10); // mouth
        
        const faces = await faceapi.detectAllFaces(testCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }));
        console.log('Test detection result:', faces.length > 0 ? 'Working' : 'Not working');
        return faces.length > 0;
    } catch (error) {
        console.error('Face detection test failed:', error);
        return false;
    }
}

// Call this after face-api loads to verify it's working
window.testFaceAPI = testFaceDetectionCapability;
        // API Functions
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
                throw new Error(error.message || 'A network error occurred. Please try again.');
            }
        }

        // Enhanced Lecturer Functions
        async function loadLecturerData() {
            try {
                const courses = await apiFetch('/courses', {
                    headers: { 'Authorization': `Bearer ${currentUser.token}` }
                });
                
                const listEl = document.getElementById('coursesList');
                const selectCodeEl = document.getElementById('courseSelectForCode');
                const selectReportEl = document.getElementById('courseSelectForReport');
                
                listEl.innerHTML = '';
                selectCodeEl.innerHTML = '<option value="">-- Select a Course --</option>';
                selectReportEl.innerHTML = '<option value="">-- Select a Course to View Report --</option>';

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

        // Enhanced Course Selection Handler
        document.getElementById('courseSelectForReport').addEventListener('change', async (e) => {
            const courseId = e.target.value;
            const sessionsContainer = document.getElementById('sessionsContainer');
            const detailsContainer = document.getElementById('attendanceDetailsContainer');
            
            sessionsContainer.innerHTML = '';
            detailsContainer.innerHTML = '';
            
            if (!courseId) return;

            try {
                sessionsContainer.innerHTML = '<div class="loading">Loading attendance sessions...</div>';
                
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
                            <h3>No Attendance Sessions Found</h3>
                            <p>No attendance has been recorded for this course yet.</p>
                        </div>
                    `;
                    return;
                }

                const statsHTML = `
                    <div class="course-stats">
                        <h3>📚 ${stats.course.course_code} - ${stats.course.course_title}</h3>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">Total Sessions</span>
                                <span class="stat-value">${stats.statistics.total_sessions || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Unique Students</span>
                                <span class="stat-value">${stats.statistics.unique_students || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Total Records</span>
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
                                <p><strong>👥 Students Present:</strong> ${session.total_students}</p>
                                <p><strong>⏰ Time Range:</strong> ${sessionStart} - ${sessionEnd}</p>
                            </div>
                            <div class="session-actions">
                                <button class="secondary-btn" onclick="loadSessionDetails('${courseId}', '${session.attendance_date}')">
                                    📋 View Details
                                </button>
                                <button class="secondary-btn" onclick="printSessionReport('${courseId}', '${session.attendance_date}', '${session.course_code}', '${sessionDate}')">
                                    🖨️ Print Session
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                sessionsContainer.innerHTML = statsHTML + '<h3>📊 Attendance Sessions</h3>' + sessionsHTML;
                
            } catch (error) { 
                sessionsContainer.innerHTML = `<div class="error-display">Failed to fetch sessions: ${error.message}</div>`;
            }
        });

        async function loadSessionDetails(courseId, date) {
            const detailsContainer = document.getElementById('attendanceDetailsContainer');
            
            try {
                detailsContainer.innerHTML = '<div class="loading">Loading session details...</div>';
                
                const records = await apiFetch(`/attendance/${courseId}/date/${date}`, {
                    headers: { 'Authorization': `Bearer ${currentUser.token}` }
                });
                
                if (records.length === 0) {
                    detailsContainer.innerHTML = '<div class="no-records"><h3>No records found for this session.</h3></div>';
                    return;
                }
                
                const sessionDate = new Date(date).toLocaleDateString();
                const courseInfo = records[0];
                
                const tableHTML = `
                    <div class="session-details">
                        <div class="session-header">
                            <h3>📋 Attendance Details for ${sessionDate}</h3>
                            <p><strong>Course:</strong> ${courseInfo.course_code} - ${courseInfo.course_title}</p>
                            <p><strong>Total Present:</strong> ${records.length} students</p>
                        </div>
                        
                        <table class="attendance-details-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Student Name</th>
                                    <th>Matriculation No.</th>
                                    <th>Time Marked</th>
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
                                🖨️ Print This Session
                            </button>
                        </div>
                    </div>
                `;
                
                detailsContainer.innerHTML = tableHTML;
                
            } catch (error) {
                detailsContainer.innerHTML = `<div class="error-display">Failed to fetch session details: ${error.message}</div>`;
            }
        }

        async function printSessionReport(courseId, date, courseCode, formattedDate) {
            try {
                const records = await apiFetch(`/attendance/${courseId}/date/${date}`, {
                    headers: { 'Authorization': `Bearer ${currentUser.token}` }
                });
                
                if (records.length === 0) {
                    alert('No records found for this session.');
                    return;
                }
                
                const courseInfo = records[0];
                const printWindow = window.open('', '_blank');
                
                const tableHTML = `
                    <table style="width:100%; border-collapse:collapse; margin-top: 20px;">
                        <thead>
                            <tr style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white;">
                                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">#</th>
                                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Student Name</th>
                                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Matriculation No.</th>
                                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Time Marked</th>
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
                            <title>Attendance Report - ${courseCode} - ${formattedDate}</title>
                            <style>
                                body { 
                                    font-family: Arial, sans-serif; 
                                    margin: 20px; 
                                    color: #333;
                                }
                                .header {
                                    text-align: center;
                                    border-bottom: 3px solid #4f46e5;
                                    padding-bottom: 20px;
                                    margin-bottom: 30px;
                                }
                                .course-info {
                                    margin-bottom: 20px;
                                    background-color: #f8fafc;
                                    padding: 20px;
                                    border-radius: 8px;
                                    border-left: 4px solid #4f46e5;
                                }
                                .summary {
                                    background: linear-gradient(135deg, #4f46e5, #6366f1);
                                    color: white;
                                    padding: 20px;
                                    border-radius: 8px;
                                    margin-bottom: 30px;
                                }
                                .summary h4 {
                                    margin-top: 0;
                                    font-size: 1.2em;
                                }
                                @media print {
                                    body { margin: 0; }
                                    .no-print { display: none; }
                                }
                            </style>
                        </head>
                        <body>
                            <div class="header">
                                <h1>🏫 School Attendance System</h1>
                                <h2>📊 Session Attendance Report</h2>
                            </div>
                            
                            <div class="course-info">
                                <h3>📚 Course: ${courseInfo.course_code} - ${courseInfo.course_title}</h3>
                                <p><strong>📅 Session Date:</strong> ${formattedDate}</p>
                                <p><strong>🕒 Generated On:</strong> ${new Date().toLocaleString()}</p>
                            </div>
                            
                            <div class="summary">
                                <h4>📈 Session Summary</h4>
                                <p><strong>👥 Total Students Present:</strong> ${records.length}</p>
                                <p><strong>⏰ Session Time Range:</strong> ${new Date(records[0].marked_at).toLocaleTimeString()} - ${new Date(records[records.length - 1].marked_at).toLocaleTimeString()}</p>
                            </div>
                            
                            <h4>📋 Detailed Attendance Record</h4>
                            ${tableHTML}
                            
                            <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 20px;">
                                <p>This report was generated automatically by the School Attendance System on ${new Date().toLocaleString()}</p>
                                <p>For questions or concerns, please contact your system administrator.</p>
                            </div>
                        </body>
                    </html>
                `);
                
                printWindow.document.close();
                setTimeout(() => printWindow.print(), 500);
                
            } catch (error) {
                alert(`Failed to generate print report: ${error.message}`);
            }
        }

        async function printCourseReport() {
            const courseId = document.getElementById('courseSelectForReport').value;
            if (!courseId) {
                alert('Please select a course first.');
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
                        <td style="border: 1px solid #ddd; padding: 12px; text-align: center; font-weight: bold;">${index + 1}</td>
                        <td style="border: 1px solid #ddd; padding: 12px;">${new Date(session.attendance_date).toLocaleDateString()}</td>
                        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">${session.total_students}</td>
                        <td style="border: 1px solid #ddd; padding: 12px;">${new Date(session.session_start).toLocaleTimeString()}</td>
                        <td style="border: 1px solid #ddd; padding: 12px;">${new Date(session.session_end).toLocaleTimeString()}</td>
                    </tr>
                `).join('');
                
                printWindow.document.write(`
                    <html>
                        <head>
                            <title>Complete Course Report - ${stats.course.course_code}</title>
                            <style>
                                body { 
                                    font-family: Arial, sans-serif; 
                                    margin: 20px; 
                                    color: #333;
                                }
                                .header { 
                                    text-align: center; 
                                    border-bottom: 3px solid #4f46e5; 
                                    padding-bottom: 20px; 
                                    margin-bottom: 30px; 
                                }
                                .stats-grid { 
                                    display: grid; 
                                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                                    gap: 20px; 
                                    margin: 30px 0; 
                                }
                                .stat-card { 
                                    background: linear-gradient(135deg, #4f46e5, #6366f1);
                                    color: white;
                                    padding: 20px; 
                                    border-radius: 8px; 
                                    text-align: center;
                                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                                }
                                .stat-card h4 {
                                    margin: 0 0 10px 0;
                                    font-size: 1em;
                                    opacity: 0.9;
                                }
                                .stat-card .value {
                                    font-size: 2.5em;
                                    font-weight: bold;
                                    color: #fbbf24;
                                    margin: 0;
                                }
                                table { 
                                    width: 100%; 
                                    border-collapse: collapse; 
                                    margin-top: 20px; 
                                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                                }
                                th { 
                                    background: linear-gradient(135deg, #4f46e5, #6366f1);
                                    color: white;
                                    padding: 15px;
                                    text-align: left;
                                    font-weight: 600;
                                }
                                td {
                                    padding: 12px;
                                    border: 1px solid #ddd;
                                }
                                @media print {
                                    body { margin: 0; }
                                    .no-print { display: none; }
                                }
                            </style>
                        </head>
                        <body>
                            <div class="header">
                                <h1>🏫 School Attendance System</h1>
                                <h2>📚 Complete Course Report</h2>
                                <h3>${stats.course.course_code} - ${stats.course.course_title}</h3>
                                <p style="margin: 10px 0 0 0; color: #666;">Generated on: ${new Date().toLocaleString()}</p>
                            </div>
                            
                            <div class="stats-grid">
                                <div class="stat-card">
                                    <h4>📅 Total Sessions</h4>
                                    <p class="value">${stats.statistics.total_sessions || 0}</p>
                                </div>
                                <div class="stat-card">
                                    <h4>👥 Unique Students</h4>
                                    <p class="value">${stats.statistics.unique_students || 0}</p>
                                </div>
                                <div class="stat-card">
                                    <h4>📊 Total Records</h4>
                                    <p class="value">${stats.statistics.total_attendance_records || 0}</p>
                                </div>
                            </div>
                            
                            <h3 style="margin-top: 40px; color: #4f46e5;">📋 Session History</h3>
                            <table>
                                <thead>
                                    <tr>
                                        <th style="text-align: center;">Session #</th>
                                        <th>Date</th>
                                        <th style="text-align: center;">Students Present</th>
                                        <th>Start Time</th>
                                        <th>End Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${sessionsHTML}
                                </tbody>
                            </table>
                            
                            <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 20px;">
                                <p><strong>Report Summary:</strong> This comprehensive report shows all attendance sessions for ${stats.course.course_code}</p>
                                <p>Period: ${stats.statistics.first_session ? new Date(stats.statistics.first_session).toLocaleDateString() : 'N/A'} - ${stats.statistics.latest_session ? new Date(stats.statistics.latest_session).toLocaleDateString() : 'N/A'}</p>
                                <p>Generated by School Attendance System | ${new Date().toLocaleString()}</p>
                            </div>
                        </body>
                    </html>
                `);
                
                printWindow.document.close();
                setTimeout(() => printWindow.print(), 500);
                
            } catch (error) {
                alert(`Failed to generate course report: ${error.message}`);
            }
        }

        // Registration Handler
       registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    try {
        if (currentUserType === 'student') {
            if (!faceScanBlob) throw new Error('Please capture your face.');
            const formData = new FormData(registerForm);
            formData.append('userType', currentUserType);
            formData.append('faceScan', faceScanBlob, 'face.jpg');
            const response = await fetch(`${API_URL}/register`, { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
                } else if (currentUserType === 'lecturer') {
                    const lecturerSection = registerForm.querySelector('.form-fields[data-for-type="lecturer"]:not(.hidden)');
                    
                    if (!lecturerSection) {
                        throw new Error('Lecturer form section not found or is hidden');
                    }
                    
                    const lecturerInputs = lecturerSection.querySelectorAll('input');
                    const lecturerData = { userType: 'lecturer' };
                    
                    lecturerInputs.forEach(input => {
                        lecturerData[input.name] = input.value;
                    });
                    
                    const requiredFields = ['name', 'lecturer_id', 'email', 'phone', 'password'];
                    const missingFields = requiredFields.filter(field => !lecturerData[field] || lecturerData[field].trim() === '');
                    
                    if (missingFields.length > 0) {
                        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
                    }
                    
                    const response = await fetch(`${API_URL}/register/lecturer`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(lecturerData)
                    });
                    
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message);
                }
                
                displayMessage('registerSuccess', 'Registration successful! Please login.', false);
                clearFaceScan();
                setTimeout(() => switchAuthMode('login'), 2000);
            } catch (error) {
                displayMessage('registerError', error.message);
            }
        });

        // Login Handler
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

async function handleLecturerAdminLogin() {
    const email = loginForm.elements.email.value;
    const password = loginForm.elements.password.value;
    if (!email || !password) throw new Error('Email and Password are required.');
    
    const result = await apiFetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userType: currentUserType, email, password })
    });
    
    loginSuccess(result.token, result.user);
}

// UPDATED handleStudentFaceLogin function with better handling of poor quality registered images
async function handleStudentFaceLogin() {
    if (!faceApiLoaded) throw new Error("Face recognition is still loading. Please wait.");
    if (!faceScanBlob) throw new Error("Please capture your face to log in.");

    const matNo = loginForm.elements.matNo.value;
    if (!matNo) throw new Error("Matriculation Number is required.");

    displayMessage('loginError', 'Verifying face... Please wait.', false);

    try {
        // Step 1: Get the registered face scan data from the server
        const studentData = await apiFetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userType: 'student', matNo })
        });

        if (!studentData.faceScanData) {
            throw new Error("No registered face scan found for this student.");
        }

        displayMessage('loginError', 'Loading registered photo...', false);

        // Step 2: Create images with better error handling
        const registeredImage = await createImageFromBase64(studentData.faceScanData);
        const liveImage = await faceapi.bufferToImage(faceScanBlob);

        displayMessage('loginError', 'Analyzing faces...', false);

        // Step 3: Try VERY lenient detection for both images
        const registeredDetections = await detectFaceWithVeryLowConfidence(registeredImage, 'registered');
        const liveDetections = await detectFaceWithVeryLowConfidence(liveImage, 'live');

        // Handle cases where detection fails
        if (!registeredDetections && !liveDetections) {
            throw new Error("Face detection failed for both images. This usually means:\n\n" +
                "1. Your registered photo is too dark/unclear\n" +
                "2. Current lighting is also poor\n\n" +
                "Solution: Contact admin to re-register with better lighting, or try again in a brighter location.");
        }
        
        if (!registeredDetections) {
            throw new Error("Could not detect face in your registered photo (taken in poor lighting).\n\n" +
                "You need to re-register with a clearer photo. Contact admin or:\n" +
                "1. Switch to 'Register' tab\n" +
                "2. Use your mat number to register again\n" +
                "3. Ensure good lighting this time");
        }
        
        if (!liveDetections) {
            throw new Error("Could not detect your face in current photo.\n\n" +
                "Please:\n" +
                "1. Move to a brighter location\n" +
                "2. Face the camera directly\n" +
                "3. Remove any obstructions\n" +
                "4. Try capturing again");
        }

        displayMessage('loginError', 'Comparing faces...', false);

        // Step 4: Perform face matching with lenient threshold
        const isValidMatch = await performLenientFaceValidation(registeredDetections, liveDetections, matNo);
        
        if (isValidMatch.success) {
            displayMessage('loginError', `✅ Face verified! (${isValidMatch.similarity}% match) Logging in...`, false);
            loginSuccess(studentData.token, studentData.user);
        } else {
            throw new Error(isValidMatch.error);
        }

    } catch (error) {
        console.error('Face login error:', error);
        throw error;
    }
}


// NEW: Stricter face detection function
async function detectFaceWithHighConfidence(imageElement, imageName) {
    // Use higher confidence thresholds to get better quality detections
    const detectionOptions = [
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.7 }), // High confidence first
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }), // Medium confidence
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })  // Lower confidence as fallback
    ];

    for (const options of detectionOptions) {
        try {
            console.log(`Trying high-confidence detection on ${imageName} with confidence ${options.minConfidence}...`);
            
            const detection = await faceapi
                .detectSingleFace(imageElement, options)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection && detection.detection.score >= 0.5) {
                console.log(`High-quality detection found for ${imageName}:`, {
                    score: detection.detection.score,
                    box: detection.detection.box
                });
                return detection;
            }
        } catch (error) {
            console.warn(`Detection failed for ${imageName} with confidence ${options.minConfidence}:`, error.message);
        }
    }

    console.error(`All high-confidence detection methods failed for ${imageName} image`);
    return null;
}
// NEW: Very lenient face detection for poor quality images
async function detectFaceWithVeryLowConfidence(imageElement, imageName) {
    // Try EXTREMELY lenient thresholds for poor quality images
    const detectionOptions = [
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }),
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 }),
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }),
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.05 }),
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.01 })
    ];

    for (const options of detectionOptions) {
        try {
            console.log(`Trying detection on ${imageName} with confidence ${options.minConfidence}...`);
            
            const detection = await faceapi
                .detectSingleFace(imageElement, options)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                console.log(`Detection found for ${imageName}:`, {
                    score: detection.detection.score,
                    confidence: options.minConfidence
                });
                return detection;
            }
        } catch (error) {
            console.warn(`Detection failed for ${imageName}:`, error.message);
        }
    }

    // Final attempt: Try detecting all faces and pick best one
    try {
        console.log(`Trying multi-face detection on ${imageName}...`);
        const allDetections = await faceapi
            .detectAllFaces(imageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.01 }))
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (allDetections.length > 0) {
            const bestDetection = allDetections.reduce((best, current) => 
                current.detection.score > best.detection.score ? current : best
            );
            console.log(`Multi-face detection success for ${imageName}, found ${allDetections.length} faces`);
            return bestDetection;
        }
    } catch (error) {
        console.warn(`Multi-face detection failed for ${imageName}:`, error.message);
    }

    console.error(`All detection methods failed for ${imageName} - image quality too poor`);
    return null;
}

// NEW: More lenient face validation that accounts for different cameras/devices
async function performLenientFaceValidation(registeredDetection, liveDetection, matNo) {
    try {
        // MUCH MORE LENIENT thresholds for cross-device matching
        const VERY_LENIENT_THRESHOLD = 0.70; // Was 0.55 - now MUCH more lenient for different devices
        const MODERATE_THRESHOLD = 0.80; // Was 0.65
        const STRICT_THRESHOLD = 0.90; // For very poor matches

        // Calculate face descriptor distance
        const distance = faceapi.euclideanDistance(registeredDetection.descriptor, liveDetection.descriptor);
        const similarity = ((1 - distance) * 100).toFixed(1);
        
        console.log(`Face matching for ${matNo}:`, {
            distance: distance,
            similarity: similarity,
            veryLenientThreshold: VERY_LENIENT_THRESHOLD,
            registeredConfidence: registeredDetection.detection.score,
            liveConfidence: liveDetection.detection.score,
            registeredBoxSize: registeredDetection.detection.box,
            liveBoxSize: liveDetection.detection.box
        });

        // Calculate additional similarity metrics for cross-device matching
        const registeredBox = registeredDetection.detection.box;
        const liveBox = liveDetection.detection.box;
        
        // Check if face sizes are drastically different (different cameras)
        const sizeRatio = Math.max(registeredBox.width, registeredBox.height) / 
                         Math.max(liveBox.width, liveBox.height);
        const isDifferentDevice = sizeRatio < 0.5 || sizeRatio > 2.0;
        
        console.log('Device difference check:', {
            sizeRatio,
            isDifferentDevice,
            registeredSize: `${registeredBox.width}x${registeredBox.height}`,
            liveSize: `${liveBox.width}x${liveBox.height}`
        });

        // If registered image OR current image has very low confidence, be VERY lenient
        const hasLowConfidence = registeredDetection.detection.score < 0.3 || 
                                liveDetection.detection.score < 0.3;
        
        // Determine appropriate threshold based on conditions
        let effectiveThreshold = VERY_LENIENT_THRESHOLD;
        let requirementMessage = '>30%';
        
        if (isDifferentDevice || hasLowConfidence) {
            effectiveThreshold = STRICT_THRESHOLD; // 0.90 = accept 10% similarity
            requirementMessage = '>10%';
            console.log('Using VERY lenient threshold due to different device or low confidence');
        } else if (registeredDetection.detection.score < 0.5) {
            effectiveThreshold = MODERATE_THRESHOLD; // 0.80 = accept 20% similarity
            requirementMessage = '>20%';
            console.log('Using moderate threshold due to low registered image quality');
        }

        // Check against effective threshold
        if (distance > effectiveThreshold) {
            return {
                success: false,
                similarity: similarity,
                error: `Face verification failed (${similarity}% similarity).\n\n` +
                       `Required: ${requirementMessage}\n\n` +
                       `Tips:\n` +
                       `• Ensure you're using similar lighting to your registration\n` +
                       `• Face the camera at the same angle\n` +
                       `• Remove glasses/hat if you weren't wearing them during registration\n` +
                       `• Try using the same device you used to register\n\n` +
                       `Or re-register with the device you're currently using.`
            };
        }

        // For matches between 10-30%, perform additional validation
        if (distance > VERY_LENIENT_THRESHOLD && distance <= effectiveThreshold) {
            console.log('Low similarity match - performing additional validation');
            
            // Check basic facial structure
            const structuralSimilarity = await checkStructuralSimilarity(
                registeredDetection, 
                liveDetection
            );
            
            if (!structuralSimilarity.passed) {
                return {
                    success: false,
                    similarity: similarity,
                    error: `Face structure doesn't match (${similarity}% similarity).\n\n` +
                           `${structuralSimilarity.reason}\n\n` +
                           `This might be a different person or very different conditions.`
                };
            }
            
            console.log('Structural validation passed despite low similarity');
        }

        // Success
        return {
            success: true,
            similarity: similarity,
            distance: distance,
            usedLenientThreshold: effectiveThreshold > VERY_LENIENT_THRESHOLD
        };

    } catch (error) {
        console.error('Face validation error:', error);
        return {
            success: false,
            error: 'Face validation system error. Please try again.'
        };
    }
}
// NEW: Comprehensive face validation with multiple checks
async function performStrictFaceValidation(registeredDetection, liveDetection, matNo) {
    try {
        // 1. STRICTER threshold - only accept very close matches
        const STRICT_THRESHOLD = 0.45; // Much stricter than 0.6
        const VERY_STRICT_THRESHOLD = 0.35; // For high-security matches

        // 2. Calculate face descriptor distance
        const distance = faceapi.euclideanDistance(registeredDetection.descriptor, liveDetection.descriptor);
        const similarity = ((1 - distance) * 100).toFixed(1);
        
        console.log(`Face matching for ${matNo}:`, {
            distance: distance,
            similarity: similarity,
            strictThreshold: STRICT_THRESHOLD,
            veryStrictThreshold: VERY_STRICT_THRESHOLD
        });

        // 3. REJECT if faces are too different
        if (distance > STRICT_THRESHOLD) {
            return {
                success: false,
                similarity: similarity,
                error: `Face verification failed (${similarity}% similarity). This appears to be a different person. Required: >=${((1-STRICT_THRESHOLD)*100).toFixed(1)}%`
            };
        }

        // 4. Additional validation checks for very strict matching
        if (distance > VERY_STRICT_THRESHOLD) {
            // Require additional validation for medium matches
            const additionalChecks = await performAdditionalFaceChecks(registeredDetection, liveDetection);
            if (!additionalChecks.passed) {
                return {
                    success: false,
                    similarity: similarity,
                    error: `Face verification failed additional security checks (${similarity}% similarity). ${additionalChecks.reason}`
                };
            }
        }

        // 5. Success - faces match with high confidence
        return {
            success: true,
            similarity: similarity,
            distance: distance
        };

    } catch (error) {
        console.error('Face validation error:', error);
        return {
            success: false,
            error: 'Face validation system error. Please try again.'
        };
    }
}

// NEW: Check structural similarity for low-confidence matches
async function checkStructuralSimilarity(registered, live) {
    try {
        // Get face landmarks for both images
        const regLandmarks = registered.landmarks.positions;
        const liveLandmarks = live.landmarks.positions;
        
        if (!regLandmarks || !liveLandmarks) {
            return { passed: true }; // Can't validate, allow match
        }
        
        // Calculate key facial proportions
        const getProportions = (landmarks) => {
            // Eye to eye distance
            const leftEye = landmarks[36]; // Left eye outer corner
            const rightEye = landmarks[45]; // Right eye outer corner
            const eyeDistance = Math.sqrt(
                Math.pow(rightEye.x - leftEye.x, 2) + 
                Math.pow(rightEye.y - leftEye.y, 2)
            );
            
            // Nose to chin distance
            const noseTip = landmarks[30];
            const chin = landmarks[8];
            const faceHeight = Math.sqrt(
                Math.pow(chin.x - noseTip.x, 2) + 
                Math.pow(chin.y - noseTip.y, 2)
            );
            
            // Face width (jaw)
            const leftJaw = landmarks[0];
            const rightJaw = landmarks[16];
            const faceWidth = Math.sqrt(
                Math.pow(rightJaw.x - leftJaw.x, 2) + 
                Math.pow(rightJaw.y - leftJaw.y, 2)
            );
            
            return {
                eyeToHeightRatio: eyeDistance / faceHeight,
                widthToHeightRatio: faceWidth / faceHeight
            };
        };
        
        const regProps = getProportions(regLandmarks);
        const liveProps = getProportions(liveLandmarks);
        
        // Check if proportions are similar (allow 30% variance for different angles/cameras)
        const eyeRatioDiff = Math.abs(regProps.eyeToHeightRatio - liveProps.eyeToHeightRatio) / 
                            regProps.eyeToHeightRatio;
        const widthRatioDiff = Math.abs(regProps.widthToHeightRatio - liveProps.widthToHeightRatio) / 
                              regProps.widthToHeightRatio;
        
        console.log('Structural similarity check:', {
            eyeRatioDiff,
            widthRatioDiff,
            regProps,
            liveProps
        });
        
        if (eyeRatioDiff > 0.4 || widthRatioDiff > 0.4) {
            return {
                passed: false,
                reason: 'Facial proportions are too different. This appears to be a different person.'
            };
        }
        
        return { passed: true };
        
    } catch (error) {
        console.error('Structural similarity check error:', error);
        return { passed: true }; // On error, allow the match
    }
}

// NEW: Additional face validation checks
async function performAdditionalFaceChecks(registeredDetection, liveDetection) {
    try {
        // 1. Check face box dimensions similarity
        const regBox = registeredDetection.detection.box;
        const liveBox = liveDetection.detection.box;
        
        const aspectRatioDiff = Math.abs(
            (regBox.width / regBox.height) - (liveBox.width / liveBox.height)
        );
        
        if (aspectRatioDiff > 0.3) {
            return {
                passed: false,
                reason: 'Face proportions too different'
            };
        }

        // 2. Check detection confidence
        if (registeredDetection.detection.score < 0.6 || liveDetection.detection.score < 0.6) {
            return {
                passed: false,
                reason: 'Face detection confidence too low'
            };
        }

        // 3. Validate landmarks are detected properly
        if (!registeredDetection.landmarks || !liveDetection.landmarks) {
            return {
                passed: false,
                reason: 'Facial landmarks not properly detected'
            };
        }

        return { passed: true };
        
    } catch (error) {
        console.error('Additional face checks error:', error);
        return {
            passed: false,
            reason: 'Additional validation checks failed'
        };
    }
}


// UPDATED: Create face matcher with stricter settings
function createStrictFaceMatcher(knownFaces, threshold = 0.45) {
    return new faceapi.FaceMatcher(knownFaces, threshold);
}
// Helper function to create image from base64 with better error handling
async function createImageFromBase64(base64Data) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            console.log('Registered image loaded:', img.width, 'x', img.height);
            resolve(img);
        };
        img.onerror = (error) => {
            console.error('Failed to load registered image:', error);
            reject(new Error('Failed to load registered image'));
        };
        img.src = `data:image/jpeg;base64,${base64Data}`;
    });
}

// Try multiple detection methods with different sensitivity levels
async function tryMultipleDetectionMethods(imageElement, imageName) {
    const detectionMethods = [
        // Most permissive first
        { options: new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }), name: 'very-low-confidence' },
        { options: new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 }), name: 'low-confidence' },
        { options: new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }), name: 'medium-confidence' },
        { options: new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }), name: 'default-confidence' }
    ];

    for (const method of detectionMethods) {
        try {
            console.log(`Trying ${method.name} detection on ${imageName} image...`);
            
            const detection = await faceapi
                .detectSingleFace(imageElement, method.options)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                console.log(`Success with ${method.name} on ${imageName}:`, {
                    score: detection.detection.score,
                    box: detection.detection.box
                });
                return detection;
            }
        } catch (error) {
            console.warn(`${method.name} failed on ${imageName}:`, error.message);
        }
    }

    // If single face detection fails, try detecting all faces and pick the best one
    try {
        console.log(`Trying multi-face detection on ${imageName}...`);
        const allDetections = await faceapi
            .detectAllFaces(imageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (allDetections.length > 0) {
            // Pick the face with highest confidence
            const bestDetection = allDetections.reduce((best, current) => 
                current.detection.score > best.detection.score ? current : best
            );
            console.log(`Multi-face detection success on ${imageName}:`, {
                totalFaces: allDetections.length,
                bestScore: bestDetection.detection.score
            });
            return bestDetection;
        }
    } catch (error) {
        console.warn(`Multi-face detection failed on ${imageName}:`, error.message);
    }

    console.error(`All detection methods failed for ${imageName} image`);
    return null;
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
        // Other Event Handlers
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
                displayMessage('lecturerError', 'Course created successfully! 🎉', false);
            } catch (error) {
                displayMessage('lecturerError', `Course creation failed: ${error.message}`);
            }
        });

        generateCodeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            clearMessages();
            const courseId = parseInt(document.getElementById('courseSelectForCode').value, 10);
            if (!courseId) {
                displayMessage('lecturerError', 'Please select a course first.');
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
                displayMessage('lecturerError', 'Geolocation is required to generate a code.'); 
            });
        });

        attendanceForm.addEventListener('submit', (e) => {
            e.preventDefault();
            clearMessages();
            const code = e.target.code.value;
            if (!code) {
                displayMessage('studentError', 'Please enter an attendance code.');
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
                displayMessage('studentError', 'Geolocation is required to mark attendance.'); 
            });
        });

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
                        document.getElementById('studentWelcome').textContent = `Welcome back, ${currentUser.info.name}! 👋`;
                        navigate('student');
                    } else if (currentUser.type === 'lecturer') {
                        document.getElementById('lecturerWelcome').textContent = `Welcome back, ${currentUser.info.name}! 👨‍🏫`;
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