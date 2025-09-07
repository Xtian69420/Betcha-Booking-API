# Betcha-Booking-API

Capstone Project: Backend of Betcha Booking

## Getting Started

1. **Clone the repository:**
	```bash
	git clone <repo-url>
	cd Betcha-Booking-API
	```
2. **Install dependencies:**
	```bash
	npm install
	```
3. **Set up environment variables:**
	- Create a `.env` file and add your configuration (e.g., MongoDB URI, SendGrid API key, etc.)
4. **Run the server:**
	```bash
	npm start
	```

## API Endpoints

All endpoints are prefixed by `/` (root). Most endpoints accept and return JSON. File uploads use `multipart/form-data`.

---

### Guest Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /guest/create | Create a new guest (with profile picture) |
| GET    | /guest/display/:id | Get guest by ID |
| GET    | /guest/display | Get all guests |
| PUT    | /guest/archive/:id | Archive guest |
| PUT    | /guest/update/:id | Update guest info |
| PUT    | /guest/update/pfp/:id | Update guest profile picture |
| PUT    | /guest/unarchive/:id | Unarchive guest |
| PATCH  | /guest/addWarning/:id | Add warning to guest |

### Admin Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /admin/create | Create admin (with profile picture) |
| GET    | /admin/display | Get all admins |
| GET    | /admin/display/:id | Get admin by ID |
| PUT    | /admin/update/:id | Update admin info |
| PUT    | /admin/update/pfp/:id | Update admin profile picture |
| DELETE | /admin/delete/:id | Delete admin |

### Employee Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /employee/create | Create employee (with profile picture) |
| GET    | /employee/display | Get all employees |
| GET    | /employee/display/:id | Get employee by ID |
| PUT    | /employee/update/:id | Update employee info |
| PUT    | /employee/update/pfp/:id | Update employee profile picture |
| PUT    | /employee/archive/:id | Archive employee |
| PUT    | /employee/unarchive/:id | Unarchive employee |
| DELETE | /employee/delete/:id | Delete employee |
| GET    | /employee/search | Search employees |
| GET    | /employee/privilege/tk | Get employees with TK privilege |

### Role Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /roles/create | Create role |
| PUT    | /roles/update/:id | Update role |
| DELETE | /roles/delete/:id | Delete role |
| GET    | /roles/employees/:name | Get employees by role |
| GET    | /roles/display | Get all roles |
| GET    | /roles/display/:id | Get role by ID |

### OTP & Auth Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /otp/register | Send OTP for registration |
| POST   | /otp/forgot-password | Send OTP for password reset |
| POST   | /otp/verify | Verify OTP |
| POST   | /otp/resend | Resend OTP |
| POST   | /auth/login | Login |
| PUT    | /auth/update-password | Update password |

### Property Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /property/create | Create property (with photos) |
| GET    | /property/search | Search properties (admin) |
| GET    | /property/display | Get all properties |
| GET    | /property/display/:id | Get property by ID |
| PUT    | /property/update/:id | Update property |
| PATCH  | /property/photos/append/:id | Add photos to property |
| DELETE | /property/photos/delete/:id | Delete property photo |
| PATCH  | /property/update/status/:id | Update property status |
| POST   | /property/searchGuest | Search properties (guest) |
| GET    | /cities | Get all cities |
| GET    | /property/byCategory | Get properties by category |

#### Maintenance
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /property/:id/maintenance/create | Add maintenance to property |
| PUT    | /property/:propertyId/maintenance/update-by-dates | Update maintenance by dates |
| DELETE | /property/:propertyId/maintenance/delete-by-dates | Delete maintenance by dates |

#### Property Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /property/:propertyId/report | Create property report |
| PATCH  | /property/:propertyId/report/edit-status | Edit report status |
| DELETE | /property/:propertyId/report/delete | Delete property report |

### Payment Platform Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /paymentPlatform/create | Create payment platform (with QR) |
| GET    | /payments/display | Get all payment platforms |
| GET    | /payments/display/:id | Get payment platform by ID |
| PUT    | /payments/update/:id | Update payment platform (with QR) |
| DELETE | /payments/delete/:id | Delete payment platform |

### Booking Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /booking/create | Create booking |
| PATCH  | /booking/update-status/:id | Update booking status |
| PATCH  | /booking/update-dates/:id | Update booking dates |
| GET    | /booking/status/:status | Get bookings by status |
| GET    | /booking/property/:propertyId | Get bookings by property |
| GET    | /booking/all | Get all bookings |
| GET    | /booking/top-properties | Get top properties |
| GET    | /booking/:id | Get booking by ID |
| GET    | /booking/trans/:transNo | Get booking by transaction number |
| DELETE | /booking/:id | Delete booking |
| PATCH  | /booking/payment/reservation/:id | Reservation payment |
| PATCH  | /booking/payment/package/:id | Package payment |
| PATCH  | /booking/payment/full/:id | Full payment |
| PATCH  | /booking/paymentChecking/reservation/:id | Approve/decline reservation payment |
| PATCH  | /booking/paymentChecking/package/:id | Approve/decline package payment |
| PATCH  | /booking/paymentChecking/fully-payment/:id | Approve/decline full payment |
| PUT    | /booking/rate/:id | Rate booking |
| GET    | /booking/guest/:guestId | Get bookings by guest |

