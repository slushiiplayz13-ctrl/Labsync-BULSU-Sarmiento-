/**
 * LabSync Room Modal Manager | js/master-schedule/rooms/room.modal.js
 * Controls Add Room and Edit Room dialog interactions, numeric input masks, and animations.
 */

(function (global) {
  'use strict';

  /**
   * Restricts room number inputs to numeric digits with a maximum length of 3.
   */
  function initNumericRestrictions() {
    const restrictToNumeric = (inputElement) => {
      if (!inputElement) return;
      inputElement.setAttribute('maxlength', '3');
      inputElement.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
      });
      inputElement.addEventListener('keypress', (e) => {
        if (!/[0-9]/.test(e.key)) {
          e.preventDefault();
          return;
        }
        const selection = window.getSelection ? window.getSelection().toString() : '';
        if (e.target.value.length >= 3 && !selection) {
          e.preventDefault();
        }
      });
      inputElement.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData)?.getData('text') || '';
        e.target.value = pasteData.replace(/\D/g, '').slice(0, 3);
      });
    };

    restrictToNumeric(document.getElementById('roomNumberInput'));
    restrictToNumeric(document.getElementById('editRoomNumberInput'));
  }

  /**
   * Initializes Add Room dialog logic and button hooks.
   */
  function initAddRoomModal() {
    const addRoomModal = document.getElementById('addRoomModal');
    if (!addRoomModal) return;

    const modalContent = addRoomModal.querySelector('.modal-content');
    const addRoomCardBtn = document.getElementById('addRoomCardBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const submitRoomBtn = document.getElementById('submitRoomBtn');

    function openModal() {
      const wasAlreadyOpen = addRoomModal.style.display === 'flex' && !addRoomModal.classList.contains('closing');
      addRoomModal.classList.remove('closing');
      addRoomModal.removeAttribute('data-closing');
      addRoomModal.style.display = 'flex';
      addRoomModal.style.pointerEvents = 'auto';
      if (!wasAlreadyOpen && global.setModalOpenState) global.setModalOpenState(true);
      void addRoomModal.offsetWidth;
      addRoomModal.style.opacity = '1';
      if (modalContent) modalContent.style.transform = 'translateY(0)';
      const input = document.getElementById('roomNumberInput');
      if (input) input.focus();
    }

    function closeModal() {
      if (addRoomModal.style.display === 'none' && !addRoomModal.classList.contains('closing')) return;
      addRoomModal.classList.add('closing');
      addRoomModal.setAttribute('data-closing', 'true');
      addRoomModal.style.opacity = '0';
      addRoomModal.style.pointerEvents = 'none';
      if (modalContent) modalContent.style.transform = 'translateY(20px)';
      if (global.setModalOpenState) global.setModalOpenState(false);
      setTimeout(() => {
        addRoomModal.style.display = 'none';
        addRoomModal.classList.remove('closing');
        addRoomModal.removeAttribute('data-closing');
        const input = document.getElementById('roomNumberInput');
        if (input) input.value = '';
        if (global.setCustomSelectValue) global.setCustomSelectValue('building-select-wrapper', 'Bldg. B');
        if (global.setModalOpenState) global.setModalOpenState(null);
      }, 300);
    }

    if (addRoomCardBtn) addRoomCardBtn.addEventListener('click', openModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

    addRoomModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    addRoomModal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    if (submitRoomBtn) {
      submitRoomBtn.addEventListener('click', async () => {
        const roomNumInput = document.getElementById('roomNumberInput');
        const roomNum = roomNumInput ? roomNumInput.value.trim() : '';
        const bldgSelect = document.getElementById('building-select-wrapper');
        const bldgNative = document.getElementById('buildingSelect');
        const bldg = (bldgSelect && bldgSelect.dataset ? bldgSelect.dataset.value : null) || (bldgNative ? bldgNative.value : null) || 'Bldg. B';

        const numVal = parseInt(roomNum, 10);
        if (!roomNum || isNaN(numVal) || numVal < 1 || numVal > 999) {
          if (global.showToast) {
            global.showToast('Room number must be between 1 and 999 (up to 3 digits).', 'warning');
          } else {
            alert('Room number must be between 1 and 999.');
          }
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1200);
          }
          return;
        }

        try {
          const roomController = global.roomController;
          if (roomController && typeof roomController.addRoom === 'function') {
            await roomController.addRoom(roomNum, bldg);
          } else {
            const res = await fetch('/api/laboratories/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ roomNumber: roomNum, building: bldg })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to add room');
          }

          if (roomController && typeof roomController.loadRooms === 'function') {
            roomController.loadRooms();
          } else if (typeof global.loadRooms === 'function') {
            global.loadRooms();
          }

          closeModal();
        } catch (err) {
          alert(err.message || 'An unexpected error occurred.');
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1000);
          }
        }
      });
    }
  }

  /**
   * Initializes Edit Room dialog logic.
   */
  function initEditRoomModal() {
    const editRoomModal = document.getElementById('editRoomModal');
    if (!editRoomModal) return;

    const editModalContent = editRoomModal.querySelector('.modal-content');
    const closeEditModalBtn = document.getElementById('closeEditModalBtn');
    const submitEditRoomBtn = document.getElementById('submitEditRoomBtn');
    const deleteRoomBtn = document.getElementById('deleteRoomBtn');

    function openEditModal(room) {
      if (!room) return;
      let rId = room.Room_ID;
      const rNum = room.Room_Number;
      if (!rId) {
        try {
          const cachedStr = sessionStorage.getItem('labsync_cached_labs');
          if (cachedStr) {
            const cached = JSON.parse(cachedStr);
            const found = cached.find(r => String(r.Room_Number) === String(rNum));
            if (found && found.Room_ID) rId = found.Room_ID;
          }
        } catch (e) {}
      }

      const idInput = document.getElementById('editRoomIdInput');
      const numInput = document.getElementById('editRoomNumberInput');
      if (idInput) idInput.value = rId || '';
      if (numInput) numInput.value = rNum || '';
      if (global.setCustomSelectValue) {
        global.setCustomSelectValue('edit-building-select-wrapper', room.Building || 'Bldg. B');
      }

      const wasAlreadyOpen = editRoomModal.style.display === 'flex' && !editRoomModal.classList.contains('closing');
      editRoomModal.classList.remove('closing');
      editRoomModal.removeAttribute('data-closing');
      editRoomModal.style.display = 'flex';
      editRoomModal.style.pointerEvents = 'auto';
      if (!wasAlreadyOpen && global.setModalOpenState) global.setModalOpenState(true);
      void editRoomModal.offsetWidth;
      editRoomModal.style.opacity = '1';
      if (editModalContent) editModalContent.style.transform = 'translateY(0)';
      if (numInput) numInput.focus();
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: editRoomModal });
      }
    }

    function closeEditModal() {
      if (editRoomModal.style.display === 'none' && !editRoomModal.classList.contains('closing')) return;
      editRoomModal.classList.add('closing');
      editRoomModal.setAttribute('data-closing', 'true');
      editRoomModal.style.opacity = '0';
      editRoomModal.style.pointerEvents = 'none';
      if (editModalContent) editModalContent.style.transform = 'translateY(20px)';
      if (global.setModalOpenState) global.setModalOpenState(false);
      setTimeout(() => {
        editRoomModal.style.display = 'none';
        editRoomModal.classList.remove('closing');
        editRoomModal.removeAttribute('data-closing');
        const idInput = document.getElementById('editRoomIdInput');
        const numInput = document.getElementById('editRoomNumberInput');
        if (idInput) idInput.value = '';
        if (numInput) numInput.value = '';
        if (global.setModalOpenState) global.setModalOpenState(null);
      }, 300);
    }

    global.openEditModal = openEditModal;
    global.closeEditModal = closeEditModal;

    if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModal);
    editRoomModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    editRoomModal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    if (deleteRoomBtn) {
      deleteRoomBtn.addEventListener('click', () => {
        const roomId = document.getElementById('editRoomIdInput')?.value;
        const roomNum = document.getElementById('editRoomNumberInput')?.value.trim() || '';

        if (!roomId) return;
        const roomController = global.roomController;
        if (roomController && typeof roomController.showDeleteRoomConfirmation === 'function') {
          roomController.showDeleteRoomConfirmation(roomId, roomNum);
        } else if (typeof global.deleteRoom === 'function') {
          global.deleteRoom(roomId, roomNum);
        }
      });
    }

    if (submitEditRoomBtn) {
      submitEditRoomBtn.addEventListener('click', async () => {
        let roomId = document.getElementById('editRoomIdInput')?.value;
        const roomNumInput = document.getElementById('editRoomNumberInput');
        const roomNum = roomNumInput ? roomNumInput.value.trim() : '';
        const bldgWrapper = document.getElementById('edit-building-select-wrapper');
        const bldgSelect = document.getElementById('editBuildingSelect');
        const bldg = (bldgWrapper && bldgWrapper.dataset ? bldgWrapper.dataset.value : null) || (bldgSelect ? bldgSelect.value : null) || 'Bldg. B';

        const numVal = parseInt(roomNum, 10);
        if (!roomNum || isNaN(numVal) || numVal < 1 || numVal > 999) {
          if (global.showToast) {
            global.showToast('Room number must be between 1 and 999 (up to 3 digits).', 'warning');
          } else {
            alert('Room number must be between 1 and 999.');
          }
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1200);
          }
          return;
        }

        if (!roomId) {
          try {
            const cachedStr = sessionStorage.getItem('labsync_cached_labs');
            if (cachedStr) {
              const cached = JSON.parse(cachedStr);
              const found = cached.find(r => String(r.Room_Number) === String(roomNum));
              if (found && found.Room_ID) roomId = found.Room_ID;
            }
          } catch (e) {}
        }

        submitEditRoomBtn.disabled = true;

        try {
          const roomController = global.roomController;
          if (roomController && typeof roomController.updateRoom === 'function') {
            await roomController.updateRoom(roomId, roomNum, bldg);
          } else {
            const res = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ roomNumber: roomNum, building: bldg })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update room');
          }

          // Immediately reflect updated building in existing overview room cards (zero-lag UI state update)
          if (roomController && typeof roomController.updateRoomCardInUI === 'function') {
            roomController.updateRoomCardInUI(roomId, roomNum, bldg);
          }

          // Update cached laboratories in sessionStorage
          try {
            const cachedStr = sessionStorage.getItem('labsync_cached_labs');
            if (cachedStr) {
              const cached = JSON.parse(cachedStr);
              if (Array.isArray(cached)) {
                const item = cached.find(r => (roomId && String(r.Room_ID) === String(roomId)) || String(r.Room_Number) === String(roomNum));
                if (item) {
                  item.Building = bldg;
                  item.Room_Number = roomNum;
                }
                sessionStorage.setItem('labsync_cached_labs', JSON.stringify(cached));
              }
            }
          } catch (e) {}

          // Synchronize room data with backend
          if (roomController && typeof roomController.loadRooms === 'function') {
            roomController.loadRooms();
          } else if (typeof global.loadRooms === 'function') {
            global.loadRooms();
          }

          closeEditModal();

          if (global.showToast) {
            global.showToast(`Room ${roomNum} updated successfully.`, 'success');
          }
        } catch (err) {
          alert(err.message || 'An unexpected error occurred.');
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1000);
          }
        } finally {
          submitEditRoomBtn.disabled = false;
        }
      });
    }
  }

  const roomModal = {
    initNumericRestrictions,
    initAddRoomModal,
    initEditRoomModal
  };

  global.roomModal = roomModal;

})(typeof window !== 'undefined' ? window : this);
