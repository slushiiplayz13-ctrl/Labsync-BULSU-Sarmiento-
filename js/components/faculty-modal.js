/**
 * LabSync Faculty Modals Facade | js/components/faculty-modal.js
 * Thin compatibility facade coordinating modular faculty dialogs:
 *   - js/faculty/modals/add-faculty.modal.js
 *   - js/faculty/modals/edit-role.modal.js
 *   - js/faculty/modals/transfer-leadership.modal.js
 *   - js/faculty/modals/delete-faculty.modal.js
 */

(function (global) {
  'use strict';

  const facultyModal = {
    showAddFacultyModal(onSuccess) {
      if (global.addFacultyModal && typeof global.addFacultyModal.showAddFacultyModal === 'function') {
        return global.addFacultyModal.showAddFacultyModal(onSuccess);
      }
    },
    changeFacultyRole(userId, name, currentRole, onSuccess) {
      if (global.editRoleModal && typeof global.editRoleModal.changeFacultyRole === 'function') {
        return global.editRoleModal.changeFacultyRole(userId, name, currentRole, onSuccess);
      }
    },
    showTransferConfirmation(name, onConfirm, onCancel) {
      if (global.transferLeadershipModal && typeof global.transferLeadershipModal.showTransferConfirmation === 'function') {
        return global.transferLeadershipModal.showTransferConfirmation(name, onConfirm, onCancel);
      }
    },
    showSuccessGreetingModal(newName) {
      if (global.transferLeadershipModal && typeof global.transferLeadershipModal.showSuccessGreetingModal === 'function') {
        return global.transferLeadershipModal.showSuccessGreetingModal(newName);
      }
    },
    confirmDeleteFaculty(userId, name, onSuccess) {
      if (global.deleteFacultyModal && typeof global.deleteFacultyModal.confirmDeleteFaculty === 'function') {
        return global.deleteFacultyModal.confirmDeleteFaculty(userId, name, onSuccess);
      }
    }
  };

  global.facultyModal = facultyModal;
  global.showAddFacultyModal = facultyModal.showAddFacultyModal;
  global.changeFacultyRole = facultyModal.changeFacultyRole;
  global.confirmDeleteFaculty = facultyModal.confirmDeleteFaculty;

})(typeof window !== 'undefined' ? window : this);
