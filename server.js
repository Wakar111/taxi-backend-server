import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory storage for bookings
const activeBookings = new Map();

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Generate a unique booking number
function generateBookingNumber() {
  const prefix = 'TB';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${timestamp}${random}`;
}

// Generate cancellation token
function generateCancellationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Booking endpoint
app.post('/api/book-ride', async (req, res) => {
  try {
    const bookingData = req.body;
    const bookingNumber = generateBookingNumber();
    const cancellationToken = generateCancellationToken();
    const cancellationUrl = `http://localhost:${port}/api/cancel-ride?token=${cancellationToken}`;

    // Store booking data
    activeBookings.set(cancellationToken, {
      bookingNumber,
      ...bookingData,
      timestamp: new Date().toISOString()
    });

    // Format date for email
    const formattedDateTime = bookingData.type === 'Scheduled Ride' && bookingData.dateTime !== 'As soon as possible'
      ? new Date(bookingData.dateTime).toLocaleString('en-US', {
          dateStyle: 'full',
          timeStyle: 'short'
        })
      : 'As soon as possible';

    // Email content for customer
    const customerMailOptions = {
      from: process.env.EMAIL_USER,
      to: bookingData.email,
      subject: `TaxiBoy - Booking Confirmation #${bookingNumber}`,
      html: `
        <h1>Your Ride Has Been Booked!</h1>
        <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="color: #1f2937; margin: 0;">Booking Number: ${bookingNumber}</h2>
        </div>
        <p>Thank you for choosing TaxiBoy. Here are your booking details:</p>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Booking Type:</strong> ${bookingData.type}</li>
          <li><strong>Pickup Location:</strong> ${bookingData.pickupLocation}</li>
          <li><strong>Destination:</strong> ${bookingData.destination}</li>
          <li><strong>Date/Time:</strong> ${formattedDateTime}</li>
          <li><strong>Vehicle Type:</strong> ${bookingData.vehicleType}</li>
          <li><strong>Name:</strong> ${bookingData.name}</li>
          <li><strong>Phone:</strong> ${bookingData.phone}</li>
          <li><strong>Email:</strong> ${bookingData.email}</li>
        </ul>
        <p>Please keep your booking number for future reference.</p>
        <div style="margin: 20px 0; padding: 15px; background-color: #fee2e2; border-radius: 5px;">
          <p style="margin: 0; color: #991b1b;">Need to cancel your ride?</p>
          <p style="margin: 5px 0;">Click the link below to cancel your booking:</p>
          <a href="${cancellationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 5px;">Cancel My Ride</a>
        </div>
        <p style="color: #6b7280; font-size: 0.875rem;">If you need any other modifications to your booking, please contact our support team.</p>
      `
    };

    // Email content for admin
    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `[ADMIN] New Booking #${bookingNumber}`,
      html: `
        <h1>New Booking Received</h1>
        <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="color: #1f2937; margin: 0;">Booking Number: ${bookingNumber}</h2>
        </div>
        <p>A new booking has been received. Details below:</p>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Booking Type:</strong> ${bookingData.type}</li>
          <li><strong>Pickup Location:</strong> ${bookingData.pickupLocation}</li>
          <li><strong>Destination:</strong> ${bookingData.destination}</li>
          <li><strong>Date/Time:</strong> ${formattedDateTime}</li>
          <li><strong>Vehicle Type:</strong> ${bookingData.vehicleType}</li>
          <hr>
          <li><strong>Customer Name:</strong> ${bookingData.name}</li>
          <li><strong>Customer Phone:</strong> ${bookingData.phone}</li>
          <li><strong>Customer Email:</strong> ${bookingData.email}</li>
        </ul>
        <p>Please assign a driver to this booking.</p>
      `
    };

    // Send confirmation emails to both customer and admin
    await Promise.all([
      transporter.sendMail(customerMailOptions),
      transporter.sendMail(adminMailOptions)
    ]);

    res.status(200).json({
      success: true,
      message: 'Booking confirmed! Check your email (spam folder) for details.',
      bookingNumber: bookingNumber
    });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process booking. Please try again.'
    });
  }
});

// Cancellation endpoint
app.get('/api/cancel-ride', async (req, res) => {
  try {
    const { token } = req.query;
    
    // Check if booking exists
    if (!activeBookings.has(token)) {
      return res.status(404).send('Booking not found or already cancelled.');
    }

    const booking = activeBookings.get(token);
    
    // Email content for customer cancellation confirmation
    const customerCancelMailOptions = {
      from: process.env.EMAIL_USER,
      to: booking.email,
      subject: `TaxiBoy - Booking Cancellation Confirmation #${booking.bookingNumber}`,
      html: `
        <h1>Your Ride Has Been Cancelled</h1>
        <div style="background-color: #fee2e2; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="color: #991b1b; margin: 0;">Booking #${booking.bookingNumber} has been cancelled</h2>
        </div>
        <p>Your booking has been successfully cancelled. Here are the details of the cancelled booking:</p>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Booking Number:</strong> ${booking.bookingNumber}</li>
          <li><strong>Name:</strong> ${booking.name}</li>
          <li><strong>Pickup Location:</strong> ${booking.pickupLocation}</li>
          <li><strong>Destination:</strong> ${booking.destination}</li>
        </ul>
        <p>If you need to book another ride, please visit our website.</p>
        <p>Thank you for choosing TaxiBoy!</p>
      `
    };

    // Email content for admin cancellation notification
    const adminCancelMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `[ADMIN] Booking Cancelled #${booking.bookingNumber}`,
      html: `
        <h1>Booking Cancellation Notice</h1>
        <div style="background-color: #fee2e2; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="color: #991b1b; margin: 0;">Booking #${booking.bookingNumber} has been cancelled</h2>
        </div>
        <p>A customer has cancelled their booking. Details below:</p>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Booking Number:</strong> ${booking.bookingNumber}</li>
          <li><strong>Customer Name:</strong> ${booking.name}</li>
          <li><strong>Customer Email:</strong> ${booking.email}</li>
          <li><strong>Customer Phone:</strong> ${booking.phone}</li>
          <li><strong>Pickup Location:</strong> ${booking.pickupLocation}</li>
          <li><strong>Destination:</strong> ${booking.destination}</li>
          <li><strong>Vehicle Type:</strong> ${booking.vehicleType}</li>
        </ul>
        <p>Please update the scheduling system accordingly.</p>
      `
    };

    // Send cancellation emails
    await Promise.all([
      transporter.sendMail(customerCancelMailOptions),
      transporter.sendMail(adminCancelMailOptions)
    ]);

    // Remove booking from storage
    activeBookings.delete(token);

    // Send success page
    res.send(`
      <html>
        <head>
          <title>Booking Cancelled</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 40px auto;
              padding: 20px;
              text-align: center;
            }
            .success-box {
              background-color: #fee2e2;
              border-radius: 8px;
              padding: 20px;
              margin: 20px 0;
            }
            .booking-number {
              font-size: 1.2em;
              font-weight: bold;
              color: #991b1b;
            }
          </style>
        </head>
        <body>
          <div class="success-box">
            <h1>Booking Cancelled Successfully</h1>
            <p class="booking-number">Booking #${booking.bookingNumber}</p>
          </div>
          <p>Your booking has been cancelled and you will receive a confirmation email shortly.</p>
          <p>Thank you for using TaxiBoy!</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Cancellation error:', error);
    res.status(500).send('Failed to cancel booking. Please try again or contact support.');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
