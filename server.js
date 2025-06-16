require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const app = express();
const cors = require('cors');
const fs = require('fs');
const path = require('path');

app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// db
const dburl = process.env.DATABASE_URL;
mongoose.connect(dburl, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', (error) => console.error(error));
db.once('open', () => console.log('Connected to MongoDB'));

// routes
const routes = require('./routes/routes');

// Middleware
app.use(express.json()); 
app.use('/', routes); 

// Start server
app.listen(3000, () => console.log('Server Started on port 3000'));
