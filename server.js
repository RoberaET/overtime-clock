const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowEIO3: true
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage for sessions
const sessions = new Map();

// Track overtime hours per user (in a real app, this would be in a database)
const userOvertimeTracking = new Map();

// Ethiopian Labor Law Constants (Labor Proclamation No. 1156/2019)
const OVERTIME_LIMITS = {
  MAX_HOURS_PER_DAY: 4,
  MAX_HOURS_PER_WEEK: 12,
  MAX_HOURS_PER_YEAR: 100
};

const OVERTIME_MULTIPLIERS = {
  'normal': 1.5,
  'night': 1.75,
  'sunday': 2.0,
  'holiday': 2.5
};

// Validation functions
function validateOvertimeHours(hours, type, userId = 'default') {
  const errors = [];
  const warnings = [];
  
  if (hours <= 0) {
    errors.push('Overtime hours must be greater than 0');
  }
  
  // Check daily limit
  if (hours > OVERTIME_LIMITS.MAX_HOURS_PER_DAY) {
    warnings.push(`⚠️ Warning: Exceeding legal limit of ${OVERTIME_LIMITS.MAX_HOURS_PER_DAY} hours per day`);
  }
  
  // Check weekly limit (simplified - in real app would track actual week)
  const userTracking = userOvertimeTracking.get(userId) || { weekly: 0, yearly: 0 };
  const newWeeklyTotal = userTracking.weekly + hours;
  if (newWeeklyTotal > OVERTIME_LIMITS.MAX_HOURS_PER_WEEK) {
    warnings.push(`⚠️ Warning: This would exceed weekly limit of ${OVERTIME_LIMITS.MAX_HOURS_PER_WEEK} hours (current: ${userTracking.weekly.toFixed(1)}h + ${hours}h = ${newWeeklyTotal.toFixed(1)}h)`);
  }
  
  // Check yearly limit
  const newYearlyTotal = userTracking.yearly + hours;
  if (newYearlyTotal > OVERTIME_LIMITS.MAX_HOURS_PER_YEAR) {
    warnings.push(`⚠️ Warning: This would exceed yearly limit of ${OVERTIME_LIMITS.MAX_HOURS_PER_YEAR} hours (current: ${userTracking.yearly.toFixed(1)}h + ${hours}h = ${newYearlyTotal.toFixed(1)}h)`);
  }
  
  if (hours > 8) {
    warnings.push('⚠️ Warning: Very high overtime hours may not be sustainable');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

function calculateHourlyRate(salary, dailyHours) {
  return salary / (30 * dailyHours);
}

function calculateOvertimePay(salary, dailyHours, overtimeType, hours) {
  const hourlyRate = calculateHourlyRate(salary, dailyHours);
  const multiplier = OVERTIME_MULTIPLIERS[overtimeType] || 1.5;
  const totalPay = hourlyRate * multiplier * hours;
  const ratePerSecond = totalPay / (hours * 3600);
  
  return {
    hourlyRate,
    multiplier,
    totalPay,
    ratePerSecond
  };
}

function calculateOvertimePayFromRate(hourlyRate, overtimeType, hours) {
  const multiplier = OVERTIME_MULTIPLIERS[overtimeType] || 1.5;
  const totalPay = hourlyRate * multiplier * hours;
  const ratePerSecond = totalPay / (hours * 3600);
  
  return {
    hourlyRate,
    multiplier,
    totalPay,
    ratePerSecond
  };
}

function updateUserOvertimeTracking(userId, hours) {
  const current = userOvertimeTracking.get(userId) || { weekly: 0, yearly: 0 };
  current.weekly += hours;
  current.yearly += hours;
  userOvertimeTracking.set(userId, current);
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/calculate', (req, res) => {
  const { hourlyRate, overtimeType, hours } = req.body;
  
  // Validate input
  if (!hourlyRate || !overtimeType) {
    return res.status(400).json({
      error: 'Hourly rate and overtime type are required'
    });
  }
  
  if (hourlyRate <= 0) {
    return res.status(400).json({
      error: 'Invalid hourly rate'
    });
  }
  
  // If no hours provided, use 1 hour for calculation preview
  const hoursToUse = hours || 1;
  
  const validation = validateOvertimeHours(hoursToUse, overtimeType);
  if (!validation.isValid) {
    return res.status(400).json({
      error: validation.errors.join(', ')
    });
  }
  
  const calculation = calculateOvertimePayFromRate(hourlyRate, overtimeType, hoursToUse);
  
  res.json({
    success: true,
    calculation,
    warnings: validation.warnings,
    isPreview: !hours // Indicate if this is a preview calculation
  });
});

app.post('/api/start-session', (req, res) => {
  const { hourlyRate, overtimeType, hours } = req.body;
  
  // Validate input
  if (!hourlyRate || !overtimeType) {
    return res.status(400).json({
      error: 'Hourly rate and overtime type are required'
    });
  }
  
  if (hourlyRate <= 0) {
    return res.status(400).json({
      error: 'Invalid hourly rate'
    });
  }
  
  // If no hours provided, start open-ended session
  const totalHours = hours || null;
  const hoursToUse = totalHours || 1; // Use 1 hour for initial calculation
  
  const validation = validateOvertimeHours(hoursToUse, overtimeType);
  if (!validation.isValid) {
    return res.status(400).json({
      error: validation.errors.join(', ')
    });
  }
  
  const calculation = calculateOvertimePayFromRate(hourlyRate, overtimeType, hoursToUse);
  const sessionId = Date.now().toString();
  
  sessions.set(sessionId, {
    id: sessionId,
    hourlyRate,
    overtimeType,
    totalHours: totalHours, // null for open-ended
    calculation,
    startTime: new Date(),
    isActive: true,
    currentEarnings: 0,
    warnings: validation.warnings,
    isOpenEnded: !totalHours
  });
  
  res.json({
    success: true,
    sessionId,
    calculation,
    warnings: validation.warnings,
    isOpenEnded: !totalHours
  });
});

app.post('/api/stop-session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({
      error: 'Session not found'
    });
  }
  
  session.isActive = false;
  session.endTime = new Date();
  session.duration = (session.endTime - session.startTime) / 1000; // in seconds
  
  // Update user overtime tracking
  updateUserOvertimeTracking('default', session.totalHours);
  
  res.json({
    success: true,
    session
  });
});

