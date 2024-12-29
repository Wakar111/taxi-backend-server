import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Define base URL for API endpoints
const baseUrl = process.env.NODE_ENV === 'production'
  ? process.env.BASE_URL
  : `http://localhost:${port}`;

// Configure CORS options
const corsOptions = {
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', process.env.FRONTEND_URL].filter(Boolean), // Add your frontend URL
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));
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
    const cancellationUrl = `${baseUrl}/api/cancel-ride?token=${cancellationToken}`;

    // Store booking data
    activeBookings.set(cancellationToken, {
      bookingNumber,
      ...bookingData,
      timestamp: new Date().toISOString()
    });

    // Format date for email
    const formattedDateTime = bookingData.type === 'Geplante Fahrt' && bookingData.dateTime !== 'As soon as possible'
      ? new Date(bookingData.dateTime).toLocaleString('en-US', {
              dateStyle: 'full',
              timeStyle: 'short'
        })
      : 'Sofort';

    // Email content for customer
    const customerMailOptions = {
      from: process.env.EMAIL_USER,
      to: bookingData.email,
      subject: `TaxiBoy - Buchung Bestätigt #${bookingNumber}`,
      html: `
        <h1>Ihre Fahrt wurde gebucht!</h1>
        <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="color: #1f2937; margin: 0;">Buchungsnummer: ${bookingNumber}</h2>
        </div>
        <p>Vielen Dank für Ihre Wahl von TaxiBoy. Hier sind Ihre Buchungsdetails:</p>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Buchungsart:</strong> ${bookingData.type}</li>
          <li><strong>Abfahrtort:</strong> ${bookingData.pickupLocation}</li>
          <li><strong>Ziel:</strong> ${bookingData.destination}</li>
          <li><strong>Datum/Zeit:</strong> ${formattedDateTime}</li>
          <li><strong>Fahrzeugtyp:</strong> ${bookingData.vehicleType}</li>
          <li><strong>Name:</strong> ${bookingData.name}</li>
          <li><strong>Telefon:</strong> ${bookingData.phone}</li>
          <li><strong>E-Mail:</strong> ${bookingData.email}</li>
        </ul>
        <p>Bitte bewahren Sie Ihre Buchungsnummer für zukünftige Referenzen auf.</p>
        <div style="margin: 20px 0; padding: 15px; background-color: #fee2e2; border-radius: 5px;">
          <p style="margin: 0; color: #991b1b;">Möchten Sie Ihre Fahrt stornieren?</p>
          <p style="margin: 5px 0;">Klicken Sie auf den untenstehenden Link, um Ihre Buchung zu stornieren:</p>
          <a href="${cancellationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 5px;">Buchung Stornieren</a>
        </div>
        <p style="color: #6b7280; font-size: 0.875rem;">Wenn Sie weitere Änderungen an Ihrer Buchung benötigen, kontaktieren Sie bitte unser Support-Team.</p>
      `
    };

    // Email content for admin
    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `[ADMIN] Neue Buchung erhalten #${bookingNumber}`,
      html: `
        <h1>Neue Buchung erhalten</h1>
        <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="color: #1f2937; margin: 0;">Buchungsnummer: ${bookingNumber}</h2>
        </div>
        <p>Eine neuer Buchung wurde erhalten. Hier sind die Details der Buchung:</p>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Buchungstyp:</strong> ${bookingData.type}</li>
          <li><strong>Abfahrtort:</strong> ${bookingData.pickupLocation}</li>
          <li><strong>Zielort:</strong> ${bookingData.destination}</li>
          <li><strong>Datum/Uhrzeit:</strong> ${formattedDateTime}</li>
          <li><strong>Fahrzeug Type:</strong> ${bookingData.vehicleType}</li>
          <hr>
          <li><strong>Kunden Name:</strong> ${bookingData.name}</li>
          <li><strong>Kunden Phone:</strong> ${bookingData.phone}</li>
          <li><strong>Kunden Email:</strong> ${bookingData.email}</li>
        </ul>
        <p>Bitte aktualisieren Sie das Planungssystem entsprechend.</p>
      `
    };

    // Send confirmation emails to both customer and admin
    await Promise.all([
      transporter.sendMail(customerMailOptions),
      transporter.sendMail(adminMailOptions)
    ]);

    res.status(200).json({
      success: true,
      message: 'Buchung erfolgreich! Überprüfen Sie Ihre E-Mail (Spam-Ordner) für weitere Informationen.',
      bookingNumber: bookingNumber
    });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Buchen. Fehler beim Verarbeiten der Buchung. Bitte versuchen Sie es erneut.'
    });
  }
});

