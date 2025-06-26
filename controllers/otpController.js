const otp = require('../models/otpModel');
const admin = require('../models/adminModel');
const guest = require('../models/guestModel');
const employee = require('../models/employeeModel');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const cron = require('node-cron');
require('dotenv').config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const generateOTP = () => crypto.randomInt(100000, 999999);

// Cron job to clean expired OTPs every minute
cron.schedule('* * * * *', async () => {
  try {
    await otp.deleteMany({ expiresAt: { $lt: new Date() } });
  } catch (error) {
    console.error('Error deleting expired OTPs:', error);
  }
});

exports.sendOtpRegistration = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const existing = await Promise.any([
      admin.findOne({ email }),
      guest.findOne({ email }),
      employee.findOne({ email })
    ]).catch(() => null);

    if (existing) return res.status(400).json({ message: 'Email already in use' });

    await otp.deleteMany({ email });
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60000);

    await otp.create({ email, otp: code, expiresAt });

    await sgMail.send({
      to: email,
      from: {
        name: 'Betcha Booking',
        email: 'betcha.booking@outlook.com'
      },
      subject: 'OTP for Registration',
      html: ` 
            <html>
                <body style="font-family: Arial, sans-serif; background-color: #f4f7fa; margin: 0; padding: 0;">
                    <table role="presentation" style="width: 100%; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); max-width: 600px; margin: 30px auto;">
                        <tr>
                            <td style="padding: 20px; text-align: center; border-bottom: 2px solid #f0f0f0;">
                                <h2 style="font-size: 24px; color: #333333; margin: 0;">Betcha Booking</h2>
                                <p style="font-size: 16px; color: #777777; margin-top: 5px;">Your OTP Code</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px; text-align: center;">
                                <h3 style="font-size: 28px; color: #4CAF50; margin-bottom: 20px;">${code}</h3>
                                <p style="font-size: 16px; color: #555555; margin: 0;">Please use the OTP above to verify your identity.</p>
                                <p style="font-size: 14px; color: #777777; margin-top: 15px;">If you did not request this OTP, please ignore this email.</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px; text-align: center; background-color: #f4f7fa; border-top: 2px solid #f0f0f0;">
                                <p style="font-size: 12px; color: #777777; margin: 0;">Betcha Booking © 2025</p>
                            </td>
                        </tr>
                    </table>
                </body>
            </html>
        `
    });

    res.status(201).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP Registration Error:', error);
    res.status(500).json({ message: 'Error sending OTP', error: error.message });
  }
};

exports.sendOtpForgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const existing = await Promise.any([
      admin.findOne({ email }),
      guest.findOne({ email }),
      employee.findOne({ email })
    ]).catch(() => null);

    if (!existing) return res.status(404).json({ message: 'Email not found' });

    await otp.deleteMany({ email });
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60000);

    await otp.create({ email, otp: code, expiresAt });

    await sgMail.send({
      to: email,
      from: {
        name: 'Betcha Booking',
        email: 'betcha.booking@outlook.com'
      },
      subject: 'OTP for Password Reset',
      html: ` 
            <html>
                <body style="font-family: Arial, sans-serif; background-color: #f4f7fa; margin: 0; padding: 0;">
                    <table role="presentation" style="width: 100%; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); max-width: 600px; margin: 30px auto;">
                        <tr>
                            <td style="padding: 20px; text-align: center; border-bottom: 2px solid #f0f0f0;">
                                <h2 style="font-size: 24px; color: #333333; margin: 0;">Betcha Booking</h2>
                                <p style="font-size: 16px; color: #777777; margin-top: 5px;">Your OTP Code</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px; text-align: center;">
                                <h3 style="font-size: 28px; color: #4CAF50; margin-bottom: 20px;">${code}</h3>
                                <p style="font-size: 16px; color: #555555; margin: 0;">Please use the OTP above to reset your password.</p>
                                <p style="font-size: 14px; color: #777777; margin-top: 15px;">If you did not request this OTP, please ignore this email.</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px; text-align: center; background-color: #f4f7fa; border-top: 2px solid #f0f0f0;">
                                <p style="font-size: 12px; color: #777777; margin: 0;">Betcha Booking © 2025</p>
                            </td>
                        </tr>
                    </table>
                </body>
            </html>
        `
    });

    res.status(201).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP Forgot Password Error:', error);
    res.status(500).json({ message: 'Error sending OTP', error: error.message });
  }
};

