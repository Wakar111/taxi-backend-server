// Import required dependencies
import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: `${__dirname}/.env` });

// Initialize Express app
const app = express();

// Configure CORS options
// In production, FRONTEND_URL should be set to your deployed frontend URL
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  optionsSuccessStatus: 200
};

// Apply middleware
app.use(cors(corsOptions));
app.use(express.json());

// Configure email transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD // This should be an app-specific password
  }
});

// Verify email configuration on server start
transporter.verify((error, success) => {
  if (error) {
    console.log("Transporter verification error:", error);
  } else {
    console.log("Server is ready to take our messages");
  }
});

// Health check endpoint for deployment platforms
app.get('/', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Main booking endpoint - handles ride booking requests
app.post('/api/book-ride', async (req, res) => {
  // Extract booking details from request body
  const {
    pickupLocation,
    destination,
    dateTime,
    phone,
    email,
    type
  } = req.body;

  // Log incoming booking request
  console.log('Received booking request:', {
    pickupLocation,
    destination,
    dateTime,
    phone,
    email,
    type
  });

  // Configure admin notification email
  const adminMailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: 'New Ride Booking - TaxiBoy',
    html: `
      <h2>New booking received!</h2>
      <p><strong>Ride Type:</strong> ${type}</p>
      <p><strong>Customer Details:</strong></p>
      <ul>
        <li>Email: ${email}</li>
        <li>Phone: ${phone}</li>
      </ul>
      <p><strong>Pickup Location:</strong> ${pickupLocation}</p>
      <p><strong>Destination:</strong> ${destination}</p>
      <p><strong>Date/Time:</strong> ${dateTime}</p>
    `
  };

  // Configure customer confirmation email
  const customerMailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your TaxiBoy Ride Booking Confirmation',
    html: `
      <h2>Thank you for booking with TaxiBoy!</h2>
      <p>Your booking details:</p>
      <ul>
        <li><strong>Ride Type:</strong> ${type}</li>
        <li><strong>Pickup Location:</strong> ${pickupLocation}</li>
        <li><strong>Destination:</strong> ${destination}</li>
        <li><strong>Date/Time:</strong> ${dateTime}</li>
      </ul>
      <p>We'll be in touch shortly to confirm your ride.</p>
      <p>If you need to modify your booking, please contact us.</p>
      <br>
      <p>Best regards,<br>TaxiBoy Team</p>
    `
  };

  try {
    // Send notification email to admin
    console.log('Attempting to send admin email...');
    const adminResult = await transporter.sendMail(adminMailOptions);
    console.log('Admin email sent:', adminResult);

    // Send confirmation email to customer
    console.log('Attempting to send customer email...');
    const customerResult = await transporter.sendMail(customerMailOptions);
    console.log('Customer email sent:', customerResult);
    
    // Return success response
    res.status(200).json({ message: 'Booking confirmed! Check your email for details.' });
  } catch (error) {
    // Log and return error response
    console.error('Detailed error sending emails:', error);
    res.status(500).json({ 
      message: 'Failed to process booking. Please try again.',
      error: error.message 
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
