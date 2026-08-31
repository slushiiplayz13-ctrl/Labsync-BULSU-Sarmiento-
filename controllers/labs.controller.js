'use strict';

const laboratoryService = require('../services/laboratoryService');
const auditService = require('../services/auditService');

async function getAllLaboratories(req, res, next) {
    try {
        const result = await laboratoryService.getAllLaboratories();
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function addLaboratory(req, res, next) {
    try {
        const { roomNumber, building } = req.body;
        const result = await laboratoryService.addLaboratory(roomNumber, building, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'LAB_CREATE',
            resourceType: 'LABORATORY',
            resourceId: result.roomId,
            details: { roomNumber, building },
            result: 'SUCCESS'
        });

        return res.status(result.status).json({ message: result.message, roomId: result.roomId });
    } catch (err) {
        next(err);
    }
}

async function updateLaboratory(req, res, next) {
    try {
        const { roomId } = req.params;
        const { roomNumber, building } = req.body;
        const result = await laboratoryService.updateLaboratory(roomId, roomNumber, building);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function deleteLaboratory(req, res, next) {
    try {
        const { roomId } = req.params;
        const result = await laboratoryService.deleteLaboratory(roomId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'LAB_DELETE',
            resourceType: 'LABORATORY',
            resourceId: roomId,
            result: 'SUCCESS'
        });

        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function getRoomPCs(req, res, next) {
    try {
        const { roomId } = req.params;
        const result = await laboratoryService.getRoomPCs(roomId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function addPC(req, res, next) {
    try {
        const { roomId } = req.params;
        const { pcNumber } = req.body;
        const result = await laboratoryService.addPC(roomId, pcNumber);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'PC_CREATE',
            resourceType: 'PC',
            resourceId: result.pcId,
            details: { roomId, pcNumber: result.pcNumber },
            result: 'SUCCESS'
        });

        return res.status(result.status).json({ message: result.message, pcId: result.pcId, pcNumber: result.pcNumber });
    } catch (err) {
        next(err);
    }
}

async function addPCsBulk(req, res, next) {
    try {
        const { roomId } = req.params;
        const { pcNumbers } = req.body;
        const result = await laboratoryService.addPCsBulk(roomId, pcNumbers);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'PC_CREATE',
            resourceType: 'PC',
            resourceId: roomId,
            details: { count: Array.isArray(pcNumbers) ? pcNumbers.length : 0 },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function deletePC(req, res, next) {
    try {
        const { pcId } = req.params;
        const result = await laboratoryService.deletePC(pcId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'PC_DELETE',
            resourceType: 'PC',
            resourceId: pcId,
            result: 'SUCCESS'
        });

        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function deletePCsBulk(req, res, next) {
    try {
        const { roomId } = req.params;
        const { pcIds } = req.body;
        const result = await laboratoryService.deletePCsBulk(roomId, pcIds);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'PC_BULK_DELETE',
            resourceType: 'PC',
            resourceId: roomId,
            details: { count: result.data.deletedCount, pcIds },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getPCQRCode(req, res, next) {
    try {
        const { pcId } = req.params;
        const result = await laboratoryService.getPCQRCode(pcId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getBatchQRCodes(req, res, next) {
    try {
        const { roomId } = req.params;
        const result = await laboratoryService.getBatchQRCodes(roomId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getAllLaboratories,
    addLaboratory,
    updateLaboratory,
    deleteLaboratory,
    getRoomPCs,
    addPC,
    addPCsBulk,
    deletePC,
    deletePCsBulk,
    getPCQRCode,
    getBatchQRCodes
};
