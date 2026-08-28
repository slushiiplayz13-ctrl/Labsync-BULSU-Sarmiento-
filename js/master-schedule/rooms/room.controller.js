/**
 * LabSync Room Controller | js/master-schedule/rooms/room.controller.js
 * Manages laboratory room fetching, creation, deletion confirmations, and room grid updates.
 */

(function (global) {
  'use strict';

  /**
   * Fetches and renders all active laboratories into the master schedule room selection grid.
   */
  async function loadRooms() {
    try {
      let rooms = [];
      const labService = global.laboratoryService;
      if (labService && typeof labService.fetchLaboratories === 'function') {
        rooms = await labService.fetchLaboratories();
      } else {
        const res = await fetch('/api/laboratories', { credentials: 'include' });
        if (res.ok) rooms = await res.json();
      }

      const grid = document.querySelector('.room-selection-grid');
      if (!grid) return;

      const cards = grid.querySelectorAll('.room-select-card:not(#addRoomCardBtn)');
      cards.forEach(c => c.remove());

      const renderer = global.roomRenderer;
      rooms.forEach(room => {
        if (renderer && typeof renderer.createRoomCard === 'function') {
          const card = renderer.createRoomCard(room, (r) => {
            if (global.openEditModal) global.openEditModal(r);
          });
          grid.appendChild(card);
        }
      });

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: grid });
      }
    } catch (err) {
      console.error('[RoomController] Error loading rooms:', err);
      if (global.showToast) {
        global.showToast('Failed to load laboratory rooms.', 'error');
      }
    }
  }

  /**
   * Adds a new laboratory room via API.
   * @param {string|number} roomNumber
   * @param {string} building
   */
  async function addRoom(roomNumber, building) {
    const labService = global.laboratoryService;
    if (labService && typeof labService.addLaboratory === 'function') {
      return await labService.addLaboratory(roomNumber, building);
    }
    const res = await fetch('/api/laboratories/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomNumber, building })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add room');
    return data;
  }

  /**
   * Updates an existing laboratory room via API.
   * @param {number|string} roomId
   * @param {string|number} roomNumber
   * @param {string} building
   */
  async function updateRoom(roomId, roomNumber, building) {
    const labService = global.laboratoryService;
    if (labService && typeof labService.updateLaboratory === 'function') {
      return await labService.updateLaboratory(roomId, roomNumber, building);
    }
    const res = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomNumber, building })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update room');
    return data;
  }

  /**
   * Deletes a laboratory room with confirmation.
   * @param {number|string} roomId
   * @param {string|number} [roomNum]
   */
  function showDeleteRoomConfirmation(roomId, roomNum = '') {
    const modal = document.createElement('div');
    modal.id = 'delete-confirm-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1100;opacity:0;transition:opacity 0.25s ease;';

    const escapeFn = global.escapeHtml || window.escapeHtml || ((s) => s || '');

    modal.innerHTML = `
      <div style="background:var(--bg-white);color:var(--text-dark);border:1px solid var(--border-light);border-radius:18px;width:90%;max-width:400px;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,0.3);transform:translateY(20px);transition:transform 0.25s ease;text-align:center;">
        <div style="width:56px;height:56px;background:rgba(239,68,68,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;color:#EF4444;">
          <i data-lucide="trash-2" style="width:28px;height:28px;"></i>
        </div>

        <h2 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 10px 0;">Delete Laboratory Room</h2>

        <p style="margin:0 0 24px 0;font-size:14px;color:var(--text-mid);font-family:var(--font-body);line-height:1.5;">
          Are you sure you want to delete <strong>Room ${escapeFn(roomNum)}</strong>? This action will permanently remove the laboratory and all associated schedules and PC units.
        </p>

        <div style="display:flex;gap:12px;font-family:var(--font-body);">
          <button id="cancel-delete-room-btn" type="button" style="flex:1;padding:12px;border:1px solid var(--border-light);background:var(--bg-card);border-radius:8px;font-size:14px;font-weight:600;color:var(--text-dark);cursor:pointer;transition:all 0.2s;">Cancel</button>
          <button id="confirm-delete-room-btn" type="button" style="flex:1;padding:12px;border:none;background:#EF4444;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(239,68,68,0.25);">Delete</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => {
      modal.style.opacity = '1';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(0)';
    }, 10);

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    const closeConfirmModal = () => {
      modal.style.opacity = '0';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(20px)';
      setTimeout(() => modal.remove(), 250);
    };

    const cancelBtn = document.getElementById('cancel-delete-room-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeConfirmModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeConfirmModal();
    });

    const confirmBtn = document.getElementById('confirm-delete-room-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        try {
          const labService = global.laboratoryService;
          if (labService && typeof labService.deleteLaboratory === 'function') {
            await labService.deleteLaboratory(roomId);
          } else {
            const res = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete room');
          }

          closeConfirmModal();
          loadRooms();
          if (global.closeEditModal) global.closeEditModal();
          if (global.showToast) {
            global.showToast(`Room ${roomNum} deleted successfully.`, 'success');
          }
        } catch (err) {
          alert(err.message || 'An unexpected error occurred.');
        }
      });
    }
  }

  const roomController = {
    loadRooms,
    addRoom,
    updateRoom,
    showDeleteRoomConfirmation
  };

  global.roomController = roomController;
  global.loadRooms = loadRooms;
  global.deleteRoom = showDeleteRoomConfirmation;

})(typeof window !== 'undefined' ? window : this);
