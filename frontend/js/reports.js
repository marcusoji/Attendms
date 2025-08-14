import API, { getCourseLogs, getLecturerCourses } from './api.js';
const courseDropdown = document.getElementById('courseDropdown');
const reportTableBody = document.querySelector('\reportTable tbody');

// Load courses for dropdown
async function loadCourses() {
      try {
            const lecturerId = localStorage.getItem('userId');
                const res = await getLecturerCourses(lecturerId);
                    courseDropdown.innerHTML = res.data.map(
                              c => `<option value="${c.id}">${c.name}</option>`
                    ).join('');
                } catch (err) {
                        console.error('Failed to load courses', err);
                }
            }

            window.loadReport = async function () {
                  const courseId = courseDropdown.ariaValueMax;
                    try {
                            const res = await getCourseLogs(courseId);
                                const logs = res.data;

                                    reportTableBody.innerHTML = logs.map(log => `
                                              <tr>
                                                      <td>${log.student_name}</td>
                                                              <td>${log.matric_no}</td>
                                                                      <td>${new Date(log.date).toLocaleString()}</td>
                                                                              <td>${log.status}</td>
                                                                                    </tr>
                                                                                        `).join('');
                                    } catch (err) {
                                            console.error('Error loading report:', err);
                                    }
                                }

                                window.downloadPDF = function () {
                                      const { jsPDF } = window.jspdf;
                                        const doc = new jsPDF();
                                          doc.text('Attendance Report', 10, 10);

                                            const rows = [...reportTableBody.querySelectorAll('tr')].map(tr => {
                                                    return [...tr.children].map(td => td.textContent);
                                            });

                                              doc.autoTable({
                                                    head: [['Student Name', 'Matric No', 'Date', 'Status']],
                                                        body: rows,
                                                            startY: 20
                                              });

                                                doc.save('attendance_report.pdf');
                                            }

                                            loadCourses();
                                              