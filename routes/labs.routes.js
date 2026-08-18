'use strict';

const express = require('express');
const router = express.Router();
const labsController = require('../controllers/labs.controller');

router.get('/', labsController.getAllLaboratories);
router.post('/add', labsController.addLaboratory);
router.put('/:roomId', labsController.updateLaboratory);
router.delete('/:roomId', labsController.deleteLaboratory);
router.get('/:roomId/pcs', labsController.getRoomPCs);
router.post('/:roomId/pcs/add', labsController.addPC);
router.post('/:roomId/pcs/add-bulk', labsController.addPCsBulk);
router.get('/:roomId/pcs/qrcodes', labsController.getBatchQRCodes);

module.exports = router;