app.get('/api/sessions', (req, res) => {
  const allSessions = Array.from(sessions.values());
  res.json({
    success: true,
    sessions: allSessions
  });
});

app.get('/api/overtime-tracking', (req, res) => {
  const tracking = userOvertimeTracking.get('default') || { weekly: 0, yearly: 0 };
  res.json({
    success: true,
    tracking,
    limits: OVERTIME_LIMITS
  });
});

// Get session status (for polling fallback)
app.get('/api/session-status/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  if (session.isActive) {
    const now = new Date();
    const elapsedSeconds = (now - session.startTime) / 1000;
    
    if (session.isOpenEnded) {
      session.currentEarnings = session.calculation.ratePerSecond * elapsedSeconds;
      session.elapsedTime = elapsedSeconds;
      session.remainingTime = null;
    } else {
      const maxSeconds = session.totalHours * 3600;
      if (elapsedSeconds < maxSeconds) {
        session.currentEarnings = session.calculation.ratePerSecond * elapsedSeconds;
        session.elapsedTime = elapsedSeconds;
        session.remainingTime = maxSeconds - elapsedSeconds;
      } else {
        session.isActive = false;
        session.endTime = now;
        session.duration = elapsedSeconds;
        session.currentEarnings = session.calculation.totalPay;
        session.elapsedTime = elapsedSeconds;
        session.remainingTime = 0;
      }
    }
  }
  
  res.json({
    success: true,
    session: {
      currentEarnings: session.currentEarnings,
      elapsedTime: session.elapsedTime,
      remainingTime: session.remainingTime,
      isOpenEnded: session.isOpenEnded,
      isActive: session.isActive
    }
  });
});

// Socket.io for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send connection confirmation
  socket.emit('connected', { 
    message: 'Connected to server',
    timestamp: new Date().toISOString()
  });
  
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    const session = sessions.get(sessionId);
    if (session) {
      socket.emit('session-data', session);
    }
  });
  
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Real-time counter update
setInterval(() => {
  sessions.forEach((session, sessionId) => {
    if (session.isActive) {
      const now = new Date();
      const elapsedSeconds = (now - session.startTime) / 1000;
      
      if (session.isOpenEnded) {
        // Open-ended session - no time limit
        session.currentEarnings = session.calculation.ratePerSecond * elapsedSeconds;
        
        io.to(sessionId).emit('earnings-update', {
          currentEarnings: session.currentEarnings,
          elapsedTime: elapsedSeconds,
          remainingTime: null, // No time limit
          isOpenEnded: true
        });
      } else {
        // Fixed duration session
        const maxSeconds = session.totalHours * 3600;
        
        if (elapsedSeconds < maxSeconds) {
          session.currentEarnings = session.calculation.ratePerSecond * elapsedSeconds;
          
          io.to(sessionId).emit('earnings-update', {
            currentEarnings: session.currentEarnings,
            elapsedTime: elapsedSeconds,
            remainingTime: maxSeconds - elapsedSeconds,
            isOpenEnded: false
          });
        } else {
          session.isActive = false;
          session.endTime = now;
          session.duration = elapsedSeconds;
          session.currentEarnings = session.calculation.totalPay;
          
          io.to(sessionId).emit('session-complete', {
            finalEarnings: session.currentEarnings,
            totalDuration: elapsedSeconds
          });
        }
      }
    }
  });
}, 1000); // Update every second

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to use the overtime counter`);
});