exports.verifyOtp = async (req, res) => {
  const { email, otp: inputOtp } = req.body;

  if (!email || !inputOtp) {
    return res.status(400).json({ message: 'Email and OTP are required' });
  }

  try {
    const record = await otp.findOne({ email });

    if (!record) return res.status(404).json({ message: 'OTP not found' });
    if (record.expiresAt < new Date()) return res.status(400).json({ message: 'OTP expired' });
    if (record.otp.toString() !== inputOtp.toString()) return res.status(400).json({ message: 'Incorrect OTP' });

    await otp.deleteMany({ email });

    await sgMail.send({
      to: email,
      from: {
        name: 'Betcha Booking',
        email: 'betcha.booking@outlook.com'
      },
    subject: 'Welcome to Betcha by Homie House Booking!',
    html: `
        <html>
            <head>
                <style>
                    body {
                        font-family: 'Arial', sans-serif;
                        color: #fff;
                        background-color: #f4f4f4;
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        width: 100%;
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #fff;
                        padding: 20px;
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                    }
                    h1 {
                        font-size: 24px;
                        color: #2a9d8f;
                        text-align: center;
                    }
                    p {
                        font-size: 16px;
                        line-height: 1.5;
                        margin-bottom: 20px;
                        color: #333;
                    }
                    .cta-buttons-container {
                        text-align: center;
                        margin-top: 20px;
                    }
                    .cta-button {
                        display: inline-block;
                        background-color: #2a9d8f;
                        color: #fff; /* Text color inside the button */
                        text-align: center;
                        padding: 12px 30px;
                        font-size: 16px;
                        text-decoration: none;
                        border-radius: 4px;
                        margin: 10px;
                    }
                    /* Ensure that links inside the footer or buttons don't appear blue */
                    a {
                        color: #fff !important; 
                        text-decoration: none; 
                    }
                    .footer {
                        text-align: center;
                        font-size: 14px;
                        color: #888;
                        padding: 20px;
                    }
                    .footer a {
                        color: #2a9d8f; /* Color for footer links */
                    }
                        #footer-links a {
                        color: #2a9d8f !important; 
                        text-decoration: none; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Welcome to Betcha by Homie House Booking!</h1>
                    <p>Hello,</p>
                    <p>Thank you for signing up with Betcha by Homie House Booking! We are thrilled to have you as part of our community. You can now browse and make bookings at your convenience.</p>
                    <p>If you have any questions or need assistance, don't hesitate to reach out to us.</p>

                    <div class="cta-buttons-container">
                        <p><a href="https://www.facebook.com/betchabyhomiehouse" class="cta-button">Visit Our Social Media</a></p>
                        <p><a href="https://beta-betcha-booking.netlify.app/" class="cta-button">Visit Our Website</a></p>
                    </div>

                    <div class="footer">
                        <p>Best regards,</p>
                        <p>The Betcha Team</p>
                        <p id="footer-links"><a href="https://beta-betcha-booking.netlify.app/">Visit Our Website</a> | <a href="mailto:support@betcha.com">Contact Support</a></p>
                        <p>&copy; 2025 Betcha by Homie House Booking, All Rights Reserved.</p>
                    </div>
                </div>
            </body>
        </html>
    `
    });

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({ message: 'Error verifying OTP', error: error.message });
  }
};

exports.resendOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    await otp.deleteMany({ email });
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60000);

    await otp.create({ email, otp: code, expiresAt });

    await sgMail.send({
      to: email,
      from: {
        name: 'Betcha Booking',
        email: 'betcha.booking@outlook.com'
      },
      subject: 'Resent OTP',
      html: ` 
            <html>
                <body style="font-family: Arial, sans-serif; background-color: #f4f7fa; margin: 0; padding: 0;">
                    <table role="presentation" style="width: 100%; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); max-width: 600px; margin: 30px auto;">
                        <tr>
                            <td style="padding: 20px; text-align: center; border-bottom: 2px solid #f0f0f0;">
                                <h2 style="font-size: 24px; color: #333333; margin: 0;">Betcha Booking</h2>
                                <p style="font-size: 16px; color: #777777; margin-top: 5px;">Your OTP Code</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px; text-align: center;">
                                <h3 style="font-size: 28px; color: #4CAF50; margin-bottom: 20px;">${code}</h3>
                                <p style="font-size: 16px; color: #555555; margin: 0;">Please use the OTP above to verify your identity.</p>
                                <p style="font-size: 14px; color: #777777; margin-top: 15px;">If you did not request this OTP, please ignore this email.</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px; text-align: center; background-color: #f4f7fa; border-top: 2px solid #f0f0f0;">
                                <p style="font-size: 12px; color: #777777; margin: 0;">Betcha Booking © 2025</p>
                            </td>
                        </tr>
                    </table>
                </body>
            </html>
        `
    });

    res.status(201).json({ message: 'OTP resent successfully' });
  } catch (error) {
    console.error('Resend OTP Error:', error);
    res.status(500).json({ message: 'Error resending OTP', error: error.message });
  }
};

