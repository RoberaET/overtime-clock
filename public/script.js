// Global variables
let socket;
let currentSession = null;
let isCounterRunning = false;

// DOM elements
const form = document.getElementById('overtimeForm');
const calculateBtn = document.getElementById('calculateBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const formSection = document.getElementById('formSection');
const resultsSection = document.getElementById('resultsSection');
const counterSection = document.getElementById('counterSection');
const historySection = document.getElementById('historySection');
const loadingOverlay = document.getElementById('loadingOverlay');
const message = document.getElementById('message');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    try {
        // Ensure loading overlay is hidden on page load
        showLoading(false);
        
        initializeSocket();
        setupEventListeners();
        loadSessionHistory();
        loadOvertimeTracking();
        updateHourlyRateDisplay(); // Show initial hourly rate
    } catch (error) {
        console.error('Initialization error:', error);
        showLoading(false);
        showMessage('Error initializing application. Please refresh the page.', 'error');
    }
});

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    showLoading(false);
    showMessage('An error occurred. Please refresh the page.', 'error');
});

// Initialize Socket.io connection
function initializeSocket() {
    try {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            showMessage('Connection lost. Please refresh the page.', 'error');
        });
        
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            showMessage('Connection error. Please refresh the page.', 'error');
        });
        
        socket.on('session-data', (session) => {
            updateSessionDisplay(session);
        });
        
        socket.on('earnings-update', (data) => {
            updateCounterDisplay(data);
        });
        
        socket.on('session-complete', (data) => {
            handleSessionComplete(data);
        });
    } catch (error) {
        console.error('Socket initialization error:', error);
        showMessage('Failed to connect to server. Please refresh the page.', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Form submission
    form.addEventListener('submit', handleFormSubmit);
    
    // Calculate button
    calculateBtn.addEventListener('click', handleCalculate);
    
    // Stop button
    stopBtn.addEventListener('click', handleStop);
    
    // Input validation and hourly rate calculation
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            validateForm();
            updateHourlyRateDisplay();
        });
    });
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (isCounterRunning) {
        showMessage('Please stop the current session before starting a new one.', 'error');
        return;
    }
    
    await startOvertimeSession();
}

// Handle calculate button
async function handleCalculate() {
    const formData = getFormData();
    if (!formData) return;
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayCalculationResults(result.calculation, result.warnings);
            showMessage('Calculation completed successfully!', 'success');
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        showMessage('Error calculating overtime pay. Please try again.', 'error');
        console.error('Calculation error:', error);
    } finally {
        showLoading(false);
    }
}

// Start overtime session
async function startOvertimeSession() {
    const formData = getFormData();
    if (!formData) return;
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/start-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentSession = result.sessionId;
            isCounterRunning = true;
            
            // Join the session room
            socket.emit('join-session', currentSession);
            
            // Update UI
            displayCalculationResults(result.calculation, result.warnings);
            showCounterSection();
            showMessage('Overtime session started!', 'success');
            
            // Disable form inputs
            disableFormInputs(true);
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        showMessage('Error starting session. Please try again.', 'error');
        console.error('Session start error:', error);
    } finally {
        showLoading(false);
    }
}

// Stop overtime session
async function handleStop() {
    if (!currentSession) return;
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/stop-session/${currentSession}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            isCounterRunning = false;
            currentSession = null;
            
            // Update UI
            showFormSection();
            disableFormInputs(false);
            loadSessionHistory();
            loadOvertimeTracking();
            showMessage('Session stopped successfully!', 'success');
        } else {
            showMessage(result.error, 'error');
        }
    } catch (error) {
        showMessage('Error stopping session. Please try again.', 'error');
        console.error('Session stop error:', error);
    } finally {
        showLoading(false);
    }
}

// Get form data
function getFormData() {
    const formData = new FormData(form);
    const salary = parseFloat(formData.get('salary'));
    const dailyHours = parseFloat(formData.get('dailyHours'));
    
    // Calculate hourly rate
    const hourlyRate = salary && dailyHours && salary > 0 && dailyHours > 0 
        ? salary / (30 * dailyHours) 
        : 0;
    
    const hoursValue = formData.get('hours');
    const hours = hoursValue ? parseFloat(hoursValue) : null;
    
    const data = {
        hourlyRate,
        overtimeType: formData.get('overtimeType'),
        hours: hours
    };
    
    // Validate required fields
    if (!salary || !dailyHours || !data.overtimeType) {
        showMessage('Please fill in salary, daily hours, and overtime type.', 'error');
        return null;
    }
    
    // Validate salary
    if (salary <= 0) {
        showMessage('Salary must be greater than 0.', 'error');
        return null;
    }
    
    // Validate daily hours
    if (dailyHours <= 0 || dailyHours > 24) {
        showMessage('Daily hours must be between 0.5 and 24.', 'error');
        return null;
    }
    
    // Validate hours (if provided)
    if (hours !== null && hours <= 0) {
        showMessage('Overtime hours must be greater than 0.', 'error');
        return null;
    }
    
    return data;
}

