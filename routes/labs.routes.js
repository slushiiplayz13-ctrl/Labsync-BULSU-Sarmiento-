'use strict';

const express = require('express');
const router = express.Router();
const labsController = require('../controllers/labs.controller');
const { requireAuth, requireRole, ADMIN_ROLES } = require('../middleware/auth');

router.get('/', requireAuth, labsController.getAllLaboratories);
router.post('/add', requireRole(ADMIN_ROLES), labsController.addLaboratory);
router.put('/:roomId', requireRole(ADMIN_ROLES), labsController.updateLaboratory);
router.delete('/:roomId', requireRole(ADMIN_ROLES), labsController.deleteLaboratory);
router.get('/:roomId/pcs', requireAuth, labsController.getRoomPCs);
router.post('/:roomId/pcs/add', requireRole(ADMIN_ROLES), labsController.addPC);
router.post('/:roomId/pcs/add-bulk', requireRole(ADMIN_ROLES), labsController.addPCsBulk);
router.get('/:roomId/pcs/qrcodes', requireRole(ADMIN_ROLES), labsController.getBatchQRCodes);

module.exports = router;
