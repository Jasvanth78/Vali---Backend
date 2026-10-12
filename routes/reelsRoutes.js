const express = require('express');
const router = express.Router();
const reelsController = require('../controllers/reelsController');

router.get('/', reelsController.getAllReels);
router.post('/', reelsController.createReel);
router.delete('/:id', reelsController.deleteReel);

module.exports = router;
