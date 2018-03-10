const express = require('express');
const router = express.Router();
const showBracketController = require('../controllers/showBracketController');
const updateBracketController = require('../controllers/updateBracketController');
const standingsController = require('../controllers/standingsController');
const poolController = require('../controllers/poolController');

// show master/add/edit user brackets
router.get('/', showBracketController.showBracket);
router.post('/', updateBracketController.insertUserPicks);

// show/edit user bracket
router.get('/bracket/:userToken', showBracketController.showBracket);
router.get('/bracket/:userToken/e', showBracketController.updateBracket);
router.post('/bracket/:userToken/e', updateBracketController.updateUserPicks);

// set/get pool info
router.get('/pool', poolController.showPoolForm);
router.post('/pool', poolController.getPostedPoolInfo);
router.get('/pool/:poolName', poolController.getPoolInfo);
router.get('/demo', poolController.setDemoMode);

// show standings
router.get('/standings', standingsController.showFullStandings);
router.get('/standings/sweet16', standingsController.showSweet16Standings);

// admin functions
router.get('/admin/update', showBracketController.updateAdminBracket);
router.post('/admin/update', updateBracketController.updateAdminPicks);
router.get('/admin/bracket', showBracketController.showNewBracketForm);
router.post('/admin/bracket', updateBracketController.initializeNewBracket);

module.exports = router;