// Cancellation endpoint
app.get('/api/cancel-ride', async (req, res) => {
  try {
    const { token } = req.query;
    
    // Check if booking exists
    if (!activeBookings.has(token)) {
      return res.status(404).send('Buchung nicht gefunden oder bereits storniert.');
    }

    const booking = activeBookings.get(token);
    
    // Email content for customer cancellation confirmation
    const customerCancelMailOptions = {
      from: process.env.EMAIL_USER,
      to: booking.email,
      subject: `TaxiBoy - Buchungsstornierung Bestätigung #${booking.bookingNumber}`,
      html: `
        <h1>Ihre Fahrt wurde storniert</h1>
        <div style="background-color: #fee2e2; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="color: #991b1b; margin: 0;">Buchung #${booking.bookingNumber} wurde storniert</h2>
        </div>
        <p>Ihre Buchung wurde erfolgreich storniert. Hier sind die Details der stornierten Buchung:</p>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Buchungsnummer:</strong> ${booking.bookingNumber}</li>
          <li><strong>Name:</strong> ${booking.name}</li>
          <li><strong>Abfahrtort:</strong> ${booking.pickupLocation}</li>
          <li><strong>Zielort:</strong> ${booking.destination}</li>
        </ul>
        <p>Wenn Sie eine neue Fahrt buchen möchten, besuchen Sie bitte unsere Website.</p>
        <p>Vielen Dank, dass Sie sich für TaxiBoy entschieden haben!</p>
      `
    };

    // Email content for admin cancellation notification
    const adminCancelMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `[ADMIN] Buchung Storniert #${booking.bookingNumber}`,
      html: `
        <h1>Buchung storniert</h1>
        <div style="background-color: #fee2e2; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="color: #991b1b; margin: 0;">Buchung #${booking.bookingNumber} wurde storniert</h2>
        </div>
        <p>Eine Kunde hat seine Buchung storniert. Details unten:</p>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Buchungsnummer:</strong> ${booking.bookingNumber}</li>
          <li><strong>Kundenname:</strong> ${booking.name}</li>
          <li><strong>Kunden-E-Mail:</strong> ${booking.email}</li>
          <li><strong>Kunden-Telefon:</strong> ${booking.phone}</li>
          <li><strong>Abfahrtort:</strong> ${booking.pickupLocation}</li>
          <li><strong>Zielort:</strong> ${booking.destination}</li>
          <li><strong>Fahrzeugtyp:</strong> ${booking.vehicleType}</li>
        </ul>
        <p>Bitte aktualisieren Sie das Planungssystem entsprechend.</p>
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
          <title>Buchung storniert</title>
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
            <h1>Buchung erfolgreich storniert</h1>
            <p class="booking-number">Buchungsnummer #${booking.bookingNumber}</p>
          </div>
          <p>Ihre Buchung wurde erfolgreich storniert und Sie erhalten eine Bestätigungs-E-Mail kurzzeitig.</p>
          <p>Vielen Dank für die Nutzung von TaxiBoy!</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Buchung konnte nicht storniert werden:', error);
    res.status(500).send('Buchung konnte nicht storniert werden. Bitte versuchen Sie es erneut oder kontaktieren Sie den Support');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
