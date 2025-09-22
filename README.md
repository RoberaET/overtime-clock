# Ethiopian Overtime Clock

A real-time overtime money counter web application based on Ethiopian Labor Proclamation No. 1156/2019.

## Features

- **Real-time Counter**: Live updating overtime earnings display
- **Ethiopian Labor Law Compliance**: Strict adherence to Labor Proclamation No. 1156/2019
- **Multiple Overtime Types**: Normal Day, Night Shift, Sunday, and Public Holiday rates
- **Input Validation**: Enforces maximum overtime limits (4 hours/day, 12 hours/week, 100 hours/year)
- **Session Management**: Track and log overtime sessions
- **Mobile-Friendly**: Responsive design for all devices
- **Real-time Updates**: Socket.io powered live updates

## Overtime Rates (Labor Proclamation No. 1156/2019)

- **Normal Day**: 1.5x hourly rate
- **Night Shift**: 1.75x hourly rate  
- **Sunday**: 2.0x hourly rate
- **Public Holiday**: 2.5x hourly rate

## Overtime Limits

- Maximum 4 hours per day
- Maximum 12 hours per week
- Maximum 100 hours per year

## Installation

1. **Clone or download the project**
   ```bash
   cd "D:\Code\Overtime Clock"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

## Development

For development with auto-restart:
```bash
npm run dev
```

## Usage

1. **Enter your details**:
   - Monthly salary in ETB
   - Daily working hours (default: 8 hours)
   - **Your hourly rate is automatically calculated and displayed**
   - Select overtime type
   - Enter overtime hours (optional - leave empty for open-ended tracking)

2. **Calculate**: Click "Calculate" to see the breakdown (uses 1 hour for preview if no hours entered)

3. **Start Counter**: Click "Start Counter" to begin real-time tracking
   - **Open-ended**: Leave hours empty to track indefinitely
   - **Fixed duration**: Enter specific hours for time-limited tracking

4. **Monitor**: Watch your earnings update every second
   - **Open-ended sessions**: Show "∞ (Open-ended)" for remaining time
   - **Fixed sessions**: Show remaining time and progress bar

5. **Stop**: Click "Stop Counter" when done

## API Endpoints

- `POST /api/calculate` - Calculate overtime pay
- `POST /api/start-session` - Start overtime session
- `POST /api/stop-session/:id` - Stop overtime session
- `GET /api/sessions` - Get session history

## Technology Stack

- **Backend**: Node.js, Express.js
- **Real-time**: Socket.io
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Custom CSS with responsive design

## Calculation Method

- **Hourly Rate**: `Monthly Salary ÷ (30 days × Daily Working Hours)`
- **Overtime Pay**: `Hourly Rate × Overtime Multiplier × Overtime Hours`
- **Real-time Rate**: `Total Overtime Pay ÷ (Overtime Hours × 3600 seconds)`

### Example:
- Monthly Salary: 5,000 ETB
- Daily Working Hours: 8 hours
- Hourly Rate: 5,000 ÷ (30 × 8) = 20.83 ETB/hour
- 2 hours Normal Overtime: 20.83 × 1.5 × 2 = 62.50 ETB

## Legal Compliance

This application strictly follows Ethiopian Labor Proclamation No. 1156/2019 for overtime calculations and limits. All calculations are based on the official labor law requirements.

## License

MIT License
