const express = require('express');
const { 
  adminLogin, 
  getDashboardStats, 
  createRasiPalan, 
  updateRasiPalan,
  deleteRasiPalan,
  getAllRasiPalan, 
  createPanchangam, 
  deletePanchangam,
  getAllPanchangam, 
  createFestival, 
  deleteFestival,
  getAllFestivals, 
  createMugurtham,
  updateMugurtham,
  deleteMugurtham,
  getAllMugurtham,
  createNallaNeram,
  deleteNallaNeram,
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
router.put('/rasi-palan/:id', updateRasiPalan);
router.delete('/rasi-palan/:id', deleteRasiPalan);
router.post('/rasi-palan/bulk', bulkCreateRasiPalan);
router.get('/rasi-palan', getAllRasiPalan);

// Panchangam
router.post('/panchangam', createPanchangam);
router.delete('/panchangam/:id', deletePanchangam);
router.get('/panchangam', getAllPanchangam);

// Festivals
router.post('/festivals', createFestival);
router.delete('/festivals/:id', deleteFestival);
router.get('/festivals', getAllFestivals);

// Mugurtham
router.post('/mugurtham', createMugurtham);
router.put('/mugurtham/:id', updateMugurtham);
router.delete('/mugurtham/:id', deleteMugurtham);
router.get('/mugurtham', getAllMugurtham);

// Nalla Neram
router.post('/nalla-neram', createNallaNeram);
router.delete('/nalla-neram/:id', deleteNallaNeram);
router.get('/nalla-neram', getAllNallaNeram);

// Users
router.get('/users', getAllUsers);

module.exports = router;
