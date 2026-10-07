/**
 * LabSync Room Renderer | js/master-schedule/rooms/room.renderer.js
 * Generates room select cards, edit buttons, and room grid elements for master schedule page.
 */

(function (global) {
  'use strict';

  function getEscapeFn() {
    return global.escapeHtml || window.escapeHtml || ((s) => s || '');
  }

  /**
   * Creates a room selection card DOM element.
   * @param {Object} room - {Room_ID, Room_Number, Building}
   * @param {Function} [onEdit] - Edit button callback
   * @returns {HTMLElement}
   */
  function createRoomCard(room, onEdit) {
    const escapeFn = getEscapeFn();
    const card = document.createElement('div');
    card.className = 'room-select-card';
    card.dataset.roomId = room.Room_ID || '';
    card.dataset.roomNumber = room.Room_Number || '';
    card.dataset.building = room.Building || 'Bldg. B';
    card.onclick = () => {
      window.location.href = `room-schedule-editor.html?room=${encodeURIComponent(room.Room_Number)}&bldg=${encodeURIComponent(room.Building || 'Bldg. B')}`;
    };

    const isFinalized = (room.Status === 'Finalized' || room.scheduleStatus === 'Finalized');
    const statusText = isFinalized ? 'OFFICIAL' : 'DRAFT';
    const statusBadgeStyle = isFinalized 
      ? 'background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;' 
      : 'background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1;';

    card.innerHTML = `
      <button class="room-edit-btn" type="button" title="Edit Room">
        <i data-lucide="edit-2" style="width: 16px; height: 16px;"></i>
      </button>
      <div class="rsc-icon">
        <i data-lucide="monitor" style="width: 36px; height: 36px;"></i>
      </div>
      <div class="rsc-title">Room ${escapeFn(room.Room_Number)}</div>
      <div class="rsc-subtitle">${escapeFn(room.Building || 'Bldg. B')}</div>
      <div class="rsc-status-badge ${isFinalized ? 'badge-finalized' : 'badge-draft'}" style="display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 2px 8px; border-radius: 9999px; margin-top: 6px; ${statusBadgeStyle}">
        ${statusText}
      </div>
    `;

    const editBtn = card.querySelector('.room-edit-btn');
    if (editBtn) {
      editBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof onEdit === 'function') {
          onEdit(room);
        } else if (global.openEditModal) {
          global.openEditModal(room);
        }
      };
    }

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: card });
    }

    return card;
  }

  const roomRenderer = {
    createRoomCard
  };

  global.roomRenderer = roomRenderer;

})(typeof window !== 'undefined' ? window : this);
