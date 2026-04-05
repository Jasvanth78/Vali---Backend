const express = require('express');
const { 
  adminLogin, 
  getDashboardStats, 
  createRasiPalan, 
  getAllRasiPalan, 
  createPanchangam, 
  getAllPanchangam, 
  createFestival, 
  getAllFestivals, 
  createMugurtham,
  getAllMugurtham,
  createNallaNeram,
  getAllNallaNeram,
  bulkCreateRasiPalan,
  getAllUsers,
  getAppContent,
  updateAppContent,
  manualSendNotification,
  getAppCards,
  upsertAppCard,
  deleteAppCard
} = require('../controllers/adminController');
const { protect } = require('../utils/auth');

const router = express.Router();

router.post('/login', adminLogin);
router.get('/dashboard', getDashboardStats);
router.post('/send-notification', manualSendNotification);

// App Content
router.get('/app-content', getAppContent);
router.put('/app-content', updateAppContent);

// App Cards
router.get('/app-cards', getAppCards);
router.post('/app-cards', upsertAppCard);
router.put('/app-cards/:id', upsertAppCard);
router.delete('/app-cards/:id', deleteAppCard);

// Rasi Palan
router.post('/rasi-palan', createRasiPalan);
router.post('/rasi-palan/bulk', bulkCreateRasiPalan);
router.get('/rasi-palan', getAllRasiPalan);

// Panchangam
router.post('/panchangam', createPanchangam);
router.get('/panchangam', getAllPanchangam);

// Festivals
router.post('/festivals', createFestival);
router.get('/festivals', getAllFestivals);

// Mugurtham
router.post('/mugurtham', createMugurtham);
router.get('/mugurtham', getAllMugurtham);

// Nalla Neram
router.post('/nalla-neram', createNallaNeram);
router.get('/nalla-neram', getAllNallaNeram);

// Users
router.get('/users', getAllUsers);

module.exports = router;
