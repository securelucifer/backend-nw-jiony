import express from 'express';
import { adminLogin, refresh, verifyDeletePassword } from '../controllers/AdminController.js';
import auth from '../middleware/auth.js';


const router = express.Router();

// Admin login (no auth required)
router.post('/admin-login', adminLogin);
router.post("/admin-refresh", auth, refresh);

router.post("/verify-delete-password", auth, verifyDeletePassword);



export default router;