### Email Notification Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /email/bookingmessage | Send booking confirmation email |
| POST   | /email/cancellationMessage | Send cancellation email |
| POST   | /email/checkin/today | Send check-in reminder email |

### Notification Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /notify/message | Send notification |
| POST   | /notify/cancellation | Send cancellation notification |
| PATCH  | /notify/seen/:id | Mark notification as seen |
| GET    | /notify/to/:toId | Get notifications for user |
| DELETE | /notify/:id | Delete notification |
| PATCH  | /notify/status-rejection/:id | Update status rejection |

### FAQ Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /faq/create | Create FAQ |
| GET    | /faq/getAll | Get all FAQs |
| PUT    | /faq/update/:id | Update FAQ |
| DELETE | /faq/delete/:id | Delete FAQ |
| GET    | /faq/five | Get 5 FAQs |

### Dashboard & Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /dashboard/admin/summary | Admin summary |
| POST   | /dashboard/admin/rankProperty | Rank property |
| GET    | /dashboard/admin/audit | Recent audit trails |
| GET    | /dashboard/admin/employee/activeCount | Active employee count |
| GET    | /dashboard/admin/guest/activeCount | Active guest count |
| GET    | /dashboard/admin/property/activeCount | Active property count |
| GET    | /dashboard/admin/booking/activeCount | Active booking count |
| GET    | /dashboard/admin/booking/todayCount | Today's booking count |
| GET    | /dashboard/admin/property/availableToday | Available rooms today |

### Landing Page & Featured Properties
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /landing/create | Create landing page |
| PUT    | /landing/update/:id | Update landing page |
| GET    | /landing/display/:id | Get landing page by ID |
| DELETE | /landing/delete/:id | Delete landing page |
| GET    | /landing/totalOfDaysBooked | Get total days booked |
| POST   | /featured/create | Create featured property |
| GET    | /featured/display | Get all featured properties |
| PUT    | /featured/update/:id | Update featured property |
| DELETE | /featured/delete/:id | Delete featured property |

### Guest Warning & Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /report | Create guest warning report |
| GET    | /reports | Get all guest warning reports |
| GET    | /reports/:guestId | Get guest warning reports by guest |
| PATCH  | /reset-warning/:guestId | Reset guest warnings |

### Audit Trail
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | /audit/create | Create audit trail |
| GET    | /audit/getAll | Get all audit trails |
| GET    | /audit/getAll/:userType | Get audit trails by user type |
| GET    | /audit/by-date/:date | Get audit by date |
| GET    | /audit/search | Search audit trails |

### Calendar
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /calendar/byProperty/:propertyId | Get calendar by property |
| POST   | /calendar/byProperties | Get calendar for multiple properties |
| GET    | /calendar/getAllProperties | Get all calendars for all properties |

### PSR, TS, PM, Chat, TK, OCR
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /psr/peakBooking | Get property with most peak bookings |
| GET    | /psr/peakBookingDay | Get peak booking day |
| GET    | /psr/transactions | Get PSR transactions |
| POST   | /psr/weekSummary | Generate week summary |
| POST   | /psr/monthSummary | Generate month summary |
| POST   | /psr/quarterSummary | Generate quarter summary |
| POST   | /psr/semiAnnualSummary | Generate semi-annual summary |
| POST   | /psr/AnnualSummary | Generate annual summary |
| POST   | /ts/transactionsByProperties | Get all pending/completed transactions by properties |
| POST   | /pm/bookings/byDateAndProperties | Get bookings by date and properties (PM) |
| POST   | /pm/bookings/checkinToday | Get today's check-ins (PM) |
| POST   | /chat | Chatbot flow |
| POST   | /tk/create | Create ticket |
| GET    | /tk/customer-service/:id | Get tickets by customer service ID |
| GET    | /tk/sender/:id | Get tickets by sender ID |
| GET    | /tk/all | Get all tickets |
| POST   | /tk/reply/:id | Reply to ticket |
| PATCH  | /tk/status/:id | Update ticket status |
| GET    | /tk/:id | Get ticket by ID |
| POST   | /ocr/scan/upload | OCR scan image upload |
| POST   | /ocr/scan/drivers-license | OCR scan driver's license |
| POST   | /ocr/scan/passport | OCR scan passport |

---

# License & Technology Stack

This backend is built using the following open-source technologies and libraries:

- **Node.js** (JavaScript runtime)
- **ExpressJS** (Web framework)
- **MongoDB** (Database)
- **Mongoose** (MongoDB ODM)
- **Multer** (File uploads)
- **@sendgrid/mail** (Email sending)
- **Sharp** (Image processing)
- **ExcelJS** (Excel file generation)
- **PDFKit** (PDF generation)
- **Axios** (HTTP requests)
- **node-cron** (Scheduled jobs)
- **openai** (AI integration)
- **cors** (CORS middleware)

All libraries are used under their respective open-source licenses. See each package's documentation for details.

This project itself is licensed under the ISC License (see `package.json`).

---

## Notes
- All endpoints return JSON unless otherwise specified.
- For file uploads, use `multipart/form-data` and the correct field name (e.g., `pfp`, `photo`, `image`, `file`).
- Some endpoints require authentication/authorization (implement as needed).
- For more details on request/response bodies, see the corresponding controller files.