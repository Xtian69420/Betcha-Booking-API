require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const exportsDir = path.join(__dirname, 'exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir);
}
app.use('/exports', express.static(exportsDir));

const dburl = process.env.DATABASE_URL;
mongoose.connect(dburl, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', (error) => console.error(error));
db.once('open', async () => {
  console.log('Connected to MongoDB');

  const Counter = require('./models/counterModel'); 
  try {
    const existing = await Counter.findOne({ name: 'booking' });
    if (!existing) {
      await new Counter({ name: 'booking', value: 0 }).save();
      console.log('Booking counter initialized.');
    } else {
      console.log('Booking counter already exists.');
    }
  } catch (err) {
    console.error('Error initializing booking counter:', err);
  }
});

const routes = require('./routes/routes');
app.use('/', routes);

app.listen(3000, () => console.log('Server Started on port 3000'));