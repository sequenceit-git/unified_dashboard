require('dotenv').config()
const cors = require('cors')
const express = require('express')
const connectDB = require('./config/db')
const apiRoutes = require('./routes/api')

const app = express()
const PORT = process.env.PORT || 5000
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

app.use(cors({ origin: CLIENT_URL }))
app.use(express.json())

app.use('/api', apiRoutes)

connectDB(process.env.MONGO_URI)
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`))
