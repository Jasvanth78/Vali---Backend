const express = require('express');
const { 
  adminLogin, 
  getDashboardStats, 
  createRasiPalan, 
  updateRasiPalan,
  deleteRasiPalan,
  getAllRasiPalan, 
  createPanchangam, 
  updatePanchangam,
  deletePanchangam,
  getAllPanchangam, 
  createFestival, 
  updateFestival,
  deleteFestival,
  getAllFestivals, 
  createMugurtham,
  updateMugurtham,
  deleteMugurtham,
  getAllMugurtham,
  createNallaNeram,
  updateNallaNeram,
  deleteNallaNeram,
  getAllNallaNeram,
  bulkCreateRasiPalan,
  bulkCreatePanchangam,
  bulkCreateFestival,
  bulkCreateMugurtham,
  bulkCreateNallaNeram,
  getAllUsers,
  getAppContent,
  updateAppContent,
  manualSendNotification,
  getAppCards,
  upsertAppCard,
  deleteAppCard,
  createBlog,
  getAllBlogs,
  updateBlog,
  deleteBlog,
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent
} = require('../controllers/adminController');
const { protect } = require('../utils/auth');

const router = express.Router();

router.post('/login', adminLogin);
router.get('/dashboard', getDashboardStats);
router.post('/send-notification', manualSendNotification);

// Blogs
router.get('/blogs', getAllBlogs);
router.post('/blogs', createBlog);
router.put('/blogs/:id', updateBlog);
router.delete('/blogs/:id', deleteBlog);

// Events
router.get('/events', getAllEvents);
router.post('/events', createEvent);
router.put('/events/:id', updateEvent);
router.delete('/events/:id', deleteEvent);

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
router.put('/panchangam/:id', updatePanchangam);
router.delete('/panchangam/:id', deletePanchangam);
router.post('/panchangam/bulk', bulkCreatePanchangam);
router.get('/panchangam', getAllPanchangam);

// Festivals
router.post('/festivals', createFestival);
router.put('/festivals/:id', updateFestival);
router.delete('/festivals/:id', deleteFestival);
router.post('/festivals/bulk', bulkCreateFestival);
router.get('/festivals', getAllFestivals);

// Mugurtham
router.post('/mugurtham', createMugurtham);
router.put('/mugurtham/:id', updateMugurtham);
router.delete('/mugurtham/:id', deleteMugurtham);
router.post('/mugurtham/bulk', bulkCreateMugurtham);
router.get('/mugurtham', getAllMugurtham);

// Nalla Neram
router.post('/nalla-neram', createNallaNeram);
router.put('/nalla-neram/:id', updateNallaNeram);
router.delete('/nalla-neram/:id', deleteNallaNeram);
router.post('/nalla-neram/bulk', bulkCreateNallaNeram);
router.get('/nalla-neram', getAllNallaNeram);

// Users
router.get('/users', getAllUsers);

module.exports = router;

