'use strict';

const express = require('express');
const router = express.Router();
const labsController = require('../controllers/labs.controller');
const { requireAuth, requireRole, IT_HEAD_ROLES, MIS_STAFF_ROLES } = require('../middleware/auth');

router.get('/', requireAuth, labsController.getAllLaboratories);
router.post('/add', requireRole(IT_HEAD_ROLES), labsController.addLaboratory);
router.put('/:roomId', requireRole(IT_HEAD_ROLES), labsController.updateLaboratory);
router.delete('/:roomId', requireRole(IT_HEAD_ROLES), labsController.deleteLaboratory);
router.get('/:roomId/pcs', requireAuth, labsController.getRoomPCs);
router.post('/:roomId/pcs/add', requireRole(MIS_STAFF_ROLES), labsController.addPC);
router.post('/:roomId/pcs/add-bulk', requireRole(MIS_STAFF_ROLES), labsController.addPCsBulk);
router.delete('/:roomId/pcs/bulk', requireRole(MIS_STAFF_ROLES), labsController.deletePCsBulk);
router.get('/:roomId/pcs/qrcodes', requireRole(MIS_STAFF_ROLES), labsController.getBatchQRCodes);

module.exports = router;
