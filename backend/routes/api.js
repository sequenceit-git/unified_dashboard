const express = require('express')
const Item = require('../models/Item')

const router = express.Router()

router.get('/health', (req, res) => {
  res.json({ message: 'OK — backend is running' })
})

router.get('/items', async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 })
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/items', async (req, res) => {
  try {
    const item = await Item.create({ name: req.body.name })
    res.status(201).json(item)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
