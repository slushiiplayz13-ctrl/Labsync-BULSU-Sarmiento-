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
      addRoomModal.style.display = 'flex';
      void addRoomModal.offsetWidth;
      addRoomModal.style.opacity = '1';
      if (modalContent) modalContent.style.transform = 'translateY(0)';
      const input = document.getElementById('roomNumberInput');
      if (input) input.focus();
    }

    function closeModal() {
      addRoomModal.style.opacity = '0';
      if (modalContent) modalContent.style.transform = 'translateY(20px)';
      setTimeout(() => {
        addRoomModal.style.display = 'none';
        const input = document.getElementById('roomNumberInput');
        if (input) input.value = '';
        if (global.setCustomSelectValue) global.setCustomSelectValue('building-select-wrapper', 'Bldg. B');
      }, 300);
    }

    if (addRoomCardBtn) addRoomCardBtn.addEventListener('click', openModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

    addRoomModal.addEventListener('click', (e) => {
      if (e.target === addRoomModal) closeModal();
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
      const idInput = document.getElementById('editRoomIdInput');
      const numInput = document.getElementById('editRoomNumberInput');
      if (idInput) idInput.value = room.Room_ID;
      if (numInput) numInput.value = room.Room_Number;
      if (global.setCustomSelectValue) {
        global.setCustomSelectValue('edit-building-select-wrapper', room.Building || 'Bldg. B');
      }

      editRoomModal.style.display = 'flex';
      void editRoomModal.offsetWidth;
      editRoomModal.style.opacity = '1';
      if (editModalContent) editModalContent.style.transform = 'translateY(0)';
      if (numInput) numInput.focus();
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: editRoomModal });
      }
    }

    function closeEditModal() {
      editRoomModal.style.opacity = '0';
      if (editModalContent) editModalContent.style.transform = 'translateY(20px)';
      setTimeout(() => {
        editRoomModal.style.display = 'none';
        const idInput = document.getElementById('editRoomIdInput');
        const numInput = document.getElementById('editRoomNumberInput');
        if (idInput) idInput.value = '';
        if (numInput) numInput.value = '';
      }, 300);
    }

    global.openEditModal = openEditModal;
    global.closeEditModal = closeEditModal;

    if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModal);
    editRoomModal.addEventListener('click', (e) => {
      if (e.target === editRoomModal) closeEditModal();
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
        const roomId = document.getElementById('editRoomIdInput')?.value;
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

        try {
          const roomController = global.roomController;
          if (roomController && typeof roomController.updateRoom === 'function') {
            await roomController.updateRoom(roomId, roomNum, bldg);
          } else {
            const res = await fetch(`/api/laboratories/${roomId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ roomNumber: roomNum, building: bldg })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update room');
          }

          if (roomController && typeof roomController.loadRooms === 'function') {
            roomController.loadRooms();
          } else if (typeof global.loadRooms === 'function') {
            global.loadRooms();
          }

          closeEditModal();
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

  const roomModal = {
    initNumericRestrictions,
    initAddRoomModal,
    initEditRoomModal
  };

  global.roomModal = roomModal;

})(typeof window !== 'undefined' ? window : this);