// Update hourly rate display
function updateHourlyRateDisplay() {
    const salary = parseFloat(document.getElementById('salary').value);
    const dailyHours = parseFloat(document.getElementById('dailyHours').value);
    
    if (salary && dailyHours && salary > 0 && dailyHours > 0) {
        const hourlyRate = salary / (30 * dailyHours);
        document.querySelector('.rate-amount').textContent = `ETB ${hourlyRate.toFixed(2)}`;
    } else {
        document.querySelector('.rate-amount').textContent = 'ETB 0.00';
    }
}

// Validate form in real-time
function validateForm() {
    const formData = getFormData();
    const isValid = formData !== null;
    
    startBtn.disabled = !isValid;
    calculateBtn.disabled = !isValid;
}

// Display calculation results
function displayCalculationResults(calculation, warnings = []) {
    document.getElementById('hourlyRate').textContent = `ETB ${calculation.hourlyRate.toFixed(2)}`;
    document.getElementById('multiplier').textContent = `${calculation.multiplier}x`;
    document.getElementById('totalPay').textContent = `ETB ${calculation.totalPay.toFixed(2)}`;
    document.getElementById('ratePerSecond').textContent = `ETB ${calculation.ratePerSecond.toFixed(4)}`;
    
    // Display warnings if any
    displayWarnings(warnings);
    
    showResultsSection();
}

// Display warnings
function displayWarnings(warnings) {
    const warningsContainer = document.getElementById('warningsContainer');
    
    if (warnings && warnings.length > 0) {
        warningsContainer.innerHTML = warnings.map(warning => 
            `<div class="warning-message">
                <i class="fas fa-exclamation-triangle"></i>
                ${warning}
            </div>`
        ).join('');
    } else {
        warningsContainer.innerHTML = '';
    }
}

// Update session display
function updateSessionDisplay(session) {
    if (session.isActive) {
        showCounterSection();
    }
}

// Update counter display
function updateCounterDisplay(data) {
    const earningsElement = document.getElementById('currentEarnings');
    const elapsedElement = document.getElementById('elapsedTime');
    const remainingElement = document.getElementById('remainingTime');
    const progressElement = document.getElementById('progressFill');
    
    // Update earnings with animation
    earningsElement.textContent = `ETB ${data.currentEarnings.toFixed(2)}`;
    earningsElement.classList.add('updating');
    setTimeout(() => earningsElement.classList.remove('updating'), 500);
    
    // Update time displays
    elapsedElement.textContent = formatTime(data.elapsedTime);
    
    if (data.isOpenEnded) {
        remainingElement.textContent = '∞ (Open-ended)';
        remainingElement.style.color = '#28a745';
        progressElement.style.width = '0%'; // No progress bar for open-ended
    } else {
        remainingElement.textContent = formatTime(data.remainingTime);
        remainingElement.style.color = '#333';
        
        // Update progress bar
        const totalTime = data.elapsedTime + data.remainingTime;
        const progress = (data.elapsedTime / totalTime) * 100;
        progressElement.style.width = `${Math.min(progress, 100)}%`;
    }
}

// Handle session completion
function handleSessionComplete(data) {
    isCounterRunning = false;
    currentSession = null;
    
    // Update final display
    document.getElementById('currentEarnings').textContent = `ETB ${data.finalEarnings.toFixed(2)}`;
    document.getElementById('elapsedTime').textContent = formatTime(data.totalDuration);
    document.getElementById('remainingTime').textContent = '00:00:00';
    document.getElementById('remainingTime').style.color = '#333';
    document.getElementById('progressFill').style.width = '100%';
    
    // Show completion message
    showMessage('Overtime session completed!', 'success');
    
    // Return to form after delay
    setTimeout(() => {
        showFormSection();
        disableFormInputs(false);
        loadSessionHistory();
        loadOvertimeTracking();
    }, 3000);
}

// Format time in HH:MM:SS format
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Show/hide sections
function showFormSection() {
    formSection.style.display = 'block';
    resultsSection.style.display = 'none';
    counterSection.style.display = 'none';
}

function showResultsSection() {
    formSection.style.display = 'block';
    resultsSection.style.display = 'block';
    counterSection.style.display = 'none';
}

function showCounterSection() {
    formSection.style.display = 'none';
    resultsSection.style.display = 'none';
    counterSection.style.display = 'block';
}

// Disable/enable form inputs
function disableFormInputs(disable) {
    const inputs = form.querySelectorAll('input, select, button');
    inputs.forEach(input => {
        if (input.id !== 'stopBtn') {
            input.disabled = disable;
        }
    });
    
    if (disable) {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
    } else {
        startBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'none';
    }
}

