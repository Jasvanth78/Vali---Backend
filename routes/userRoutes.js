const express = require('express');
const { loginUser, getUserProfile, updateUserProfile, selectRasi, getRasiPalan, getDailyPanchangam, getFestivals, getMugurtham, getNallaNeram, askAIJothidar } = require('../controllers/userController');

const router = express.Router();

router.post('/login', loginUser);
router.get('/profile/:email', getUserProfile);
router.put('/update-profile', updateUserProfile);
router.post('/select-rasi', selectRasi);
router.get('/daily', getRasiPalan);
router.get('/panchangam', getDailyPanchangam);
router.get('/festivals', getFestivals);
router.get('/mugurtham', getMugurtham);
router.get('/nalla-neram', getNallaNeram);
router.post('/ai-chat', askAIJothidar);

module.exports = router;
