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
    card.onclick = () => {
      window.location.href = `room-schedule-editor.html?room=${encodeURIComponent(room.Room_Number)}&bldg=${encodeURIComponent(room.Building || 'Building B')}`;
    };

    card.innerHTML = `
      <button class="room-edit-btn" type="button" title="Edit Room">
        <i data-lucide="edit-2" style="width: 16px; height: 16px;"></i>
      </button>
      <div class="rsc-icon">
        <i data-lucide="monitor" style="width: 36px; height: 36px;"></i>
      </div>
      <div class="rsc-title">Room ${escapeFn(room.Room_Number)}</div>
      <div class="rsc-subtitle">${escapeFn(room.Building || 'Bldg. B')}</div>
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
