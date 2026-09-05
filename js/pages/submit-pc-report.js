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
let isSubmitting = false;

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
    if (e.preventDefault) e.preventDefault();
    if (window.getSelection) {
      try {
        window.getSelection().removeAllRanges();
      } catch (err) {}
    }
    if (btn.classList.contains('working-btn')) {
      toggleStatus(btn, 'working');
    } else if (btn.classList.contains('issue-btn')) {
      toggleStatus(btn, 'issue');
    }
    return;
  }

  const confirmRow = e.target.closest ? e.target.closest('.confirm-row') : null;
  if (confirmRow) {
    if (e.preventDefault) e.preventDefault();
    if (window.getSelection) {
      try {
        window.getSelection().removeAllRanges();
      } catch (err) {}
    }
    toggleCheckbox();
  }
});

const checkSvgHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><polyline points="20 6 9 17 4 12"/></svg>`;

// Toggle custom checkbox
function toggleCheckbox() {
  if (window.getSelection) {
    try {
      window.getSelection().removeAllRanges();
    } catch (err) {}
  }
  const checkbox = document.getElementById('custom-checkbox');
  const confirmRow = document.querySelector('.confirm-row');
  const submitBtn = document.getElementById('submit-button');

  isConfirmed = !isConfirmed;

  if (isConfirmed) {
    if (confirmRow) confirmRow.classList.add('checked');
    if (checkbox) checkbox.innerHTML = checkSvgHTML;
    if (submitBtn && !isSubmitting) {
      submitBtn.classList.remove('btn-disabled');
      submitBtn.disabled = false;
    }
  } else {
    if (confirmRow) confirmRow.classList.remove('checked');
    if (checkbox) checkbox.innerHTML = '';
    if (submitBtn) {
      submitBtn.classList.add('btn-disabled');
      submitBtn.disabled = true;
    }
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

  // Live character counter for Issue Details / Remarks
  const remarksTextarea = document.getElementById('remarks');
  const remarksCounter = document.getElementById('remarks-char-counter');

  function updateCharCount() {
    if (!remarksTextarea) return;
    const currentLength = remarksTextarea.value.length;
    if (remarksCounter) {
      remarksCounter.textContent = `${currentLength} / 200 characters`;
      if (currentLength >= 200) {
        remarksCounter.classList.add('counter-at-limit');
        remarksCounter.classList.remove('counter-near-limit');
      } else if (currentLength >= 170) {
        remarksCounter.classList.add('counter-near-limit');
        remarksCounter.classList.remove('counter-at-limit');
      } else {
        remarksCounter.classList.remove('counter-at-limit', 'counter-near-limit');
      }
    }
  }

  if (remarksTextarea) {
    remarksTextarea.addEventListener('input', updateCharCount);
    remarksTextarea.addEventListener('keyup', updateCharCount);
    remarksTextarea.addEventListener('paste', () => {
      setTimeout(updateCharCount, 0);
    });
    updateCharCount();
  }

  // Auto-uppercase Program & Section input in real-time
  const sectionInputEl = document.getElementById('student-section');
  if (sectionInputEl) {
    const handleUppercase = function () {
      const start = this.selectionStart;
      const end = this.selectionEnd;
      this.value = this.value.toUpperCase();
      if (start !== null && end !== null) {
        this.setSelectionRange(start, end);
      }
    };
    sectionInputEl.addEventListener('input', handleUppercase);
    sectionInputEl.addEventListener('keyup', handleUppercase);
    sectionInputEl.addEventListener('paste', () => {
      setTimeout(() => {
        sectionInputEl.value = sectionInputEl.value.toUpperCase();
      }, 0);
    });
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// In-App System Toast Notification helper
function showSystemToast(message, type = 'warning', title = null) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type, title);
    return;
  }
  let container = document.getElementById('labsync-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'labsync-toast-container';
    document.body.appendChild(container);
  }
  const card = document.createElement('div');
  card.className = 'labsync-toast-card';
  const isError = type === 'error';
  const isWarning = type === 'warning';
  const toastTitle = title || (isError ? 'Submission Notice' : (isWarning ? 'Notice' : 'Success'));
  const iconName = isError ? 'alert-triangle' : (isWarning ? 'alert-circle' : 'check-circle-2');
  const iconColor = isError ? '#EF4444' : (isWarning ? '#F59E0B' : '#1EBBD7');
  const iconBg = isError ? 'rgba(239, 68, 68, 0.12)' : (isWarning ? 'rgba(245, 158, 11, 0.12)' : 'rgba(30, 187, 215, 0.12)');

  card.innerHTML = `
    <div style="width: 34px; height: 34px; min-width: 34px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;">
      <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
    </div>
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 13.5px; font-weight: 700; color: var(--text-dark, #0F172A); margin-bottom: 2px; font-family: var(--font-display, sans-serif); display: flex; align-items: center; justify-content: space-between;">
        <span>${toastTitle}</span>
        <button class="labsync-toast-close" style="background: none; border: none; font-size: 16px; color: var(--text-muted, #94A3B8); cursor: pointer; padding: 0 4px; line-height: 1; margin-left: 8px;">&times;</button>
      </div>
      <div style="font-size: 13.5px; color: var(--text-mid, #475569); line-height: 1.4; word-break: break-word;">${message}</div>
    </div>
  `;
  container.appendChild(card);
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: card });
  }
  const closeBtn = card.querySelector('.labsync-toast-close');
  if (closeBtn) closeBtn.addEventListener('click', () => card.remove());
  setTimeout(() => card.remove(), 4200);
}

// Form Submission
async function handleSubmit() {
  if (isSubmitting) return;

  const nameEl = document.getElementById('student-name');
  const sectionEl = document.getElementById('student-section');
  const remarksEl = document.getElementById('remarks');
  const studentNameInput = nameEl?.value.trim();
  const studentSectionInput = sectionEl?.value.trim().toUpperCase();
  const remarksInput = remarksEl?.value.trim();
  const submitBtn = document.getElementById('submit-button');

  if (!studentNameInput) {
    showSystemToast('Please enter your Full Name.', 'warning', 'Required Field');
    nameEl?.focus();
    return;
  }
  if (!studentSectionInput) {
    showSystemToast('Please enter your Program & Section.', 'warning', 'Required Field');
    sectionEl?.focus();
    return;
  }

  if (remarksInput && remarksInput.length > 200) {
    showSystemToast('Issue Details must not exceed 200 characters.', 'warning', 'Character Limit');
    remarksEl?.focus();
    return;
  }

  // Strict check: Require user to check confirmation box
  if (!isConfirmed) {
    showSystemToast('Please check the confirmation box to confirm you are using this PC.', 'warning', 'Confirmation Required');
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

  isSubmitting = true;
  if (submitBtn) {
    submitBtn.classList.add('btn-disabled');
    submitBtn.disabled = true;
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

    // Trigger success modal with assigned ticket reference
    const ticketIdEl = document.getElementById('ticket-id');
    const successModalEl = document.getElementById('success-modal');
    if (ticketIdEl) {
      ticketIdEl.textContent = (result && (result.ticketId || result.Ticket_ID)) || `LS-TKT-${Math.floor(10000 + Math.random() * 90000)}`;
    }
    if (successModalEl) {
      successModalEl.style.display = 'flex';
      if (typeof window.setModalOpenState === 'function') window.setModalOpenState(true);
    }
  } catch (error) {
    console.error('Error submitting report:', error);
    showSystemToast(error.message || 'Failed to submit report. Please try again.', 'error', 'Submission Notice');
    if (submitBtn && isConfirmed) {
      submitBtn.classList.remove('btn-disabled');
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit Report';
    }
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.innerHTML = 'Submit Report';
      if (!isConfirmed) {
        submitBtn.classList.add('btn-disabled');
        submitBtn.disabled = true;
      }
    }
  }
}

function closeSuccessModal() {
  const successModalEl = document.getElementById('success-modal');
  if (successModalEl) {
    successModalEl.style.display = 'none';
  }
  if (typeof window.setModalOpenState === 'function') window.setModalOpenState(false);
  // Reset input fields
  const nameEl = document.getElementById('student-name');
  const sectionEl = document.getElementById('student-section');
  const remarksEl = document.getElementById('remarks');

  if (nameEl) nameEl.value = '';
  if (sectionEl) sectionEl.value = '';
  if (remarksEl) remarksEl.value = '';
  const remarksCounterEl = document.getElementById('remarks-char-counter');
  if (remarksCounterEl) {
    remarksCounterEl.textContent = '0 / 200 characters';
    remarksCounterEl.classList.remove('counter-at-limit', 'counter-near-limit');
  }

  // Reset equipment states & UI back to working
  Object.keys(componentStates).forEach(key => {
    componentStates[key] = 'working';
  });
  document.querySelectorAll('.equipment-card').forEach(card => {
    card.classList.remove('status-issue');
    card.classList.add('status-working');
    const workingBtn = card.querySelector('.working-btn');
    const issueBtn = card.querySelector('.issue-btn');
    if (workingBtn) workingBtn.classList.add('active');
    if (issueBtn) issueBtn.classList.remove('active');
  });

  // Reset checkbox
  if (isConfirmed) toggleCheckbox();
}

// Export functions globally
window.closeSuccessModal = closeSuccessModal;
window.handleSubmit = handleSubmit;
window.toggleCheckbox = toggleCheckbox;
window.toggleStatus = toggleStatus;

function initSubmitPcReportPage() {
  const successModalEl = document.getElementById('success-modal');
  if (successModalEl) {
    successModalEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    successModalEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }
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
