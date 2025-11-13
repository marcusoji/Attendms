### School Attendance System
A comprehensive web-based attendance management system with facial recognition, geolocation verification, and real-time attendance tracking. Built with Node.js, Express, MySQL, and Face-API.js.

### Authentication & Security
- **Facial Recognition Login** for students using Face-API.js
- **Secure Password Authentication** for lecturers and admins (bcrypt hashing)
- **JWT Token-based** session management
- **Role-based Access Control** (Student, Lecturer, Admin)
- **Cross-device Face Matching** with adaptive thresholds

### Student Features
- Facial recognition registration and login
- Real-time attendance marking via QR codes
- Geolocation verification (within 100m of class)
- View personal attendance history
- Mobile-friendly face capture with lighting optimization

## Lecturer Features
- Create and manage courses
- Generate time-limited attendance codes (10-minute validity)
- Location-based code generation
- View attendance reports by course and session
- Real-time attendance tracking
- Print attendance sheets
- Export attendance data to CSV

## Admin Dashboard
- **User Management**: View, search, and manage students and lecturers
- **Course Management**: Monitor all courses and statistics
- **Advanced Analytics**: 
  - Student engagement metrics
  - Course performance reports
  - Lecturer teaching statistics
  - Daily attendance summaries
- **Data Export**: 15+ export options including:
  - Basic exports (students, lecturers, courses)
  - Advanced reports (statistics, performance metrics)
  - Custom filtered exports (date range, course-specific)
- **System Monitoring**: Health checks, active codes, database management

## Reporting & Analytics
- Session-based attendance reports
- Student attendance history
- Course statistics (unique students, total sessions)
- Daily attendance summaries
- Lecturer performance metrics
- CSV export for all data types

### Student
**Capabilities:**
- ✅ Register with face scan
- ✅ Login with face verification
- ✅ Mark attendance with code
- ✅ View personal attendance history
- ❌ Cannot access other student data
- ❌ Cannot generate codes


### Lecturer
**Capabilities:**
- ✅ Create and manage courses
- ✅ Generate attendance codes
- ✅ View course attendance reports
- ✅ Export attendance data
- ✅ Print attendance sheets
- ❌ Cannot access other lecturer's courses
- ❌ Cannot manage users

**Authentication:** Email + Password

## Admin(only 1 + no room for creation of another)
**Capabilities:**
- ✅ Full system access
- ✅ Manage all users (students, lecturers)
- ✅ Manage all courses
- ✅ View all attendance records
- ✅ Generate comprehensive reports
- ✅ Export all data types
- ✅ System monitoring and maintenance
- ✅ Delete users, courses, records

**Authentication:** Email + Password

Security Features

### Authentication & Authorization
- **JWT Tokens**: Secure, stateless authentication
- **Token Expiration**: 24-hour validity
- **Role-based Access**: Middleware enforces permissions
- **Password Hashing**: Bcrypt with 10 salt rounds

### Facial Recognition Security
- **Multi-threshold Validation**: Adapts to device differences
- **Structural Validation**: Facial proportion checks
- **Cross-device Compensation**: Handles laptop→mobile scenarios
- **Minimum Threshold**: 25% hard minimum prevents impersonation
- **Liveness Detection**: Real-time camera capture required

### Data Protection
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Input sanitization
- **CORS Configuration**: Controlled cross-origin access
- **Secure File Storage**: Supabase encrypted storage
- **No Password Storage**: Students use face recognition only

### Location Verification
- **100m Radius Check**: Prevents remote attendance
- **Geolocation API**: Browser-based location
- **Haversine Formula**: Accurate distance calculation

### Code Security
- **Time-limited Codes**: 10-minute expiration
- **Random Generation**: Cryptographically random codes
- **One-time Usage**: Can't mark same course twice per day
- **Location-bound**: Generated at specific coordinates

### Project Structure

```
school-attendance-system/
│
├── server.js                 # Main server file
├── .env                      # Environment variables (not in git)
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies
├── README.md                # This file
│
├── frontend/
│   ├── index.html          # Main HTML file
│   ├── css/
│   │   └── style.css       # Styles
│   └── js/
│       └── auth.js         # Frontend JavaScript
│
├── uploads/                 # Temporary file uploads (if using local storage)
│
└── node_modules/           # Dependencies (not in git)
```

---

  
