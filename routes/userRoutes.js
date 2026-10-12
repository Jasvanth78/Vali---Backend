const express = require('express');
const weather = require('../utils/weather');
const { loginUser, getUserProfile, updateUserProfile, selectRasi, getRasiPalan, getDailyPanchangam, getFestivals, getMugurtham, getNallaNeram, askAIJothidar, getUserNotifications, deleteUserAccount, getCalendarEvents, submitContactMessage } = require('../controllers/userController');
const { getAppContent, getAppCards, getAllBlogs, getAllEvents, getAllVastuSasthiram, getAllSakunam } = require('../controllers/adminController');

const router = express.Router();

router.post('/login', loginUser);
router.get('/profile/:email', getUserProfile);
router.put('/update-profile', updateUserProfile);
router.post('/select-rasi', selectRasi);
router.get('/daily', getRasiPalan);
router.get('/rasi-palan', getRasiPalan);
router.get('/panchangam', getDailyPanchangam);
router.get('/festivals', getFestivals);
router.get('/mugurtham', getMugurtham);
router.get('/nalla-neram', getNallaNeram);
router.get('/calendar', getCalendarEvents);
router.post('/ai-chat', askAIJothidar);
router.get('/app-content', getAppContent);
router.get('/weather/cities', async (req, res) => {
  try { res.json(await weather.searchCities(req.query.name)); }
  catch (error) { res.status(error.status || 502).json({ error: error.message }); }
});
router.get('/weather', async (req, res) => {
  try { res.json(await weather.currentWeather(req.query)); }
  catch (error) { res.status(error.status || 502).json({ error: error.message }); }
});
router.get('/app-cards', getAppCards);
router.get('/blogs', getAllBlogs);
router.get('/events', getAllEvents);
router.get('/vastu', getAllVastuSasthiram);
router.get('/sakunam', getAllSakunam);
router.get('/notifications/:email', getUserNotifications);
router.delete('/delete-account/:email', deleteUserAccount);
router.post('/contact-us', submitContactMessage);

module.exports = router;