// Load session history
async function loadSessionHistory() {
    try {
        const response = await fetch('/api/sessions');
        const result = await response.json();
        
        if (result.success) {
            displaySessionHistory(result.sessions);
        }
    } catch (error) {
        console.error('Error loading session history:', error);
    }
}

// Load overtime tracking
async function loadOvertimeTracking() {
    try {
        const response = await fetch('/api/overtime-tracking');
        const result = await response.json();
        
        if (result.success) {
            displayOvertimeTracking(result.tracking, result.limits);
        }
    } catch (error) {
        console.error('Error loading overtime tracking:', error);
    }
}

// Display overtime tracking
function displayOvertimeTracking(tracking, limits) {
    document.getElementById('weeklyHours').textContent = `${tracking.weekly.toFixed(1)} hours`;
    document.getElementById('yearlyHours').textContent = `${tracking.yearly.toFixed(1)} hours`;
    
    // Add visual indicators for approaching limits
    const weeklyElement = document.getElementById('weeklyHours').parentElement;
    const yearlyElement = document.getElementById('yearlyHours').parentElement;
    
    // Reset classes
    weeklyElement.className = 'tracking-item';
    yearlyElement.className = 'tracking-item';
    
    // Check weekly limit
    if (tracking.weekly >= limits.MAX_HOURS_PER_WEEK) {
        weeklyElement.classList.add('limit-exceeded');
    } else if (tracking.weekly >= limits.MAX_HOURS_PER_WEEK * 0.8) {
        weeklyElement.classList.add('limit-warning');
    }
    
    // Check yearly limit
    if (tracking.yearly >= limits.MAX_HOURS_PER_YEAR) {
        yearlyElement.classList.add('limit-exceeded');
    } else if (tracking.yearly >= limits.MAX_HOURS_PER_YEAR * 0.8) {
        yearlyElement.classList.add('limit-warning');
    }
}

// Display session history
function displaySessionHistory(sessions) {
    const historyList = document.getElementById('historyList');
    
    if (sessions.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No sessions found</p>';
        historySection.style.display = 'none';
        return;
    }
    
    // Sort sessions by start time (newest first)
    sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    historyList.innerHTML = sessions.map(session => {
        const startTime = new Date(session.startTime).toLocaleString();
        const duration = session.duration ? formatTime(session.duration) : 'In Progress';
        const earnings = session.currentEarnings || session.calculation.totalPay;
        const status = session.isActive ? 'Active' : 'Completed';
        const statusClass = session.isActive ? 'active' : 'completed';
        const hourlyRate = session.hourlyRate || session.calculation?.hourlyRate || 0;
        const isOpenEnded = session.isOpenEnded || !session.totalHours;
        const sessionType = isOpenEnded ? 'Open-ended' : 'Fixed Duration';
        
        return `
            <div class="history-item">
                <div class="history-details">
                    <div><strong>${session.overtimeType.charAt(0).toUpperCase() + session.overtimeType.slice(1)} Overtime</strong></div>
                    <div style="font-size: 0.9rem; color: #666;">Started: ${startTime}</div>
                    <div style="font-size: 0.9rem; color: #666;">Duration: ${duration}</div>
                    <div style="font-size: 0.9rem; color: #666;">Type: ${sessionType}</div>
                    <div style="font-size: 0.9rem; color: #666;">Hourly Rate: ETB ${hourlyRate.toFixed(2)}</div>
                    <div style="font-size: 0.9rem; color: #666;">Status: <span class="${statusClass}">${status}</span></div>
                </div>
                <div class="history-amount">ETB ${earnings.toFixed(2)}</div>
            </div>
        `;
    }).join('');
    
    historySection.style.display = 'block';
}

// Show loading overlay
function showLoading(show) {
    debugLog(`showLoading called with: ${show}`);
    if (show) {
        loadingOverlay.classList.remove('hidden');
        debugLog('Loading overlay shown');
        // Auto-hide after 10 seconds as safety measure
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            debugLog('Loading overlay auto-hidden after 10 seconds');
        }, 10000);
    } else {
        loadingOverlay.classList.add('hidden');
        debugLog('Loading overlay hidden');
    }
}

// Show message
function showMessage(text, type = 'info') {
    message.textContent = text;
    message.className = `message ${type}`;
    message.classList.add('show');
    
    setTimeout(() => {
        message.classList.remove('show');
    }, 5000);
}

// Debug function
function debugLog(message) {
    console.log('[DEBUG]', message);
}

// Initialize form validation
validateForm();

// Add debug info
debugLog('Script loaded successfully');
debugLog('Loading overlay element:', loadingOverlay);
debugLog('Loading overlay classes:', loadingOverlay ? loadingOverlay.className : 'not found');
