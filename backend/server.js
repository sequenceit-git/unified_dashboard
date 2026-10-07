require('dotenv').config({ path: '.env.local' })
require('dotenv').config()
const cors = require('cors')
const express = require('express')
const connectDB = require('./config/db')
const apiRoutes = require('./routes/api')
const authRoutes = require('./routes/auth')
const dashboardRoutes = require('./routes/dashboard')

const app = express()
const PORT = process.env.PORT || 5000
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

app.use(cors({ origin: CLIENT_URL }))
app.use(express.json())

app.use('/api', apiRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/dashboard', dashboardRoutes)

connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`))
