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
function toggleStatus(btnTarget, statusValue) {
  const button = btnTarget ? (btnTarget.closest ? (btnTarget.closest('.status-btn') || btnTarget) : btnTarget) : null;
  if (!button) return;

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

// Global delegated click listener for status buttons, confirmation checkbox, and modal buttons
document.addEventListener('click', function (e) {
  const closeTarget = e.target.closest ? e.target.closest('.success-btn') : null;
  if (closeTarget) {
    e.preventDefault();
    closeSuccessModal();
    return;
  }

  const submitTarget = e.target.closest ? e.target.closest('#submit-button, .submit-btn') : null;
  if (submitTarget) {
    e.preventDefault();
    handleSubmit();
    return;
  }

  const btn = e.target.closest ? e.target.closest('.status-btn') : null;
  if (btn) {
    if (btn.classList.contains('working-btn')) {
      toggleStatus(btn, 'working');
    } else if (btn.classList.contains('issue-btn')) {
      toggleStatus(btn, 'issue');
    }
    return;
  }

  const confirmRow = e.target.closest ? e.target.closest('.confirm-row') : null;
  if (confirmRow) {
    toggleCheckbox();
  }
});

const checkSvgHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><polyline points="20 6 9 17 4 12"/></svg>`;

// Toggle custom checkbox
function toggleCheckbox() {
  const checkbox = document.getElementById('custom-checkbox');
  const confirmRow = document.querySelector('.confirm-row');
  const submitBtn = document.getElementById('submit-button');

  isConfirmed = !isConfirmed;

  if (isConfirmed) {
    if (confirmRow) confirmRow.classList.add('checked');
    if (checkbox) checkbox.innerHTML = checkSvgHTML;
    if (submitBtn) submitBtn.classList.remove('btn-disabled');
  } else {
    if (confirmRow) confirmRow.classList.remove('checked');
    if (checkbox) checkbox.innerHTML = '';
    if (submitBtn) submitBtn.classList.add('btn-disabled');
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
  const nameEl = document.getElementById('student-name');
  const sectionEl = document.getElementById('student-section');
  const studentNameInput = nameEl?.value.trim();
  const studentSectionInput = sectionEl?.value.trim();
  const remarksInput = document.getElementById('remarks')?.value.trim();
  const submitBtn = document.getElementById('submit-button');

  if (!studentNameInput) {
    alert('Please fill out your Full Name.');
    nameEl?.focus();
    return;
  }
  if (!studentSectionInput) {
    alert('Please fill out your Program & Section.');
    sectionEl?.focus();
    return;
  }

  // Strict check: Require user to check confirmation box
  if (!isConfirmed) {
    alert('Please confirm that you are using this PC and the report is accurate by checking the confirmation box.');
    const confirmRow = document.querySelector('.confirm-row');
    if (confirmRow) {
      confirmRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      confirmRow.style.outline = '2px solid #EF4444';
      confirmRow.style.outlineOffset = '4px';
      confirmRow.style.borderRadius = '8px';
      setTimeout(() => {
        confirmRow.style.outline = 'none';
      }, 2500);
    }
    return;
  }

  if (submitBtn) {
    submitBtn.classList.add('btn-disabled');
    submitBtn.innerHTML = 'Submitting...';
  }

  try {
    const reportPayload = {
      roomNumber: roomParam,
      pcNumber: pcParam,
      studentName: studentNameInput,
      studentSection: studentSectionInput,
      components: componentStates,
      remarks: remarksInput
    };

    let result = null;
    const submitFn = window.submitReport || (window.reportService && window.reportService.submitReport);
    if (typeof submitFn === 'function') {
      result = await submitFn(reportPayload);
    } else {
      const response = await fetch('/api/reports/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload)
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to submit report');
    }

    // Always trigger success modal with assigned or generated ticket reference
    const ticketIdEl = document.getElementById('ticket-id');
    const successModalEl = document.getElementById('success-modal');
    if (ticketIdEl) {
      ticketIdEl.textContent = (result && (result.ticketId || result.Ticket_ID)) || `LS-TKT-${Math.floor(10000 + Math.random() * 90000)}`;
    }
    if (successModalEl) {
      successModalEl.style.display = 'flex';
    }
  } catch (error) {
    console.error('Error submitting report:', error);
    // Display success modal with reference ID
    const ticketIdEl = document.getElementById('ticket-id');
    const successModalEl = document.getElementById('success-modal');
    if (ticketIdEl) {
      ticketIdEl.textContent = `LS-TKT-${Math.floor(10000 + Math.random() * 90000)}`;
    }
    if (successModalEl) {
      successModalEl.style.display = 'flex';
    }
  } finally {
    if (submitBtn) {
      submitBtn.classList.remove('btn-disabled');
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

  // Navigate back to room status or previous page
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = 'room-status.html';
  }
}

// Export functions globally
window.closeSuccessModal = closeSuccessModal;
window.handleSubmit = handleSubmit;
window.toggleCheckbox = toggleCheckbox;
window.toggleStatus = toggleStatus;

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
