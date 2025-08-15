 // Enhanced JavaScript for organized attendance reports
        const API_URL = '';
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

        // Camera Functions
        async function startCamera(videoElementId) {
            stopCamera();
            const videoPreview = document.getElementById(videoElementId);
            videoPreview.style.display = 'block';
            try {
                videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                videoPreview.srcObject = videoStream;
            } catch (err) {
                console.error("Camera Error:", err);
                displayMessage(videoElementId.includes('login') ? 'loginError' : 'registerError', 'Could not access camera. Please grant permission.');
            }
        }

        function stopCamera() {
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
                videoStream = null;
            }
            document.getElementById('video-preview-login').style.display = 'none';
            document.getElementById('video-preview-register').style.display = 'none';
        }
        
        function captureFace(videoElementId, statusElementId) {
            const videoPreview = document.getElementById(videoElementId);
            if (!videoStream) {
                displayMessage(statusElementId, "Camera not started. Please start the camera first.", true);
                return;
            }
            const context = captureCanvas.getContext('2d');
            captureCanvas.width = videoPreview.videoWidth;
            captureCanvas.height = videoPreview.videoHeight;
            context.drawImage(videoPreview, 0, 0, captureCanvas.width, captureCanvas.height);
            captureCanvas.toBlob(blob => {
                faceScanBlob = blob;
                displayMessage(statusElementId, "✅ Face Captured Successfully!", false);
                stopCamera();
            }, 'image/jpeg');
        }

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

// REPLACE the ENTIRE handleStudentFaceLogin function with this new version:
async function handleStudentFaceLogin() {
    if (!faceApiLoaded) throw new Error("Face recognition is still loading. Please wait.");
    if (!faceScanBlob) throw new Error("Please capture your face to log in.");

    const matNo = loginForm.elements.matNo.value;
    if (!matNo) throw new Error("Matriculation Number is required.");

    displayMessage('loginError', 'Verifying face... Please wait.', false);

    // Step 1: Get the registered face scan data from the server
    const studentData = await apiFetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userType: 'student', matNo })
    });

    if (!studentData.faceScanData) {
        throw new Error("No registered face scan found for this student.");
    }

    // Step 2: Create an image element from the registered Base64 data
    const registeredImage = new Image();
    registeredImage.src = `data:image/jpeg;base64,${studentData.faceScanData}`;
    await new Promise(resolve => registeredImage.onload = resolve);
    
    // Step 3: Create an image element from the live captured blob
    const liveImage = await faceapi.bufferToImage(faceScanBlob);

    // Step 4: Get face descriptors for both images
    const registeredDetections = await faceapi.detectSingleFace(registeredImage).withFaceLandmarks().withFaceDescriptor();
    const liveDetections = await faceapi.detectSingleFace(liveImage).withFaceLandmarks().withFaceDescriptor();

    if (!registeredDetections || !liveDetections) {
        throw new Error("Could not detect a face in one of the images. Please ensure your face is clear and try again.");
    }

    // Step 5: Compare the two face descriptors
    const faceMatcher = new faceapi.FaceMatcher(registeredDetections);
    const bestMatch = faceMatcher.findBestMatch(liveDetections.descriptor);

    // Using a threshold of 0.5 for higher accuracy
    if (bestMatch.label === 'person 1' && bestMatch.distance < 0.5) { 
        displayMessage('loginSuccess', 'Face match successful! Logging in...', false);
        loginSuccess(studentData.token, studentData.user);
    } else {
        throw new Error(`Face does not match. (Similarity score: ${((1 - bestMatch.distance) * 100).toFixed(2)}%)`);
    }
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