exports.BookingMessage = async (req, res) => {
    const { email, amount, typeOfPayment, methodOfPayment, unitName, checkIn, checkOut } = req.body;

    try {
        const msg = {
            to: email,
            from: {
              name: 'Betcha Booking',
              email: 'betcha.booking@outlook.com'
            },
            subject: 'Booking Confirmation - Betcha by Homie House Booking',
            html:`
                <html>
                    <body style="font-family: Arial, sans-serif; background-color: #f4f7fa; margin: 0; padding: 0;">
                        <table role="presentation" style="width: 100%; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); max-width: 600px; margin: 30px auto;">
                            <tr>
                                <td style="padding: 20px; text-align: center; border-bottom: 2px solid #f0f0f0;">
                                    <h2 style="font-size: 24px; color: #333333; margin: 0;">Betcha by Homie House Booking</h2>
                                    <p style="font-size: 16px; color: #777777; margin-top: 5px;">Your Booking Confirmation</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 20px;">
                                    <p style="font-size: 16px; color: #333333;">Dear Valued Customer,</p>
                                    <p style="font-size: 16px; color: #333333;">
                                        Congratulations! You've successfully booked <strong>${unitName}</strong>. Below are your booking details:
                                    </p>
                                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                                        <tr>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;">Amount Paid:</td>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;"><strong>${amount} PHP</strong></td>
                                        </tr>
                                        <tr>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;">Payment Type:</td>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;"><strong>${typeOfPayment}</strong></td>
                                        </tr>
                                        <tr>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;">Payment Method:</td>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;"><strong>${methodOfPayment}</strong></td>
                                        </tr>
                                        <tr>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;">Check-In Date:</td>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;"><strong>${checkIn}</strong></td>
                                        </tr>
                                        <tr>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;">Check-Out Date:</td>
                                            <td style="font-size: 14px; padding: 10px; border: 1px solid #ddd;"><strong>${checkOut}</strong></td>
                                        </tr>
                                    </table>
                                    <p style="font-size: 16px; color: #333333;">
                                        Should you have any questions or require further assistance, please do not hesitate to contact us. We look forward to hosting you.
                                    </p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 20px; text-align: center; background-color: #f4f7fa; border-top: 2px solid #f0f0f0;">
                                    <p style="font-size: 12px; color: #777777; margin: 0;">Betcha Booking © 2025</p>
                                    <p style="font-size: 12px; color: #777777; margin: 0;">Visit us at <a href="https://beta-betcha-booking.netlify.app/" style="color: #4CAF50;">Betcha by Homie House</a></p>
                                </td>
                            </tr>
                        </table>
                    </body>
                </html>
            `,
        };

        await sgMail.send(msg);
        res.status(200).send({ message: 'Booking confirmation email sent successfully!' });
        console.log('Booking confirmation sent to:', email);
    } catch (error) {
        console.error('Error sending booking confirmation:', error);
        res.status(500).send({ error: 'Failed to send booking confirmation email', details: error.message });
    }
};

exports.cancellationMessage = async (req, res) => {
  const { email, unitName, checkIn, checkOut, message, amount } = req.body;

  if (!email || !unitName || !checkIn || !checkOut || !message || !amount) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  try {
    await sgMail.send({
      to: email,
      from: {
        name: 'Betcha Booking',
        email: 'betcha.booking@outlook.com'
      },
      subject: 'Booking Cancellation Notice - Betcha by Homie House',
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f4f7fa; margin: 0; padding: 0;">
            <table role="presentation" style="width: 100%; max-width: 600px; margin: 30px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <tr>
                <td style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0;">
                  <h2 style="font-size: 24px; color: #e63946;">Booking Cancelled</h2>
                  <p style="font-size: 16px; color: #555;">We regret to inform you that your booking has been cancelled.</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px;">
                  <p style="font-size: 16px; color: #333;">Dear Valued Guest,</p>
                  <p style="font-size: 16px; color: #333;">
                    Your booking for <strong>${unitName}</strong> has been cancelled. Below are your booking details:
                  </p>

                  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr>
                      <td style="padding: 10px; border: 1px solid #ddd;">Check-In:</td>
                      <td style="padding: 10px; border: 1px solid #ddd;"><strong>${checkIn}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding: 10px; border: 1px solid #ddd;">Check-Out:</td>
                      <td style="padding: 10px; border: 1px solid #ddd;"><strong>${checkOut}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding: 10px; border: 1px solid #ddd;">Refund Amount:</td>
                      <td style="padding: 10px; border: 1px solid #ddd;"><strong>₱${amount}</strong></td>
                    </tr>
                  </table>

                  <p style="font-size: 16px; color: #333;"><strong>Reason:</strong> ${message}</p>

                  <p style="font-size: 16px; color: #333;">
                    The refund of <strong>₱${amount}</strong> will be processed within 24 to 48 hours. If you have any questions, feel free to contact our support team.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px; text-align: center; background-color: #f4f7fa; border-top: 2px solid #f0f0f0;">
                  <p style="font-size: 12px; color: #777;">Betcha Booking © 2025</p>
                  <p style="font-size: 12px; color: #777;">Visit us at <a href="https://beta-betcha-booking.netlify.app/" style="color: #2a9d8f;">Betcha by Homie House</a></p>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Cancellation email sent successfully!' });
  } catch (error) {
    console.error('Error sending cancellation message:', error);
    res.status(500).json({ error: 'Failed to send cancellation email', details: error.message });
  }
};
