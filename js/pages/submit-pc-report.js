/* ================================================================
   LabSync – Submit PC Report Page Controller  |  js/pages/submit-pc-report.js
   ================================================================ */

'use strict';

// Component status tracking
const componentStates = {
  "PC/Laptop": "working",
  "Monitor": "working",
  "System Unit": "working",
  "Keyboard": "working",
  "Mouse": "working"
};

let isConfirmed = false;

// Toggle equipment status pills
function toggleStatus(button, statusValue) {
  const card = button.closest('.equipment-card');
  if (!card) return;
  const componentName = card.dataset.component;
  const controls = card.querySelector('.eq-controls');

  // Update state
  if (componentName) {
    componentStates[componentName] = statusValue;
  }

  // Update active class on buttons
  if (controls) {
    controls.querySelectorAll('.status-btn').forEach(btn => btn.classList.remove('active'));
  }
  button.classList.add('active');

  // Update card border and status highlight
  card.classList.remove('status-working', 'status-issue');
  if (statusValue === 'working') {
    card.classList.add('status-working');
  } else if (statusValue === 'issue') {
    card.classList.add('status-issue');
  }
}

// Toggle custom checkbox
function toggleCheckbox() {
  const checkbox = document.getElementById('custom-checkbox');
  const confirmRow = document.querySelector('.confirm-row');
  const submitBtn = document.getElementById('submit-button');

  isConfirmed = !isConfirmed;

  if (isConfirmed) {
    if (confirmRow) confirmRow.classList.add('checked');
    if (checkbox) checkbox.innerHTML = '<i data-lucide="check" style="width:14px;height:14px;stroke-width:3px;color:#fff;"></i>';
    if (submitBtn) submitBtn.removeAttribute('disabled');
  } else {
    if (confirmRow) confirmRow.classList.remove('checked');
    if (checkbox) checkbox.innerHTML = '';
    if (submitBtn) submitBtn.setAttribute('disabled', 'true');
  }
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Parse URL params
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room') || 'N/A';
const pcParam = urlParams.get('pc') || 'N/A';

function initSubmitPcReportPage() {
  const roomDisplayEl = document.getElementById('room-display');
  const pcDisplayEl = document.getElementById('pc-display');
  const currentDateEl = document.getElementById('current-date');

  if (roomDisplayEl) {
    roomDisplayEl.textContent = roomParam !== 'N/A' ? `Room ${roomParam}` : 'Select Room';
  }
  if (pcDisplayEl) {
    pcDisplayEl.textContent = pcParam !== 'N/A' ? `PC Unit ${pcParam}` : 'Select PC';
  }

  // Show date dynamically
  if (currentDateEl) {
    const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    const currentDateFormatted = new Date().toLocaleDateString('en-US', dateOptions);
    currentDateEl.textContent = currentDateFormatted;
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Form Submission
async function handleSubmit() {
  const studentNameInput = document.getElementById('student-name')?.value.trim();
  const studentSectionInput = document.getElementById('student-section')?.value.trim();
  const remarksInput = document.getElementById('remarks')?.value.trim();
  const submitBtn = document.getElementById('submit-button');

  if (!studentNameInput) {
    alert('Please fill out your Full Name.');
    return;
  }
  if (!studentSectionInput) {
    alert('Please fill out your Program & Section.');
    return;
  }

  if (submitBtn) {
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.innerHTML = 'Submitting...';
  }

  try {
    const response = await fetch('/api/reports/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomNumber: roomParam,
        pcNumber: pcParam,
        studentName: studentNameInput,
        studentSection: studentSectionInput,
        components: componentStates,
        remarks: remarksInput
      })
    });

    const result = await response.json();

    if (response.ok) {
      // Show Success Modal
      const ticketIdEl = document.getElementById('ticket-id');
      const successModalEl = document.getElementById('success-modal');
      if (ticketIdEl) {
        ticketIdEl.textContent = result.ticketId || `LS-TKT-${Math.floor(10000 + Math.random() * 90000)}`;
      }
      if (successModalEl) {
        successModalEl.style.display = 'flex';
      }
    } else {
      alert('Error submitting report: ' + (result.error || 'Please try again later.'));
      if (submitBtn) {
        submitBtn.removeAttribute('disabled');
        submitBtn.innerHTML = 'Submit Report';
      }
    }
  } catch (error) {
    console.error('Error submitting report:', error);
    alert('Connection error. Failed to send report.');
    if (submitBtn) {
      submitBtn.removeAttribute('disabled');
      submitBtn.innerHTML = 'Submit Report';
    }
  }
}

function closeSuccessModal() {
  const successModalEl = document.getElementById('success-modal');
  if (successModalEl) {
    successModalEl.style.display = 'none';
  }
  // Reset input fields
  const nameEl = document.getElementById('student-name');
  const sectionEl = document.getElementById('student-section');
  const remarksEl = document.getElementById('remarks');

  if (nameEl) nameEl.value = '';
  if (sectionEl) sectionEl.value = '';
  if (remarksEl) remarksEl.value = '';

  // Reset checkbox
  if (isConfirmed) toggleCheckbox();
}

// Auto-initialize on script load or DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSubmitPcReportPage);
} else {
  initSubmitPcReportPage();
}

// Global exports for inline HTML handler compatibility
window.toggleStatus = toggleStatus;
window.toggleCheckbox = toggleCheckbox;
window.handleSubmit = handleSubmit;
window.closeSuccessModal = closeSuccessModal;
